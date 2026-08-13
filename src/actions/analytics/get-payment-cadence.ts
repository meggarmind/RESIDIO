'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { classifyPaymentCadence, type PaymentCadence } from '@/lib/analytics/classify-payment-cadence';
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

export async function getPaymentCadenceAnalytics(): Promise<{ data: PaymentCadenceAnalytics | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  try {
    const [paymentsResult, residentsResult] = await Promise.all([
      supabase.from('payment_records').select('resident_id, payment_date').eq('status', 'paid').order('payment_date', { ascending: true }),
      supabase.from('residents').select('id, first_name, last_name'),
    ]);

    if (paymentsResult.error) return { data: null, error: paymentsResult.error.message };
    if (residentsResult.error) return { data: null, error: residentsResult.error.message };

    const residentNames = new Map((residentsResult.data ?? []).map((r) => [r.id, `${r.first_name} ${r.last_name}`]));

    const datesByResident = new Map<string, Date[]>();
    paymentsResult.data?.forEach((p) => {
      if (!p.resident_id) return;
      const existing = datesByResident.get(p.resident_id) ?? [];
      existing.push(new Date(p.payment_date));
      datesByResident.set(p.resident_id, existing);
    });

    const residentCadences: ResidentCadence[] = Array.from(datesByResident.entries()).map(([residentId, dates]) => {
      const classification = classifyPaymentCadence(dates);
      return {
        residentId,
        residentName: residentNames.get(residentId) ?? 'Unknown',
        cadence: classification.cadence,
        paymentCount: classification.paymentCount,
        medianGapDays: classification.medianGapDays,
      };
    });

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

    const data: PaymentCadenceAnalytics = {
      distribution,
      residents: residentCadences.sort((a, b) => (a.medianGapDays ?? 0) - (b.medianGapDays ?? 0)),
      lastUpdated: new Date().toISOString(),
    };

    return { data, error: null };
  } catch (err) {
    console.error('[getPaymentCadenceAnalytics] error:', err);
    return { data: null, error: 'Failed to fetch payment cadence analytics' };
  }
}
