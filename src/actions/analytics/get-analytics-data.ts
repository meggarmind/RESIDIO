'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AnalyticsData,
  AnalyticsResponse,
  TimeSeriesDataPoint,
  CategoryData,
  OccupancyData,
  PaymentComplianceData,
  KPIData,
} from '@/types/analytics';

/**
 * Get Analytics Data
 *
 * Fetches comprehensive analytics data for the dashboard.
 * Uses parallel queries for optimal performance.
 */
export async function getAnalyticsData(
  startDate: string,
  endDate: string
): Promise<AnalyticsResponse> {
  const supabase = await createServerSupabaseClient();

  try {
    // Parallel fetch all analytics data
    const [
      revenueTrend,
      collectionRateTrend,
      paymentMethods,
      invoiceCategories,
      currentOccupancy,
      paymentCompliance,
      kpis,
    ] = await Promise.all([
      fetchRevenueTrend(supabase, startDate, endDate),
      fetchCollectionRateTrend(supabase, startDate, endDate),
      fetchPaymentMethods(supabase, startDate, endDate),
      fetchInvoiceCategories(supabase, startDate, endDate),
      fetchOccupancy(supabase),
      fetchPaymentCompliance(supabase, startDate, endDate),
      fetchKPIs(supabase, startDate, endDate),
    ]);

    return {
      data: {
        revenueTrend,
        collectionRateTrend,
        paymentMethods,
        invoiceCategories,
        currentOccupancy,
        paymentCompliance,
        kpis,
        lastUpdated: new Date().toISOString(),
      },
      error: null,
    };
  } catch (err) {
    console.error('Analytics data error:', err);
    return { data: null, error: 'Failed to fetch analytics data' };
  }
}

// ─────────────────────────────────────────────────────────────────
// Revenue Trend (Last 12 months of payments)
// ─────────────────────────────────────────────────────────────────

