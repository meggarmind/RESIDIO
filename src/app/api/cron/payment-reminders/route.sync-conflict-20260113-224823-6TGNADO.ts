import { NextRequest, NextResponse } from 'next/server';
import { sendPaymentReminders } from '@/actions/email/send-payment-reminders';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 60; // 1 minute max

/**
 * Vercel Cron endpoint for sending payment reminders
 * Scheduled to run daily at 8 AM (configured in vercel.json)
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  const authError = verifyCronAuth(request);
  if (authError) return authError;

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
