/**
 * Email fetching service
 *
 * Fetches emails from Gmail and stores them in Supabase Storage.
 *
 * NOT a server action: this module deliberately has no 'use server' so it is
 * never registered as a client-callable endpoint (#488). The trigger is chosen
 * by trusted server code only:
 *   - 'manual': called by the permission-guarded `fetchNewEmails` action.
 *   - 'cron': called by the cron route AFTER `verifyCronAuth` has passed.
 */

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import {
  getGmailClient,
  listMessagesByCriteria,
  getMessage,
  getAttachment,
  extractEmailMetadata,
  extractEmailBody,
  extractAttachments,
} from '@/lib/email-imports/gmail-client';
import { storeEmailAttachments } from '@/lib/email-imports/store-attachments';
import { checkAlertSender, type SenderCheck } from '@/lib/email-imports/sender-check';
import { updateGmailSyncStatus } from '@/lib/email-imports/gmail-sync-status';
import { insertEmailImport, writeEmailImportStatus } from '@/lib/email-imports/import-records';
import { logAudit } from '@/lib/audit/logger';
import { parseAllPendingEmails } from '@/lib/email-imports/parse-email';
import { processEmailTransactions } from '@/actions/email-imports/process-email-import';
import { matchEmailTransactions } from '@/lib/email-imports/process-email-matching';
import type { EmailImportTrigger, FetchEmailsOptions, FetchEmailsResult, EmailMessage, GmailSyncCriteria } from '@/types/database';

// ============================================================
// Detect Email Type
// ============================================================

function detectEmailType(
  subject: string | null,
  body: string | null,
  criteria?: { include_credits: boolean; include_debits: boolean }
): 'transaction_alert' | 'statement_attachment' | 'unknown' | 'filtered' {
  const subjectLower = (subject || '').toLowerCase();
  const bodyLower = (body || '').toLowerCase();

  // Transaction alert patterns
  const isCredit =
    subjectLower.includes('credit') ||
    bodyLower.includes('credit alert') ||
    bodyLower.includes('account credited') ||
    bodyLower.includes('has been credited');

  const isDebit =
    subjectLower.includes('debit') ||
    bodyLower.includes('debit alert') ||
    bodyLower.includes('account debited') ||
    bodyLower.includes('has been debited');

  if ((isCredit && criteria?.include_credits === false) || (isDebit && criteria?.include_debits === false)) {
    return 'filtered';
  }

  // Transaction alert patterns
  const alertPatterns = [
    'credit alert',
    'debit alert',
    'transaction alert',
    'account credited',
    'account debited',
    'has been credited',
    'has been debited',
    'ngn.*credited',
    'ngn.*debited',
  ];

  for (const pattern of alertPatterns) {
    const regex = new RegExp(pattern, 'i');
    if (regex.test(subjectLower) || regex.test(bodyLower)) {
      return 'transaction_alert';
    }
  }

  // Statement patterns (typically have PDF attachments)
  const statementPatterns = [
    'statement',
    'account statement',
    'e-statement',
    'estatement',
    'monthly statement',
  ];

  for (const pattern of statementPatterns) {
    if (subjectLower.includes(pattern) || bodyLower.includes(pattern)) {
      return 'statement_attachment';
    }
  }

  return 'unknown';
}

// ============================================================
// Store Email in Supabase Storage
// ============================================================

async function storeEmailContent(
  importId: string,
  messageId: string,
  content: {
    text: string | null;
    html: string | null;
  },
  attachments: Array<{
    id: string;
    filename: string;
    mimeType: string;
    data: Buffer;
  }>
): Promise<{
  rawContentPath: string | null;
  attachmentPaths: Array<{ name: string; path: string; size: number; mimeType: string }>;
  error: string | null;
}> {
  const adminClient = await createAdminClient();
  const basePath = `${importId}/${messageId}`;

  let rawContentPath: string | null = null;
  const attachmentPaths: Array<{ name: string; path: string; size: number; mimeType: string }> = [];

  try {
    // Store raw email content (prefer HTML, fallback to text)
    const rawContent = content.html || content.text;
    if (rawContent) {
      const contentPath = `${basePath}/content.${content.html ? 'html' : 'txt'}`;
      const { error: contentError } = await adminClient.storage
        .from('email-imports')
        .upload(contentPath, rawContent, {
          contentType: content.html ? 'text/html' : 'text/plain',
          upsert: true,
        });

      if (!contentError) {
        rawContentPath = contentPath;
      } else {
        console.error('Failed to upload email content:', contentError);
      }
    }

    // Store attachments
    const { stored, skipped } = await storeEmailAttachments(adminClient, basePath, attachments);
    attachmentPaths.push(...stored);
    for (const s of skipped) {
      console.error(`Skipped attachment ${s.name} for message ${messageId}: ${s.reason}`);
    }

    return { rawContentPath, attachmentPaths, error: null };
  } catch (error) {
    console.error('Failed to store email content:', error);
    return {
      rawContentPath: null,
      attachmentPaths: [],
      error: error instanceof Error ? error.message : 'Failed to store email',
    };
  }
}

