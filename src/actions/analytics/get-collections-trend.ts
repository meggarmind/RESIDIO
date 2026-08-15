'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface CollectionsTrendPoint {
  date: string;
  label: string;
  expected: number;
  collected: number;
}

/**
 * Month-on-month dues expected (invoices due that month) vs collected
 * (payments received that month), for the trailing `months` months.
 */
export async function getCollectionsTrend(months = 6): Promise<{ data: CollectionsTrendPoint[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  try {
    // Anchor the trailing window to the latest available activity instead of the system
    // clock, so the trend stays meaningful even when invoice generation lags behind today
    // (this dataset's most recent due_date/payment_date can be months before "now").
    const [latestInvoice, latestPayment] = await Promise.all([
      supabase.from('invoices').select('due_date').neq('status', 'void').order('due_date', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('payment_records').select('payment_date').eq('status', 'paid').order('payment_date', { ascending: false }).limit(1).maybeSingle(),
    ]);

    const latestDates = [latestInvoice.data?.due_date, latestPayment.data?.payment_date]
      .filter((d): d is string => !!d)
      .map((d) => new Date(d).getTime());
    const end = latestDates.length > 0 ? new Date(Math.max(...latestDates)) : new Date();
    const start = new Date(end);
    start.setMonth(start.getMonth() - (months - 1));
    start.setDate(1);
    const startDate = start.toISOString().slice(0, 10);
    const endDate = end.toISOString().slice(0, 10);

    const [invoicesResult, paymentsResult] = await Promise.all([
      supabase.from('invoices').select('amount_due, due_date').gte('due_date', startDate).lte('due_date', endDate).neq('status', 'void'),
      supabase.from('payment_records').select('amount, payment_date').eq('status', 'paid').gte('payment_date', startDate).lte('payment_date', endDate),
    ]);

    if (invoicesResult.error) return { data: null, error: invoicesResult.error.message };
    if (paymentsResult.error) return { data: null, error: paymentsResult.error.message };

    const monthlyData = new Map<string, { expected: number; collected: number }>();

    invoicesResult.data?.forEach((inv) => {
      if (!inv.due_date) return;
      const date = new Date(inv.due_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthlyData.get(key) ?? { expected: 0, collected: 0 };
      entry.expected += Number(inv.amount_due) || 0;
      monthlyData.set(key, entry);
    });

    paymentsResult.data?.forEach((p) => {
      const date = new Date(p.payment_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const entry = monthlyData.get(key) ?? { expected: 0, collected: 0 };
      entry.collected += Number(p.amount) || 0;
      monthlyData.set(key, entry);
    });

    // Ensure every month in the trailing window appears, even if zero
    const result: CollectionsTrendPoint[] = [];
    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      const entry = monthlyData.get(key) ?? { expected: 0, collected: 0 };
      result.push({ date: key, label, expected: entry.expected, collected: entry.collected });
    }

    return { data: result, error: null };
  } catch (err) {
    console.error('[getCollectionsTrend] error:', err);
    return { data: null, error: 'Failed to fetch collections trend' };
  }
}
