import { NextRequest, NextResponse } from 'next/server';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createLogger } from '@/lib/logger';
import { getGmailConnectionStatus } from '@/actions/email-imports/gmail-oauth';
import { fetchNewEmails } from '@/actions/email-imports/fetch-emails';
import { parseAllPendingEmails } from '@/actions/email-imports/parse-email';
import {
  matchEmailTransactions,
  processEmailTransactions,
} from '@/actions/email-imports/process-email-import';

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
 * 5. Auto-process high-confidence matches
 *
 * Authentication: Bearer token matching CRON_SECRET env var
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const startTime = Date.now();
  const results: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
  };

  try {
    log.info('Starting email import cron job');

    // Step 1: Check Gmail connection
    const connectionStatus = await getGmailConnectionStatus();

    if (connectionStatus.error || !connectionStatus.data?.connected) {
      log.info('Gmail not connected, skipping');
      return NextResponse.json({
        skipped: true,
        reason: 'Gmail not connected',
        ...results,
      });
    }

    results.gmailEmail = connectionStatus.data.email;

    // Step 2: Fetch new emails
    log.info('Fetching new emails from Gmail');
    const fetchResult = await fetchNewEmails({
      trigger: 'cron',
      maxEmails: 50,
      sinceDays: 1, // Only look at last 24 hours for hourly cron
    });

    results.fetchPhase = {
      success: fetchResult.success,
      emailsFetched: fetchResult.emailsFetched,
      emailsSkipped: fetchResult.emailsSkipped,
      emailsErrored: fetchResult.emailsErrored,
    };

    if (!fetchResult.success || !fetchResult.importId) {
      log.error('Email fetch failed:', fetchResult.error);
      return NextResponse.json({
        success: false,
        error: fetchResult.error,
        ...results,
        durationMs: Date.now() - startTime,
      });
    }

    const importId = fetchResult.importId;
    results.importId = importId;

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

    if (parseResult.transactionsExtracted === 0) {
      log.info('No transactions extracted from emails');
      return NextResponse.json({
        success: true,
        message: 'No transactions found in emails',
        ...results,
        durationMs: Date.now() - startTime,
      });
    }

    // Step 4: Match transactions to residents
    log.info(`Matching ${parseResult.transactionsExtracted} transactions`);
    const matchResult = await matchEmailTransactions(importId);

    results.matchPhase = {
      matched: matchResult.matched,
      unmatched: matchResult.unmatched,
    };

    if (matchResult.matched === 0) {
      log.info('No transactions matched to residents');
      return NextResponse.json({
        success: true,
        message: 'No transactions matched to residents',
        ...results,
        durationMs: Date.now() - startTime,
      });
    }

    // Step 5: Process transactions (auto-process high-confidence)
    log.info(`Processing ${matchResult.matched} matched transactions`);
    const processResult = await processEmailTransactions(importId, {
      autoProcessHighConfidence: true,
      skipDuplicates: true,
    });

    results.processPhase = {
      autoProcessed: processResult.autoProcessed,
      queuedForReview: processResult.queuedForReview,
      skipped: processResult.skipped,
      errored: processResult.errored,
    };

    const durationMs = Date.now() - startTime;

    log.info('Email import completed:', {
      importId,
      fetched: fetchResult.emailsFetched,
      transactions: parseResult.transactionsExtracted,
      autoProcessed: processResult.autoProcessed,
      queued: processResult.queuedForReview,
      durationMs,
    });

    return NextResponse.json({
      success: true,
      importId,
      summary: {
        emailsFetched: fetchResult.emailsFetched,
        transactionsExtracted: parseResult.transactionsExtracted,
        matched: matchResult.matched,
        autoProcessed: processResult.autoProcessed,
        queuedForReview: processResult.queuedForReview,
        skipped: processResult.skipped,
      },
      ...results,
      durationMs,
    });
  } catch (error) {
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