// ============================================================
// Create Email Message Record
// ============================================================

async function createEmailMessage(params: {
  emailImportId: string;
  gmailMessageId: string;
  gmailThreadId: string | null;
  subject: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  receivedAt: Date | null;
  emailType: 'transaction_alert' | 'statement_attachment' | 'unknown';
  rawContentPath: string | null;
  attachments: Array<{ name: string; path: string; size: number; mimeType: string }>;
  senderCheck: SenderCheck;
}): Promise<{ data: EmailMessage | null; error: string | null }> {
  const adminClient = await createAdminClient();

  const { data, error } = await adminClient
    .from('email_messages')
    .insert({
      email_import_id: params.emailImportId,
      gmail_message_id: params.gmailMessageId,
      gmail_thread_id: params.gmailThreadId,
      subject: params.subject,
      from_address: params.fromAddress,
      to_address: params.toAddress,
      received_at: params.receivedAt?.toISOString(),
      email_type: params.emailType,
      raw_content_path: params.rawContentPath,
      attachments: params.attachments,
      sender_verified: params.senderCheck.verified,
      sender_check: params.senderCheck.detail,
      processing_status: 'pending',
    })
    .select()
    .single();

  if (error) {
    // Check if it's a duplicate
    if (error.code === '23505') {
      // Unique violation
      return { data: null, error: 'duplicate' };
    }
    return { data: null, error: error.message };
  }

  return { data: data as EmailMessage, error: null };
}

// ============================================================
// Main: Fetch New Emails
// ============================================================

