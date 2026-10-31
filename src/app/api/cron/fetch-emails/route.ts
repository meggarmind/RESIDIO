import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';
import { createLogger } from '@/lib/logger';
import { getActiveGmailAddress } from '@/lib/email-imports/gmail-client';
import { runEmailFetch } from '@/lib/email-imports/fetch-emails';
import { parseAllPendingEmails } from '@/lib/email-imports/parse-email';
import { matchEmailTransactions } from '@/lib/email-imports/process-email-matching';
import { queueEmailTransactionsForReview } from '@/lib/email-imports/queue-for-review';
import { autoRecordEmailPayments } from '@/lib/email-imports/auto-record';

const log = createLogger('[Cron:EmailFetch]');

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

/**
 * Cron endpoint for automated email import
 * Scheduled every 5 minutes (Coolify scheduled task, docs/deployment/hosting-plan.md)
 *
 * Pipeline:
 * 1. Check if Gmail is connected
 * 2. Fetch new emails from Gmail
 * 3. Parse emails to extract transactions
 * 4. Match transactions to residents
 * 5. Auto-record sender-checked alert credits with a strong match at or below the limit (#1340)
 * 6. Queue every other transaction for admin review
 *
 * Runs without a user session, so every step uses the service-role client. Step 5
 * is the only money it writes, as payments with a system actor in the audit log
 * (owner decision on #1340, reversing #879 option B for these credits only). It
 * never posts an expense or petty-cash entry: debits always wait for an admin.
 *
 * Authentication: Bearer token matching CRON_SECRET env var
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:fetch-emails', 'import', runEmailImport);
}

async function runEmailImport(run: SystemLogRun) {

  const startTime = Date.now();
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    log.info('Starting email import cron job');

    // Step 1: Check Gmail connection
    const gmailEmail = await getActiveGmailAddress();

    if (!gmailEmail) {
      log.info('Gmail not connected, skipping');
      run.summary = { skipped: true, reason: 'gmail_not_connected' };
      return NextResponse.json({
        skipped: true,
        reason: 'Gmail not connected',
        ...results,
      });
    }

    results.gmailEmail = gmailEmail;

    // Step 2: Fetch new emails
    log.info('Fetching new emails from Gmail');
    const fetchResult = await runEmailFetch('cron', {
      maxEmails: 50,
      sinceDays: 1, // Only look at the last 24 hours
    });

    results.fetchPhase = {
      success: fetchResult.success,
      emailsFetched: fetchResult.emailsFetched,
      emailsSkipped: fetchResult.emailsSkipped,
      emailsErrored: fetchResult.emailsErrored,
    };

    run.summary.fetchPhase = results.fetchPhase;

    if (!fetchResult.success || !fetchResult.importId) {
      log.error('Email fetch failed:', fetchResult.error);
      run.outcome = 'failure';
      run.error = fetchResult.error;
      return NextResponse.json({
        success: false,
        error: fetchResult.error,
        ...results,
        durationMs: Date.now() - startTime,
      });
    }

    const importId = fetchResult.importId;
    results.importId = importId;
    run.summary.importId = importId;

    // If no new emails, we're done
    if (fetchResult.emailsFetched === 0) {
      log.info('No new emails to process');
      return NextResponse.json({
        success: true,
        message: 'No new emails found',
        ...results,
        durationMs: Date.now() - startTime,
      });
    }

    // Step 3: Parse emails
    log.info(`Parsing ${fetchResult.emailsFetched} emails`);
    // Protected statement PDFs need the stored password, which this sessionless run reads
    // with the service role and records in the System Action Log (#884).
    const parseResult = await parseAllPendingEmails(importId, { systemSource: 'cron:fetch-emails' });

    results.parsePhase = {
      messagesParsed: parseResult.messagesParsed,
      transactionsExtracted: parseResult.transactionsExtracted,
      errored: parseResult.errored,
    };
    run.summary.parsePhase = results.parsePhase;

    // Step 4: Match transactions to residents
    log.info(`Matching ${parseResult.transactionsExtracted} transactions`);
    const matchResult = await matchEmailTransactions(importId);

    results.matchPhase = {
      matched: matchResult.matched,
      unmatched: matchResult.unmatched,
    };
    run.summary.matchPhase = results.matchPhase;

    // Step 5: Auto-record what passes every check; a failure leaves the rest for review
    const autoResult = await autoRecordEmailPayments(importId);
    results.autoRecordPhase = {
      autoRecorded: autoResult.autoRecorded.length,
      senderRejected: autoResult.senderRejected,
      skipped: autoResult.skipped,
      errored: autoResult.errored,
      paymentIds: autoResult.autoRecorded.map((p) => p.paymentId),
    };
    run.summary.autoRecordPhase = results.autoRecordPhase;
    if (autoResult.error) {
      log.error('Auto-recording payments failed:', autoResult.error);
      run.outcome = 'failure';
      run.error = autoResult.error;
    }

    // Step 6: Queue every transaction still open for admin review
    log.info('Queueing open transactions for review');
    const queueResult = await queueEmailTransactionsForReview(importId, {
      autoProcessed: autoResult.autoRecorded.length,
      skipped: autoResult.skipped,
      errored: autoResult.errored,
    });

    results.queuePhase = { queuedForReview: queueResult.queuedForReview };
    run.summary.queuePhase = results.queuePhase;
    if (queueResult.error) {
      log.error('Queueing transactions for review failed:', queueResult.error);
      run.outcome = 'failure';
      run.error = queueResult.error;
      return NextResponse.json({
        success: false,
        error: queueResult.error,
        ...results,
        durationMs: Date.now() - startTime,
      });
    }

    const durationMs = Date.now() - startTime;

    log.info('Email import completed:', {
      importId,
      fetched: fetchResult.emailsFetched,
      transactions: parseResult.transactionsExtracted,
      autoRecorded: autoResult.autoRecorded.length,
      queued: queueResult.queuedForReview,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      importId,
      summary: {
        emailsFetched: fetchResult.emailsFetched,
        transactionsExtracted: parseResult.transactionsExtracted,
        matched: matchResult.matched,
        autoRecorded: autoResult.autoRecorded.length,
        queuedForReview: queueResult.queuedForReview,
      },
      ...results,
      durationMs,
    });
  } catch (error) {
    run.error = error;
    log.error('Email import cron error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        ...results,
        durationMs: Date.now() - startTime,
      },
      { status: 500 }
    );
  }
}
