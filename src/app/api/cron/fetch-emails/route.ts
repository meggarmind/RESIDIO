import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';
import { createLogger } from '@/lib/logger';
import { getActiveGmailAddress } from '@/lib/email-imports/gmail-client';
import { runEmailFetch } from '@/lib/email-imports/fetch-emails';
import { parseAllPendingEmails } from '@/lib/email-imports/parse-email';
import { matchEmailTransactions } from '@/lib/email-imports/process-email-matching';
import { queueEmailTransactionsForReview } from '@/lib/email-imports/queue-for-review';

const log = createLogger('[Cron:EmailFetch]');

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

/**
 * Vercel Cron endpoint for automated email import
 * Scheduled to run hourly (configured in vercel.json)
 *
 * Pipeline:
 * 1. Check if Gmail is connected
 * 2. Fetch new emails from Gmail
 * 3. Parse emails to extract transactions
 * 4. Match transactions to residents
 * 5. Queue every transaction for admin review
 *
 * Runs without a user session, so every step uses the service-role client. It
 * never posts a payment, expense or petty-cash entry: money is written only when
 * an admin processes a queued transaction (#879).
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
      sinceDays: 1, // Only look at last 24 hours for hourly cron
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
    const parseResult = await parseAllPendingEmails(importId);

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

    // Step 5: Queue every transaction for admin review (no money is written)
    log.info(`Queueing ${parseResult.transactionsExtracted} transactions for review`);
    const queueResult = await queueEmailTransactionsForReview(importId);

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
