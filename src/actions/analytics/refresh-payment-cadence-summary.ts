'use server';

import { createAdminSupabaseClient } from '@/lib/supabase/admin';
import { classifyPaymentCadence } from '@/lib/analytics/classify-payment-cadence';

const PAGE_SIZE = 1000;

export interface RefreshPaymentCadenceSummaryResult {
  residentsProcessed: number;
  paymentRecordsRead: number;
  cadenceCounts: Record<string, number>;
  durationMs: number;
}

/**
 * Recomputes payment-cadence classification for every resident with paid payment_records
 * and upserts the results into resident_payment_cadence_summary. Paginates the source
 * query explicitly, since PostgREST caps unranged selects well short of the ~2,300+ rows
 * this table holds.
 */
export async function refreshPaymentCadenceSummary(): Promise<{ data: RefreshPaymentCadenceSummaryResult | null; error: string | null }> {
  const startedAt = Date.now();
  const supabase = createAdminSupabaseClient();

  try {
    const datesByResident = new Map<string, Date[]>();
    let offset = 0;
    let totalRead = 0;

    for (;;) {
      const { data: page, error } = await supabase
        .from('payment_records')
        .select('resident_id, payment_date')
        .eq('status', 'paid')
        .order('payment_date', { ascending: true })
        .range(offset, offset + PAGE_SIZE - 1);

      if (error) return { data: null, error: error.message };
      if (!page || page.length === 0) break;

      page.forEach((p) => {
        if (!p.resident_id) return;
        const existing = datesByResident.get(p.resident_id) ?? [];
        existing.push(new Date(p.payment_date));
        datesByResident.set(p.resident_id, existing);
      });

      totalRead += page.length;
      if (page.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }

    const cadenceCounts: Record<string, number> = { monthly: 0, annual: 0, irregular: 0, insufficient_data: 0 };
    const rows = Array.from(datesByResident.entries()).map(([residentId, dates]) => {
      const classification = classifyPaymentCadence(dates);
      cadenceCounts[classification.cadence] = (cadenceCounts[classification.cadence] ?? 0) + 1;
      return {
        resident_id: residentId,
        cadence: classification.cadence,
        payment_count: classification.paymentCount,
        median_gap_days: classification.medianGapDays,
        computed_at: new Date().toISOString(),
      };
    });

    if (rows.length > 0) {
      const { error: upsertError } = await supabase
        .from('resident_payment_cadence_summary')
        .upsert(rows, { onConflict: 'resident_id' });
      if (upsertError) return { data: null, error: upsertError.message };
    }

    return {
      data: {
        residentsProcessed: rows.length,
        paymentRecordsRead: totalRead,
        cadenceCounts,
        durationMs: Date.now() - startedAt,
      },
      error: null,
    };
  } catch (err) {
    console.error('[refreshPaymentCadenceSummary] error:', err);
    return { data: null, error: 'Failed to refresh payment cadence summary' };
  }
}
