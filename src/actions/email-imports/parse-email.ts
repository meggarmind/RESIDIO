'use server';

/**
 * Email Parsing Actions
 *
 * Parses email messages to extract transactions.
 * Handles both inline transaction alerts and PDF attachments.
 */

import { createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import { parseFirstBankAlert, isFirstBankAlert } from '@/lib/email-imports/parsers/first-bank-alert';
import {
  parseFirstBankPdf,
  extractAccountNumber,
} from '@/lib/email-imports/parsers/first-bank-pdf';
import { updateEmailImportStatus } from './create-email-import';
import type {
  EmailMessage,
  EmailTransaction,
  ParsedEmailTransaction,
} from '@/types/database';

// ============================================================
// Get Email Content from Storage
// ============================================================

async function getEmailContent(
  rawContentPath: string | null
): Promise<string | null> {
  if (!rawContentPath) return null;

  const adminClient = await createAdminClient();

  const { data, error } = await adminClient.storage
    .from('email-imports')
    .download(rawContentPath);

  if (error || !data) {
    console.error('Failed to download email content:', error);
    return null;
  }

  return await data.text();
}

async function getAttachmentBuffer(
  attachmentPath: string
): Promise<Buffer | null> {
  const adminClient = await createAdminClient();

  const { data, error } = await adminClient.storage
    .from('email-imports')
    .download(attachmentPath);

  if (error || !data) {
    console.error('Failed to download attachment:', error);
    return null;
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

// ============================================================
// Create Email Transaction Record
// ============================================================

async function createEmailTransaction(
  params: {
    emailMessageId: string;
    emailImportId: string;
    transaction: ParsedEmailTransaction;
  }
): Promise<{ data: EmailTransaction | null; error: string | null }> {
  const adminClient = await createAdminClient();

  const { data, error } = await adminClient
    .from('email_transactions')
    .insert({
      email_message_id: params.emailMessageId,
      email_import_id: params.emailImportId,
      transaction_date: params.transaction.transactionDate?.toISOString().split('T')[0],
      description: params.transaction.description,
      amount: params.transaction.amount,
      transaction_type: params.transaction.transactionType,
      reference: params.transaction.reference,
      bank_account_last4: params.transaction.bankAccountLast4,
      raw_extracted_data: params.transaction,
      status: 'pending',
    })
    .select()
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as EmailTransaction, error: null };
}

// ============================================================
// Parse Single Email Message
// ============================================================

export async function parseEmailMessage(
  emailMessageId: string
): Promise<{
  transactionsExtracted: number;
  error: string | null;
}> {
  const adminClient = await createAdminClient();

  // Get email message
  const { data: message, error: fetchError } = await adminClient
    .from('email_messages')
    .select('*')
    .eq('id', emailMessageId)
    .single();

  if (fetchError || !message) {
    return {
      transactionsExtracted: 0,
      error: fetchError?.message || 'Email message not found',
    };
  }

  const emailMessage = message as EmailMessage;
  let transactionsExtracted = 0;
  const errors: string[] = [];

  try {
    // Parse based on email type
    if (emailMessage.email_type === 'transaction_alert') {
      // Parse inline transaction alert
      const content = await getEmailContent(emailMessage.raw_content_path);

      if (content) {
        const parsed = parseFirstBankAlert(content, emailMessage.subject);

        if (parsed) {
          const { error: txError } = await createEmailTransaction({
            emailMessageId: emailMessage.id,
            emailImportId: emailMessage.email_import_id,
            transaction: parsed,
          });

          if (!txError) {
            transactionsExtracted++;
          } else {
            errors.push(`Failed to save transaction: ${txError}`);
          }
        } else {
          errors.push('Could not parse transaction from alert');
        }
      } else {
        errors.push('No content found for email');
      }
    } else if (emailMessage.email_type === 'statement_attachment') {
      // Parse PDF attachments
      const attachments = (emailMessage.attachments as Array<{
        name: string;
        path: string;
        size: number;
        mimeType: string;
      }>) || [];

      const pdfAttachments = attachments.filter(
        (att) =>
          att.mimeType === 'application/pdf' ||
          att.name.toLowerCase().endsWith('.pdf')
      );

      for (const att of pdfAttachments) {
        const pdfBuffer = await getAttachmentBuffer(att.path);

        if (!pdfBuffer) {
          errors.push(`Failed to download attachment: ${att.name}`);
          continue;
        }

        // Try to extract account number from PDF
        // First, try to get text without password (might fail if encrypted)
        let accountLast4: string | null = null;
        try {
          const pdfParse = (await import('pdf-parse')).default || (await import('pdf-parse'));
          const textData = await pdfParse(pdfBuffer);
          accountLast4 = extractAccountNumber(textData.text);
        } catch {
          // PDF might be encrypted - we'll try with password lookup
        }

        // Parse the PDF
        const { transactions, error: parseError, passwordRequired } =
          await parseFirstBankPdf(pdfBuffer, {
            accountLast4: accountLast4 || undefined,
          });

        if (parseError) {
          if (passwordRequired) {
            errors.push(`Password required for ${att.name}`);
          } else {
            errors.push(`Failed to parse ${att.name}: ${parseError}`);
          }
          continue;
        }

        // Save each transaction
        for (const tx of transactions) {
          const { error: txError } = await createEmailTransaction({
            emailMessageId: emailMessage.id,
            emailImportId: emailMessage.email_import_id,
            transaction: tx,
          });

          if (!txError) {
            transactionsExtracted++;
          } else {
            errors.push(`Failed to save transaction: ${txError}`);
          }
        }
      }
    } else if (emailMessage.email_type === 'unknown') {
      // Try both parsers for unknown emails
      const content = await getEmailContent(emailMessage.raw_content_path);

      if (content && isFirstBankAlert(content, emailMessage.subject)) {
        // Looks like an alert, try to parse
        const parsed = parseFirstBankAlert(content, emailMessage.subject);

        if (parsed) {
          const { error: txError } = await createEmailTransaction({
            emailMessageId: emailMessage.id,
            emailImportId: emailMessage.email_import_id,
            transaction: parsed,
          });

          if (!txError) {
            transactionsExtracted++;

            // Update email type
            await adminClient
              .from('email_messages')
              .update({ email_type: 'transaction_alert' })
              .eq('id', emailMessage.id);
          }
        }
      }

      // Also check for PDF attachments
      const attachments = (emailMessage.attachments as Array<{
        name: string;
        path: string;
        size: number;
        mimeType: string;
      }>) || [];

      const pdfAttachments = attachments.filter(
        (att) =>
          att.mimeType === 'application/pdf' ||
          att.name.toLowerCase().endsWith('.pdf')
      );

      if (pdfAttachments.length > 0 && transactionsExtracted === 0) {
        // Process PDFs
        for (const att of pdfAttachments) {
          const pdfBuffer = await getAttachmentBuffer(att.path);

          if (!pdfBuffer) continue;

          const { transactions } = await parseFirstBankPdf(pdfBuffer);

          for (const tx of transactions) {
            const { error: txError } = await createEmailTransaction({
              emailMessageId: emailMessage.id,
              emailImportId: emailMessage.email_import_id,
              transaction: tx,
            });

            if (!txError) {
              transactionsExtracted++;
            }
          }
        }

        if (transactionsExtracted > 0) {
          await adminClient
            .from('email_messages')
            .update({ email_type: 'statement_attachment' })
            .eq('id', emailMessage.id);
        }
      }
    }

    // Update message status
    await adminClient
      .from('email_messages')
      .update({
        processing_status: errors.length > 0 ? 'error' : 'parsed',
        processing_error: errors.length > 0 ? errors.join('; ') : null,
        transactions_extracted: transactionsExtracted,
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailMessage.id);

    return {
      transactionsExtracted,
      error: errors.length > 0 ? errors.join('; ') : null,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    await adminClient
      .from('email_messages')
      .update({
        processing_status: 'error',
        processing_error: errorMessage,
        processed_at: new Date().toISOString(),
      })
      .eq('id', emailMessage.id);

    return {
      transactionsExtracted: 0,
      error: errorMessage,
    };
  }
}

// ============================================================
// Parse All Pending Emails in Import
// ============================================================

export async function parseAllPendingEmails(
  importId: string
): Promise<{
  messagesParsed: number;
  transactionsExtracted: number;
  errored: number;
  error: string | null;
}> {
  const adminClient = await createAdminClient();

  // Get all pending messages for this import
  const { data: messages, error: fetchError } = await adminClient
    .from('email_messages')
    .select('id')
    .eq('email_import_id', importId)
    .eq('processing_status', 'pending');

  if (fetchError) {
    return {
      messagesParsed: 0,
      transactionsExtracted: 0,
      errored: 0,
      error: fetchError.message,
    };
  }

  if (!messages || messages.length === 0) {
    return {
      messagesParsed: 0,
      transactionsExtracted: 0,
      errored: 0,
      error: null,
    };
  }

  let messagesParsed = 0;
  let totalTransactions = 0;
  let errored = 0;

  // Process each message
  for (const msg of messages) {
    const result = await parseEmailMessage(msg.id);

    if (result.error) {
      errored++;
    } else {
      messagesParsed++;
    }

    totalTransactions += result.transactionsExtracted;
  }

  // Update import status
  await updateEmailImportStatus({
    importId,
    status: 'matching', // Ready for matching phase
    emailsParsed: messagesParsed,
    emailsErrored: errored,
    transactionsExtracted: totalTransactions,
  });

  // Audit log
  await logAudit({
    action: 'GENERATE',
    entityType: 'email_imports',
    entityId: importId,
    entityDisplay: `Email Parse: ${totalTransactions} transactions`,
    newValues: {
      messages_parsed: messagesParsed,
      transactions_extracted: totalTransactions,
      errors: errored,
    },
  });

  return {
    messagesParsed,
    transactionsExtracted: totalTransactions,
    errored,
    error: null,
  };
}
