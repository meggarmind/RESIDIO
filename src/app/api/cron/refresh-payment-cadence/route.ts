import { NextRequest, NextResponse } from 'next/server';
import { refreshPaymentCadenceSummary } from '@/actions/analytics/refresh-payment-cadence-summary';
import { verifyCronAuth } from '@/lib/auth/cron-auth';
import { createLogger } from '@/lib/logger';

const log = createLogger('[Cron]');

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes max

/**
 * Vercel Cron endpoint that recomputes the resident_payment_cadence_summary table
 * from payment_records. Scheduled nightly at midnight UTC (configured in vercel.json).
 *
 * Authentication: Bearer token matching CRON_SECRET env var (timing-safe).
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    log.info('Refreshing payment cadence summary');
    const result = await refreshPaymentCadenceSummary();

    if (result.error) {
      log.error('Payment cadence refresh error:', result.error);
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    log.info('Payment cadence refresh completed:', result.data);

    return NextResponse.json({
      success: true,
      ...result.data,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    log.error('Payment cadence refresh error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
