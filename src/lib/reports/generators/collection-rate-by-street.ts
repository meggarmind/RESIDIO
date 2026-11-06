/**
 * Collection rate by street (#1403, layout B). Per street: billed, collected, owed and the collection
 * rate. The houses and their streets are the estate debt reports' own (`readReportableHouses`, the
 * rule behind the Collections chart by street and the WhatsApp debt status report), and the street
 * arithmetic is `summarizeCollectionByStreet` beside `summarizeDebtByStreet`.
 *
 * No authorization here: the callers authorize (see the header of report-generator.ts).
 */

import { collectionRate, summarizeCollectionByStreet } from '@/lib/billing/debt-by-street';
import { readReportableHouses } from '@/lib/billing/reportable-houses';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { formatLongDate, formatMoney } from '@/lib/reports/generators/finance-format';

type InvoiceRow = { id: string; house_id: string | null; amount_due: number | string | null; amount_paid: number | string | null };

const pct = (value: number | null) => (value === null ? '-' : `${value.toFixed(1)}%`);

export async function generateCollectionRateByStreet(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
): Promise<SummaryReport> {
  const houses = await readReportableHouses(supabase);

  // Every non-void invoice due in the period, read a page at a time (the API returns at most 1,000 rows).
  const read = await fetchAllRows<InvoiceRow>((from, to) =>
    supabase
      .from('invoices')
      .select('id, house_id, amount_due, amount_paid')
      .neq('status', 'void')
      .not('house_id', 'is', null)
      .gte('due_date', dateRange.startDate)
      .lte('due_date', dateRange.endDate)
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: InvoiceRow[] | null; error: { message: string } | null }>,
  );
  if (read.error !== null) {
    console.error('Error fetching invoices for collection rate by street report:', read.error);
    throw new Error(read.error);
  }

  const streets = summarizeCollectionByStreet(
    houses,
    read.data
      .filter((row) => row.house_id)
      .map((row) => ({ houseId: row.house_id as string, amountDue: Number(row.amount_due) || 0, amountPaid: Number(row.amount_paid) || 0 })),
  );

  const billed = streets.reduce((sum, s) => sum + s.billed, 0);
  const collected = streets.reduce((sum, s) => sum + s.collected, 0);
  const owed = Math.round((billed - collected) * 100) / 100;
  const overall = collectionRate(collected, billed);

  const data: SummaryReportData = {
    summary: [
      { label: 'Billed (NGN)', value: formatMoney(billed), tone: 'neutral' },
      { label: 'Collected (NGN)', value: formatMoney(collected), tone: 'good' },
      { label: 'Owed (NGN)', value: formatMoney(owed), tone: owed > 0 ? 'bad' : 'good' },
      { label: 'Collection rate', value: pct(overall), tone: 'neutral' },
    ],
    chart: {
      title: 'Collection rate by street (%)',
      bars: streets
        .filter((s) => s.collectionRate !== null)
        .sort((a, b) => (b.collectionRate as number) - (a.collectionRate as number))
        .map((s) => ({ label: s.streetName, value: s.collectionRate as number, display: pct(s.collectionRate), tone: 'neutral' as const })),
    },
    table: {
      columns: [
        { key: 'street', label: 'Street' },
        { key: 'houses', label: 'Houses', align: 'right' },
        { key: 'billed', label: 'Billed', align: 'right' },
        { key: 'collected', label: 'Collected', align: 'right' },
        { key: 'owed', label: 'Owed', align: 'right' },
        { key: 'rate', label: 'Collection rate', align: 'right' },
      ],
      rows: streets.map((s) => ({
        street: s.streetName,
        houses: s.houseCount,
        billed: formatMoney(s.billed),
        collected: formatMoney(s.collected),
        owed: formatMoney(s.owed),
        rate: pct(s.collectionRate),
      })),
      totals: {
        street: 'Total',
        houses: streets.reduce((sum, s) => sum + s.houseCount, 0),
        billed: formatMoney(billed),
        collected: formatMoney(collected),
        owed: formatMoney(owed),
        rate: pct(overall),
      },
    },
    notes: [
      `Invoices due from ${formatLongDate(dateRange.startDate)} to ${formatLongDate(dateRange.endDate)}, all charges, void invoices left out.`,
      'Billed is the amount on those invoices. Collected is what has been paid against them. Owed is the rest. Collection rate is collected divided by billed.',
      'Streets and houses are those of the debt status report: active, verified, lived-in houses with an active primary resident.',
    ],
  };

  return { type: 'collection_rate_by_street', layout: 'summary', data };
}
