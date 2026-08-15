'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { PaymentCadence } from '@/lib/analytics/classify-payment-cadence';
import type { CategoryData } from '@/types/analytics';

export interface ResidentCadence {
  residentId: string;
  residentName: string;
  cadence: PaymentCadence;
  paymentCount: number;
  medianGapDays: number | null;
}

export interface PaymentCadenceAnalytics {
  distribution: CategoryData[];
  residents: ResidentCadence[];
  lastUpdated: string;
}

const CADENCE_LABELS: Record<PaymentCadence, string> = {
  monthly: 'Monthly payers',
  annual: 'Annual payers',
  irregular: 'Irregular payers',
  insufficient_data: 'Insufficient data',
};

/**
 * Reads the nightly-refreshed resident_payment_cadence_summary table instead of
 * reclassifying payment_records on every request. See /api/cron/refresh-payment-cadence
 * and src/actions/analytics/refresh-payment-cadence-summary.ts for how it's populated.
 */
export async function getPaymentCadenceAnalytics(): Promise<{ data: PaymentCadenceAnalytics | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  try {
    const [summaryResult, residentsResult] = await Promise.all([
      supabase.from('resident_payment_cadence_summary').select('resident_id, cadence, payment_count, median_gap_days, computed_at'),
      supabase.from('residents').select('id, first_name, last_name'),
    ]);

    if (summaryResult.error) return { data: null, error: summaryResult.error.message };
    if (residentsResult.error) return { data: null, error: residentsResult.error.message };

    const residentNames = new Map((residentsResult.data ?? []).map((r) => [r.id, `${r.first_name} ${r.last_name}`]));

    const residentCadences: ResidentCadence[] = (summaryResult.data ?? []).map((row) => ({
      residentId: row.resident_id,
      residentName: residentNames.get(row.resident_id) ?? 'Unknown',
      cadence: row.cadence as PaymentCadence,
      paymentCount: row.payment_count,
      medianGapDays: row.median_gap_days,
    }));

    const cadenceCounts = new Map<PaymentCadence, number>();
    (['monthly', 'annual', 'irregular', 'insufficient_data'] as PaymentCadence[]).forEach((c) => cadenceCounts.set(c, 0));
    residentCadences.forEach((r) => cadenceCounts.set(r.cadence, (cadenceCounts.get(r.cadence) ?? 0) + 1));

    const total = residentCadences.length;
    const distribution: CategoryData[] = Array.from(cadenceCounts.entries())
      .filter(([, count]) => count > 0)
      .map(([cadence, count]) => ({
        category: CADENCE_LABELS[cadence],
        count,
        amount: 0,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }));

    const lastUpdated = (summaryResult.data ?? []).reduce<string | null>((latest, row) => {
      if (!row.computed_at) return latest;
      return !latest || row.computed_at > latest ? row.computed_at : latest;
    }, null) ?? new Date().toISOString();

    const data: PaymentCadenceAnalytics = {
      distribution,
      residents: residentCadences.sort((a, b) => (a.medianGapDays ?? 0) - (b.medianGapDays ?? 0)),
      lastUpdated,
    };

    return { data, error: null };
  } catch (err) {
    console.error('[getPaymentCadenceAnalytics] error:', err);
    return { data: null, error: 'Failed to fetch payment cadence analytics' };
  }
}
