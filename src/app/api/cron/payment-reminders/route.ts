import { NextRequest, NextResponse } from 'next/server';
import { processInvoiceReminders } from '@/lib/notifications/invoice-reminders';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { withSystemLog, type SystemLogRun } from '@/lib/system-log/with-system-log';

export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes max for multi-channel processing

/**
 * Cron endpoint for sending invoice payment reminders
 * Scheduled daily at 08:00 as a Coolify scheduled task (see docs/deployment/hosting-plan.md)
 *
 * This endpoint processes the automated reminder escalation system:
 * - Sends reminders on the steps of the Reminder Schedule (settings/notifications/reminders)
 * - Steps before the due date run only on the Billing reminder days, and the Email
 *   "Payment Reminders" switch turns the email channel off (#846)
 * - Delivers by email and WhatsApp (SMS is skipped until its provider is connected)
 * - Escalation level progression (friendly -> warning -> urgent -> final -> overdue)
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  const authError = verifyCronAuth(request);
  if (authError) return authError;
  return withSystemLog('cron:payment-reminders', 'send', runPaymentReminders);
}

async function runPaymentReminders(run: SystemLogRun) {

  try {
    console.log('[Cron] Starting invoice reminders job');
    const result = await processInvoiceReminders();

    console.log('[Cron] Invoice reminders completed:', result);

    run.summary = {
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
    };
    if (result.failed > 0) {
      const totalSent = result.sent.email + result.sent.sms + result.sent.whatsapp;
      run.outcome = totalSent > 0 ? 'partial' : 'failure';
    }

    return NextResponse.json({
      success: result.failed === 0,
      processed: result.processed,
      sent: result.sent,
      skipped: result.skipped,
      failed: result.failed,
      errors: result.errors.slice(0, 10), // Limit error output
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Cron] Invoice reminders error:', error);
    run.error = error;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