export async function runEmailFetch(
  trigger: EmailImportTrigger,
  options: Omit<FetchEmailsOptions, 'trigger'> = {}
): Promise<FetchEmailsResult> {
  const {
    maxEmails = 50,
    sinceDays = 7,
  } = options;

  // Get Gmail client
  const gmail = await getGmailClient();
  if (!gmail) {
    await updateGmailSyncStatus({
      status: 'error',
      message: 'Gmail not connected or token expired',
    });
    return {
      success: false,
      importId: null,
      emailsFetched: 0,
      emailsSkipped: 0,
      emailsErrored: 0,
      error: 'Gmail not connected. Please reconnect in settings.',
    };
  }

  // A cron run has no user session; only a manual fetch has an actor
  let createdBy: string | undefined;
  if (trigger === 'manual') {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();
    createdBy = user?.id;
  }

  const adminClient = await createAdminClient();

  // Get connection details and criteria
  const { data: credentials } = await adminClient
    .from('gmail_oauth_credentials')
    .select('email_address, sync_criteria')
    .eq('is_active', true)
    .single();

  const sourceEmail = credentials?.email_address || 'unknown';
  const criteria = credentials?.sync_criteria as Partial<GmailSyncCriteria> | null || {};

  // Create import session
  const { data: importSession, error: importError } = await insertEmailImport(adminClient, {
    sourceEmail,
    triggerType: trigger,
    createdBy,
  });

  if (importError || !importSession) {
    return {
      success: false,
      importId: null,
      emailsFetched: 0,
      emailsSkipped: 0,
      emailsErrored: 0,
      error: importError || 'Failed to create import session',
    };
  }

  const importId = importSession.id;

  // A cron run has no session actor; the cron route records it in the system log instead
  if (trigger === 'manual') {
    await logAudit({
      action: 'CREATE',
      entityType: 'email_imports',
      entityId: importId,
      entityDisplay: `Email Import: ${trigger}`,
      newValues: {
        source_email: sourceEmail,
        trigger_type: trigger,
      },
    });
  }

  // Update status to fetching
  await writeEmailImportStatus(adminClient, { importId, status: 'fetching' });

  const result: FetchEmailsResult = {
    success: true,
    importId,
    emailsFetched: 0,
    emailsSkipped: 0,
    emailsErrored: 0,
  };

  try {
    // Calculate "since" date based on criteria or options
    const finalDaysBack = criteria.days_back || sinceDays;
    const sinceDate = new Date();
    sinceDate.setDate(sinceDate.getDate() - finalDaysBack);

    // Fetch message list from Gmail using criteria
    const { messages } = await listMessagesByCriteria(gmail, {
      maxResults: maxEmails,
      afterDate: sinceDate,
      senders: criteria.senders,
      keywords: criteria.keywords,
    });

    if (!messages || messages.length === 0) {
      await writeEmailImportStatus(adminClient, {
        importId,
        status: 'completed',
        emailsFetched: 0,
        importSummary: { message: 'No new emails found' },
      });

      await updateGmailSyncStatus({
        status: 'success',
        message: 'No new emails found',
        emailsCount: 0,
      });

      return result;
    }

    // Process each message
    for (const messageRef of messages) {
      if (!messageRef.id) continue;

      try {
        // Get full message content
        const message = await getMessage(gmail, messageRef.id);

        // Extract metadata
        const metadata = extractEmailMetadata(message);
        const body = extractEmailBody(message);
        const attachmentsMeta = extractAttachments(message);

        // Detect email type
        const emailType = detectEmailType(metadata.subject, body.text || body.html, {
          include_credits: criteria.include_credits !== false,
          include_debits: criteria.include_debits !== false,
        });

        if (emailType === 'filtered') {
          result.emailsSkipped++;
          continue;
        }

        // Fetch attachment data
        const attachmentsWithData = [];
        for (const att of attachmentsMeta) {
          try {
            const data = await getAttachment(gmail, messageRef.id, att.id);
            attachmentsWithData.push({
              id: att.id,
              filename: att.filename,
              mimeType: att.mimeType,
              data,
            });
          } catch (attError) {
            console.error(`Failed to fetch attachment ${att.filename}:`, attError);
          }
        }

        // Store in Supabase Storage
        const { rawContentPath, attachmentPaths } = await storeEmailContent(
          importId,
          messageRef.id,
          body,
          attachmentsWithData
        );

        // Create email message record
        const { error: messageError } = await createEmailMessage({
          emailImportId: importId,
          gmailMessageId: messageRef.id,
          gmailThreadId: metadata.threadId,
          subject: metadata.subject,
          fromAddress: metadata.from,
          toAddress: metadata.to,
          receivedAt: metadata.date,
          emailType,
          rawContentPath,
          attachments: attachmentPaths,
          // Read by the scheduled auto-record step (#1340); a failed check keeps the alert in review.
          senderCheck: checkAlertSender(message.payload?.headers, metadata.from),
        });

        if (messageError === 'duplicate') {
          result.emailsSkipped++;
        } else if (messageError) {
          result.emailsErrored++;
          console.error(`Failed to create email message record: ${messageError}`);
        } else {
          result.emailsFetched++;
        }
      } catch (messageError) {
        result.emailsErrored++;
        console.error(`Failed to process message ${messageRef.id}:`, messageError);
      }
    }

    // Update import status
    await writeEmailImportStatus(adminClient, {
      importId,
      status: 'parsing', // Ready for parsing phase
      emailsFetched: result.emailsFetched,
      emailsSkipped: result.emailsSkipped,
      emailsErrored: result.emailsErrored,
    });

    // Update Gmail sync status
    await updateGmailSyncStatus({
      status: result.emailsErrored > 0 ? 'partial' : 'success',
      message: `Fetched ${result.emailsFetched} emails, skipped ${result.emailsSkipped} duplicates`,
      emailsCount: result.emailsFetched,
    });

    // ============================================================
    // PIPELINE CHAINING
    // Trigger subsequent stages immediately for manual fetches. A cron fetch
    // leaves them to the cron route, which auto-records only sender-checked
    // alert credits within the limit and queues the rest for review (#1340).
    // ============================================================

    if (result.emailsFetched > 0 && trigger === 'manual') {
      try {
        // 1. Parse
        await parseAllPendingEmails(importId);

        // 2. Match
        await matchEmailTransactions(importId);

        // 3. Process
        await processEmailTransactions(importId);
      } catch (pipelineError) {
        console.error('Pipeline processing failed:', pipelineError);
        // We don't fail the whole fetch result, but the import status will reflect where it stopped
        // (the individual steps update status as they go)
      }
    } else if (result.emailsFetched === 0) {
      // If no emails fetched, mark as completed immediately (was left as 'parsing' before)
      await writeEmailImportStatus(adminClient, {
        importId,
        status: 'completed',
      });
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error during fetch';

    await writeEmailImportStatus(adminClient, {
      importId,
      status: 'failed',
      errorMessage,
    });

    await updateGmailSyncStatus({
      status: 'error',
      message: errorMessage,
    });

    result.success = false;
    result.error = errorMessage;

    return result;
  }
}
