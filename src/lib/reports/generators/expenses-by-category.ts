/**
 * Expenses by category and vendor (#1403, layout B). Counts the paid expenses dated in the period
 * (pending and cancelled ones are not spent money). Each expense sits in one category and one vendor,
 * so the category rows add up to the total and the vendor rows add up to the same total.
 * "Show expense lines" lists each expense under its category.
 *
 * No authorization here: the callers authorize (see the header of report-generator.ts).
 */

import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryCell, SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { formatLongDate, formatMoney, roundMoney } from '@/lib/reports/generators/finance-format';

type ExpenseRow = {
  id: string;
  amount: number | string | null;
  expense_date: string;
  description: string | null;
  resident_id: string | null;
  staff_id: string | null;
  category: { name: string } | { name: string }[] | null;
  vendor: { name: string } | { name: string }[] | null;
};

const TOP_CATEGORIES = 8;
const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Who was paid: the vendor, else the kind of payee, so no row is left blank. */
function payeeOf(row: ExpenseRow): { key: string; name: string } {
  const vendor = one(row.vendor);
  if (vendor) return { key: `vendor:${vendor.name}`, name: vendor.name };
  if (row.resident_id) return { key: 'resident', name: 'Resident (no vendor)' };
  if (row.staff_id) return { key: 'staff', name: 'Staff (no vendor)' };
  return { key: 'none', name: 'No vendor' };
}

interface Group { name: string; count: number; total: number }

function add(map: Map<string, Group>, key: string, name: string, amount: number) {
  const group = map.get(key) ?? { name, count: 0, total: 0 };
  group.count += 1;
  group.total += amount;
  map.set(key, group);
}

export async function generateExpensesByCategory(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
  showExpenseLines: boolean,
): Promise<SummaryReport> {
  const read = await fetchAllRows<ExpenseRow>((from, to) =>
    supabase
      .from('expenses')
      .select('id, amount, expense_date, description, resident_id, staff_id, category:expense_categories(name), vendor:vendors(name)')
      .eq('status', 'paid')
      .gte('expense_date', dateRange.startDate)
      .lte('expense_date', dateRange.endDate)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: ExpenseRow[] | null; error: { message: string } | null }>,
  );
  if (read.error !== null) {
    console.error('Error fetching expenses for expenses by category report:', read.error);
    throw new Error(read.error);
  }

  const categories = new Map<string, Group>();
  const vendors = new Map<string, Group>();
  const linesByCategory = new Map<string, { date: string; description: string; payee: string; amount: number }[]>();
  let total = 0;
  for (const row of read.data) {
    const amount = Number(row.amount) || 0;
    const categoryName = one(row.category)?.name ?? 'Uncategorised';
    const payee = payeeOf(row);
    total += amount;
    add(categories, categoryName, categoryName, amount);
    add(vendors, payee.key, payee.name, amount);
    const lines = linesByCategory.get(categoryName) ?? [];
    lines.push({ date: row.expense_date, description: row.description ?? '', payee: payee.name, amount });
    linesByCategory.set(categoryName, lines);
  }
  total = roundMoney(total);

  const byTotal = (a: Group, b: Group) => b.total - a.total || a.name.localeCompare(b.name, 'en');
  const categoryList = [...categories.values()].sort(byTotal);
  const vendorList = [...vendors.values()].sort(byTotal);
  const share = (amount: number) => (total > 0 ? `${((amount / total) * 100).toFixed(1)}%` : '-');

  const rows: Record<string, SummaryCell>[] = [];
  for (const group of categoryList) {
    rows.push({ kind: 'Category', name: group.name, count: group.count, total: formatMoney(roundMoney(group.total)), share: share(group.total) });
    if (showExpenseLines) {
      for (const line of (linesByCategory.get(group.name) ?? []).sort((a, b) => a.date.localeCompare(b.date))) {
        rows.push({
          kind: null,
          name: `    ${formatLongDate(line.date)}, ${line.payee}${line.description ? `, ${line.description}` : ''}`,
          count: null,
          total: formatMoney(line.amount),
          share: null,
        });
      }
    }
  }
  for (const group of vendorList) {
    rows.push({ kind: 'Vendor', name: group.name, count: group.count, total: formatMoney(roundMoney(group.total)), share: share(group.total) });
  }

  const top = categoryList[0];
  const data: SummaryReportData = {
    summary: [
      { label: 'Total spent (NGN)', value: formatMoney(total), tone: 'neutral' },
      { label: 'Expenses', value: read.data.length, tone: 'neutral' },
      { label: 'Categories used', value: categoryList.length, tone: 'neutral' },
      top
        ? { label: 'Largest category', value: top.name, tone: 'neutral', hint: formatMoney(roundMoney(top.total)) }
        : { label: 'Largest category', value: 'None', tone: 'neutral' },
    ],
    chart: {
      title: `Top categories (NGN)`,
      bars: categoryList.slice(0, TOP_CATEGORIES).map((g) => ({ label: g.name, value: roundMoney(g.total), display: formatMoney(roundMoney(g.total)), tone: 'neutral' as const })),
    },
    table: {
      columns: [
        { key: 'kind', label: 'Group' },
        { key: 'name', label: 'Category or vendor' },
        { key: 'count', label: 'Expenses', align: 'right' },
        { key: 'total', label: 'Total', align: 'right' },
        { key: 'share', label: 'Share', align: 'right' },
      ],
      rows,
      totals: { kind: 'Total', name: null, count: read.data.length, total: formatMoney(total), share: total > 0 ? '100.0%' : '-' },
    },
    notes: [
      `Paid expenses dated from ${formatLongDate(dateRange.startDate)} to ${formatLongDate(dateRange.endDate)}. Pending and cancelled expenses are left out.`,
      'The category rows add up to the total, and so do the vendor rows. Each expense is in one category and one vendor.',
      ...(categoryList.length > TOP_CATEGORIES ? [`The chart shows the ${TOP_CATEGORIES} largest categories. The table lists all of them.`] : []),
    ],
  };

  return { type: 'expenses_by_category', layout: 'summary', data };
}