async function fetchRevenueTrend(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<TimeSeriesDataPoint[]> {
  // Get payments within date range, grouped by month
  const { data: payments } = await supabase
    .from('payment_records')
    .select('amount, payment_date')
    .gte('payment_date', startDate)
    .lte('payment_date', endDate)
    .eq('status', 'paid')
    .order('payment_date', { ascending: true });

  // Group by month
  const monthlyData = new Map<string, { revenue: number; expenses: number }>();

  payments?.forEach((p) => {
    const date = new Date(p.payment_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData.has(key)) {
      monthlyData.set(key, { revenue: 0, expenses: 0 });
    }

    const current = monthlyData.get(key)!;
    current.revenue += Number(p.amount) || 0;
    monthlyData.set(key, current);
  });

  // Fetch expenses for the same period to show in trend
  const { data: expenses } = await supabase
    .from('expenses')
    .select('amount, expense_date')
    .gte('expense_date', startDate)
    .lte('expense_date', endDate)
    .eq('status', 'paid');

  expenses?.forEach((e) => {
    const date = new Date(e.expense_date);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData.has(key)) {
      monthlyData.set(key, { revenue: 0, expenses: 0 });
    }

    const current = monthlyData.get(key)!;
    current.expenses += Number(e.amount) || 0;
    monthlyData.set(key, current);
  });

  // Convert to array and format
  const result: TimeSeriesDataPoint[] = [];
  const sortedKeys = Array.from(monthlyData.keys()).sort();

  sortedKeys.forEach((key) => {
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const data = monthlyData.get(key)!;

    result.push({
      date: key,
      label,
      value: data.revenue,
      secondaryValue: data.expenses,
    });
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Collection Rate Trend
// ─────────────────────────────────────────────────────────────────

async function fetchCollectionRateTrend(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<TimeSeriesDataPoint[]> {
  // Get invoices within date range
  const { data: invoices } = await supabase
    .from('invoices')
    .select('amount_due, amount_paid, created_at')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .neq('status', 'void')
    .order('created_at', { ascending: true });

  // Group by month
  const monthlyData = new Map<string, { due: number; paid: number }>();

  invoices?.forEach((inv) => {
    const date = new Date(inv.created_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!monthlyData.has(key)) {
      monthlyData.set(key, { due: 0, paid: 0 });
    }

    const current = monthlyData.get(key)!;
    current.due += Number(inv.amount_due) || 0;
    current.paid += Number(inv.amount_paid) || 0;
    monthlyData.set(key, current);
  });

  // Convert to array with collection rate percentage
  const result: TimeSeriesDataPoint[] = [];
  const sortedKeys = Array.from(monthlyData.keys()).sort();

  sortedKeys.forEach((key) => {
    const [year, month] = key.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1, 1);
    const label = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    const data = monthlyData.get(key)!;
    const rate = data.due > 0 ? (data.paid / data.due) * 100 : 0;

    result.push({
      date: key,
      label,
      value: Math.round(rate * 10) / 10, // Round to 1 decimal
    });
  });

  return result;
}

// ─────────────────────────────────────────────────────────────────
// Payment Methods Distribution
// ─────────────────────────────────────────────────────────────────

async function fetchPaymentMethods(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<CategoryData[]> {
  const { data: payments } = await supabase
    .from('payment_records')
    .select('payment_method, amount')
    .gte('payment_date', startDate)
    .lte('payment_date', endDate)
    .eq('status', 'paid');

  // Group by payment method
  const methodData = new Map<string, { count: number; amount: number }>();

  payments?.forEach((p) => {
    const method = p.payment_method || 'unknown';

    if (!methodData.has(method)) {
      methodData.set(method, { count: 0, amount: 0 });
    }

    const current = methodData.get(method)!;
    current.count += 1;
    current.amount += Number(p.amount) || 0;
    methodData.set(method, current);
  });

  // Calculate total for percentages
  const total = Array.from(methodData.values()).reduce((sum, d) => sum + d.amount, 0);

  // Convert to array with colors
  const colors: Record<string, string> = {
    bank_transfer: 'hsl(var(--chart-1))',
    cash: 'hsl(var(--chart-2))',
    wallet: 'hsl(var(--chart-3))',
    cheque: 'hsl(var(--chart-4))',
    unknown: 'hsl(var(--chart-5))',
  };

  const methodLabels: Record<string, string> = {
    bank_transfer: 'Bank Transfer',
    cash: 'Cash',
    wallet: 'Wallet',
    cheque: 'Cheque',
    unknown: 'Other',
  };

  return Array.from(methodData.entries()).map(([method, data]) => ({
    category: methodLabels[method] || method,
    count: data.count,
    amount: data.amount,
    percentage: total > 0 ? Math.round((data.amount / total) * 1000) / 10 : 0,
    color: colors[method] || 'hsl(var(--muted))',
  }));
}

// ─────────────────────────────────────────────────────────────────
// Invoice Categories Breakdown
// ─────────────────────────────────────────────────────────────────

async function fetchInvoiceCategories(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<CategoryData[]> {
  // Get invoices with their billing profiles
  const { data: invoices } = await supabase
    .from('invoices')
    .select('amount_due, billing_profile:billing_profiles(name)')
    .gte('created_at', startDate)
    .lte('created_at', endDate)
    .neq('status', 'void');

  // Group by billing profile
  const categoryData = new Map<string, { count: number; amount: number }>();

  invoices?.forEach((inv) => {
    // Handle billing_profile which may be an object or array depending on Supabase inference
    const bp = inv.billing_profile as unknown;
    const billingProfile = Array.isArray(bp) ? bp[0] : bp;
    const category = (billingProfile as { name?: string } | null)?.name || 'Uncategorized';

    if (!categoryData.has(category)) {
      categoryData.set(category, { count: 0, amount: 0 });
    }

    const current = categoryData.get(category)!;
    current.count += 1;
    current.amount += Number(inv.amount_due) || 0;
    categoryData.set(category, current);
  });

  // Calculate total for percentages
  const total = Array.from(categoryData.values()).reduce((sum, d) => sum + d.amount, 0);

  // Convert to array sorted by amount (descending)
  return Array.from(categoryData.entries())
    .map(([category, data], index) => ({
      category,
      count: data.count,
      amount: data.amount,
      percentage: total > 0 ? Math.round((data.amount / total) * 1000) / 10 : 0,
      color: `hsl(var(--chart-${(index % 5) + 1}))`,
    }))
    .sort((a, b) => b.amount - a.amount);
}

// ─────────────────────────────────────────────────────────────────
// Current Occupancy
// ─────────────────────────────────────────────────────────────────

async function fetchOccupancy(supabase: SupabaseClient): Promise<OccupancyData> {
  const [{ count: totalHouses }, { count: occupiedHouses }] = await Promise.all([
    supabase.from('houses').select('*', { count: 'exact', head: true }).eq('is_active', true),
    supabase
      .from('houses')
      .select('*', { count: 'exact', head: true })
      .eq('is_active', true)
      .eq('is_occupied', true),
  ]);

  const total = totalHouses ?? 0;
  const occupied = occupiedHouses ?? 0;
  const vacant = total - occupied;
  const percentage = total > 0 ? Math.round((occupied / total) * 1000) / 10 : 0;

  return { occupied, vacant, total, percentage };
}

// ─────────────────────────────────────────────────────────────────
// Payment Compliance (On-time vs Late)
// ─────────────────────────────────────────────────────────────────

async function fetchPaymentCompliance(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<PaymentComplianceData> {
  // Get invoices that are paid or partially paid within date range
  const { data: invoices } = await supabase
    .from('invoices')
    .select('due_date, updated_at, status')
    .in('status', ['paid', 'partially_paid'])
    .gte('created_at', startDate)
    .lte('created_at', endDate);

  let onTime = 0;
  let late = 0;

  invoices?.forEach((inv) => {
    if (inv.status === 'paid' && inv.due_date && inv.updated_at) {
      const dueDate = new Date(inv.due_date);
      const paidDate = new Date(inv.updated_at);

      if (paidDate <= dueDate) {
        onTime++;
      } else {
        late++;
      }
    } else if (inv.status === 'partially_paid') {
      // Partial payments count as late for simplicity
      late++;
    }
  });

  const total = onTime + late;
  const percentage = total > 0 ? Math.round((onTime / total) * 1000) / 10 : 0;

  return { onTime, late, total, percentage };
}

// ─────────────────────────────────────────────────────────────────
// KPIs (Key Performance Indicators)
// ─────────────────────────────────────────────────────────────────

async function fetchKPIs(
  supabase: SupabaseClient,
  startDate: string,
  endDate: string
): Promise<KPIData> {
  // Parallel fetch revenue, invoices, and occupancy
  const [paymentsResult, invoicesResult, occupancyResult] = await Promise.all([
    // Total revenue from payments
    supabase
      .from('payment_records')
      .select('amount')
      .gte('payment_date', startDate)
      .lte('payment_date', endDate)
      .eq('status', 'paid'),
    // Invoice totals
    supabase
      .from('invoices')
      .select('amount_due, amount_paid')
      .gte('created_at', startDate)
      .lte('created_at', endDate)
      .neq('status', 'void'),
    // Occupancy
    fetchOccupancy(supabase),
  ]);

  const totalRevenue =
    paymentsResult.data?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) ?? 0;

  const totalDue =
    invoicesResult.data?.reduce((sum, i) => sum + (Number(i.amount_due) || 0), 0) ?? 0;

  const totalPaid =
    invoicesResult.data?.reduce((sum, i) => sum + (Number(i.amount_paid) || 0), 0) ?? 0;

  const collectionRate = totalDue > 0 ? Math.round((totalPaid / totalDue) * 1000) / 10 : 0;

  // Fetch real expenses from the new table
  const { data: expensesResult } = await supabase
    .from('expenses')
    .select('amount')
    .gte('expense_date', startDate)
    .lte('expense_date', endDate)
    .eq('status', 'paid');

  const totalExpenses =
    expensesResult?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) ?? 0;

  const netIncome = totalRevenue - totalExpenses;

  return {
    totalRevenue,
    totalExpenses,
    netIncome,
    collectionRate,
    occupancyRate: occupancyResult.percentage,
  };
}
