import { NextRequest, NextResponse } from 'next/server';
import { processInvoiceReminders } from '@/actions/notifications/invoice-reminders';
import { verifyCronAuth } from '@/lib/auth/cron-auth';

// Configure for Vercel
export const runtime = 'nodejs';
export const maxDuration = 120; // 2 minutes max for multi-channel processing

/**
 * Vercel Cron endpoint for sending invoice payment reminders
 * Scheduled to run daily at 8 AM (configured in vercel.json)
 *
 * This endpoint processes the automated reminder escalation system:
 * - Sends reminders based on configurable schedule (7, 3, 1 days before; due date; 1, 3, 7 days after)
 * - Multi-channel delivery (email + SMS)
 * - Escalation level progression (friendly -> warning -> urgent -> final -> overdue)
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe)
 */
export async function GET(request: NextRequest) {
  // Verify cron secret using timing-safe comparison
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    console.log('[Cron] Starting invoice reminders job');
    const result = await processInvoiceReminders();

    console.log('[Cron] Invoice reminders completed:', result);

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
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
