import { NextRequest, NextResponse } from 'next/server';
import { processQueue, purgeOldItems } from '@/lib/notifications/queue';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';
import { alertStalePendingSends } from '@/lib/whatsapp/outbound-sends';
import { purgeExpiredStatementFiles } from '@/lib/whatsapp/statement-delivery';

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute max

/**
 * Vercel Cron endpoint for processing notification queue
 * Scheduled every 15 minutes as a Coolify scheduled task (see docs/deployment/hosting-plan.md),
 * so requeued retries (#546) are picked up
 *
 * This endpoint:
 * 1. Processes pending notifications in the queue
 * 2. Sends them via their respective channels (email, sms, whatsapp)
 * 3. Periodically purges old sent/cancelled items
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:process-notifications', 'process', runNotificationQueue);
}

async function runNotificationQueue(run: SystemLogRun) {

  try {
    console.log('[Cron] Starting notification queue processing');

    // Process pending queue items
    const result = await processQueue({
      batchSize: 50, // Process up to 50 items per run
    });

    console.log('[Cron] Queue processing completed:', result);

    // WhatsApp sends Chatmaid accepted but never confirmed (#839). A failure
    // here must not fail the queue run, which already sent its messages.
    let stalePendingSends = 0;
    try {
      stalePendingSends = await alertStalePendingSends();
    } catch (error) {
      console.error('[Cron] Stale WhatsApp send check failed:', error);
    }

    // WhatsApp statement PDFs are kept 12 hours (#804); same isolation as above.
    let statementFilesPurged = 0;
    try {
      statementFilesPurged = await purgeExpiredStatementFiles();
    } catch (error) {
      console.error('[Cron] WhatsApp statement file purge failed:', error);
    }

    // Purge old items once a day (at the top of the hour)
    // We check if minutes are between 0-4 since cron runs every 5 min
    const now = new Date();
    let purgeResult = { deleted: 0 };
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
      console.log('[Cron] Running daily queue purge');
      purgeResult = await purgeOldItems(30); // Keep 30 days
      console.log('[Cron] Purge completed:', purgeResult);
    }

    run.summary = {
      processed: result.processed,
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped,
      purged: purgeResult.deleted,
      stalePendingSends,
      statementFilesPurged,
    };
    if (result.failed > 0) run.outcome = result.sent > 0 ? 'partial' : 'failure';

    return NextResponse.json({
      success: true,
      queue: {
        processed: result.processed,
        sent: result.sent,
        failed: result.failed,
        skipped: result.skipped,
        errors: result.errors.slice(0, 10), // Limit error output
      },
      purge: purgeResult.deleted > 0 ? { deleted: purgeResult.deleted } : undefined,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Process notifications error:', error);
    run.error = error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
