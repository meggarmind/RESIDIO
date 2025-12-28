import { NextRequest, NextResponse } from 'next/server';
import { processQueue, purgeOldItems } from '@/lib/notifications/queue';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute max

/**
 * Vercel Cron endpoint for processing notification queue
 * Scheduled to run every 5 minutes (configured in vercel.json)
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

  try {
    console.log('[Cron] Starting notification queue processing');

    // Process pending queue items
    const result = await processQueue({
      batchSize: 50, // Process up to 50 items per run
    });

    console.log('[Cron] Queue processing completed:', result);

    // Purge old items once a day (at the top of the hour)
    // We check if minutes are between 0-4 since cron runs every 5 min
    const now = new Date();
    let purgeResult = { deleted: 0 };
    if (now.getUTCHours() === 0 && now.getUTCMinutes() < 5) {
      console.log('[Cron] Running daily queue purge');
      purgeResult = await purgeOldItems(30); // Keep 30 days
      console.log('[Cron] Purge completed:', purgeResult);
    }

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
