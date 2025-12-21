import { NextRequest, NextResponse } from 'next/server';
import { sendPaymentReminders } from '@/actions/email/send-payment-reminders';

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute max

/**
 * Vercel Cron endpoint for sending payment reminders
 * Scheduled to run daily at 8 AM (configured in vercel.json)
 *
 * Authentication: Bearer token matching CRON_SECRET env var
 */
export async function GET(request: NextRequest) {
  // Verify cron secret
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;

  // In development, allow without auth if no secret is set
  if (process.env.NODE_ENV === 'production' || cronSecret) {
    if (!cronSecret) {
      console.error('[Cron] CRON_SECRET not configured');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
      console.warn('[Cron] Unauthorized request to payment-reminders');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    console.log('[Cron] Starting payment reminders job');
    const result = await sendPaymentReminders();

    console.log('[Cron] Payment reminders completed:', result);

    return NextResponse.json({
      success: result.success,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors.slice(0, 10), // Limit error output
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Payment reminders error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
