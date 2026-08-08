'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface MonthlyPayment {
  id: string;
  amount: number;
  payment_date: string;
  month_label: string;
  day_label: string;
  method: string;
  status: string;
}

export interface YearlyPaymentSummary {
  year: number;
  amount_due: number;
  amount_paid: number;
  outstanding: number;
  paid_count: number;
  partial_count: number;
  unpaid_count: number;
  total_count: number;
  payments: MonthlyPayment[];
}

export async function getHouseYearlySummary(houseId: string): Promise<{
  data: YearlyPaymentSummary[] | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  const [invoiceResult, paymentResult] = await Promise.all([
    supabase
      .from('invoices')
      .select('amount_due, amount_paid, status, period_start')
      .eq('house_id', houseId)
      .order('period_start'),
    supabase
      .from('payment_records')
      .select('id, amount, payment_date, status, method')
      .eq('house_id', houseId)
      .order('payment_date'),
  ]);

  if (invoiceResult.error) {
    return { data: null, error: invoiceResult.error.message };
  }

  const byYear = new Map<number, YearlyPaymentSummary>();

  for (const row of invoiceResult.data || []) {
    const year = new Date(row.period_start).getFullYear();
    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        amount_due: 0,
        amount_paid: 0,
        outstanding: 0,
        paid_count: 0,
        partial_count: 0,
        unpaid_count: 0,
        total_count: 0,
        payments: [],
      });
    }
    const entry = byYear.get(year)!;
    const due = Number(row.amount_due) || 0;
    const paid = Number(row.amount_paid) || 0;
    entry.amount_due += due;
    entry.amount_paid += paid;
    entry.outstanding += Math.max(0, due - paid);
    entry.total_count++;
    if (row.status === 'paid') entry.paid_count++;
    else if (row.status === 'partially_paid') entry.partial_count++;
    else if (row.status === 'unpaid') entry.unpaid_count++;
  }

  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  for (const row of paymentResult.data || []) {
    const date = new Date(row.payment_date);
    const year = date.getFullYear();
    const day = date.getUTCDate();
    const lastDay = new Date(Date.UTC(year, date.getUTCMonth() + 1, 0)).getUTCDate();
    const dayLabel = day === 1 ? `${lastDay}th` : `${day}${day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'}`;
    if (!byYear.has(year)) {
      byYear.set(year, {
        year,
        amount_due: 0,
        amount_paid: 0,
        outstanding: 0,
        paid_count: 0,
        partial_count: 0,
        unpaid_count: 0,
        total_count: 0,
        payments: [],
      });
    }
    byYear.get(year)!.payments.push({
      id: row.id,
      amount: Number(row.amount) || 0,
      payment_date: row.payment_date,
      month_label: months[date.getUTCMonth()],
      day_label: dayLabel,
      method: row.method || 'bank_transfer',
      status: row.status || 'paid',
    });
  }

  const sorted = [...byYear.values()].sort((a, b) => b.year - a.year);
  return { data: sorted, error: null };
}
