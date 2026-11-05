/**
 * Write-offs (#1460, layout B). Every bill written off in the period (by written_off_at): resident,
 * house, bill month, bill number, the amount written off, the reason, the note, who and when, with
 * a grand total. Undone write-offs are not shown: undo deletes their rows.
 *
 * Days are UTC days, as the timestamps are stored (the rule of the wallet balances report).
 *
 * No authorization here: the callers authorize (see the header of report-generator.ts).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAllRows, type FetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import type { SummaryReport, SummaryReportData } from '@/lib/reports/summary-report';
import { formatLongDate, formatMoney, monthName, roundMoney } from '@/lib/reports/generators/finance-format';
import { WRITE_OFF_REASON_LABELS, type WriteOffReason } from '@/types/database';

type Embed<T> = T | T[] | null;
const one = <T,>(value: Embed<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

type WriteOffRow = {
  id: string;
  batch_id: string;
  amount_written_off: number | string | null;
  reason: WriteOffReason;
  note: string;
  written_off_at: string;
  resident: Embed<{ first_name: string; last_name: string }>;
  house: Embed<{ house_number: string; short_name: string | null; street: Embed<{ name: string }> }>;
  invoice: Embed<{ invoice_number: string; period_start: string | null }>;
  by: Embed<{ full_name: string | null }>;
};

/** One written-off bill, as the report and `getWriteOffs` show it. */
export type WriteOffReportRow = {
  id: string;
  batchId: string;
  resident: string;
  house: string;
  billMonth: string;
  billNumber: string;
  amount: number;
  reason: string;
  note: string;
  by: string;
  writtenOffAt: string;
};

/** The day after a `YYYY-MM-DD` date, as `YYYY-MM-DD` (UTC). */
function nextDay(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

/** Reads the write-offs made from startDate to endDate (both inclusive), oldest first. */
export async function readWriteOffs(
  supabase: ReportSupabaseClient | SupabaseClient,
  dateRange: { startDate: string; endDate: string },
): Promise<FetchAllRowsResult<WriteOffReportRow>> {
  // invoice_write_offs is not in the generated types until its migration is applied.
  const db = supabase as unknown as SupabaseClient;
  const read = await fetchAllRows<WriteOffRow>((from, to) =>
    db
      .from('invoice_write_offs')
      .select(`id, batch_id, amount_written_off, reason, note, written_off_at,
        resident:residents!invoice_write_offs_resident_id_fkey(first_name, last_name),
        house:houses!invoice_write_offs_house_id_fkey(house_number, short_name, street:streets(name)),
        invoice:invoices!invoice_write_offs_invoice_id_fkey(invoice_number, period_start),
        by:profiles!invoice_write_offs_written_off_by_fkey(full_name)`)
      .gte('written_off_at', dateRange.startDate)
      .lt('written_off_at', nextDay(dateRange.endDate))
      .order('written_off_at')
      .order('id')
      .range(from, to) as unknown as PromiseLike<{ data: WriteOffRow[] | null; error: { message: string } | null }>,
  );
  if (read.error !== null) return read;

  return {
    data: read.data.map((row) => {
      const resident = one(row.resident);
      const house = one(row.house);
      const invoice = one(row.invoice);
      const street = house ? one(house.street)?.name : null;
      return {
        id: row.id,
        batchId: row.batch_id,
        resident: resident ? `${resident.first_name} ${resident.last_name}`.trim() : '-',
        house: house ? house.short_name || `${house.house_number}, ${street || 'Estate'}` : '-',
        billMonth: invoice?.period_start ? monthName(invoice.period_start.slice(0, 7)) : '-',
        billNumber: invoice?.invoice_number ?? '-',
        amount: Number(row.amount_written_off) || 0,
        reason: WRITE_OFF_REASON_LABELS[row.reason] ?? row.reason,
        note: row.note,
        by: one(row.by)?.full_name || '-',
        writtenOffAt: formatLongDate(row.written_off_at.slice(0, 10)),
      };
    }),
    error: null,
  };
}

export async function generateWriteOffs(
  supabase: ReportSupabaseClient,
  dateRange: { startDate: string; endDate: string },
): Promise<SummaryReport> {
  const read = await readWriteOffs(supabase, dateRange);
  if (read.error !== null) {
    console.error('Error fetching invoice write-offs for write-offs report:', read.error);
    throw new Error(read.error);
  }
  const rows = read.data;
  const total = roundMoney(rows.reduce((sum, row) => sum + row.amount, 0));
  const residents = new Set(rows.map((row) => row.resident)).size;
  const batches = new Set(rows.map((row) => row.batchId)).size;

  const data: SummaryReportData = {
    summary: [
      { label: 'Written off (NGN)', value: formatMoney(total), tone: 'neutral' },
      { label: 'Bills', value: rows.length, tone: 'neutral' },
      { label: 'Residents', value: residents, tone: 'neutral' },
      { label: 'Write-offs', value: batches, tone: 'neutral' },
    ],
    table: {
      columns: [
        { key: 'resident', label: 'Resident' },
        { key: 'house', label: 'House' },
        { key: 'billMonth', label: 'Bill month' },
        { key: 'billNumber', label: 'Bill no.' },
        { key: 'amount', label: 'Amount written off', align: 'right' },
        { key: 'reason', label: 'Reason' },
        { key: 'note', label: 'Note' },
        { key: 'by', label: 'By' },
        { key: 'when', label: 'When' },
      ],
      rows: rows.map((row) => ({
        resident: row.resident,
        house: row.house,
        billMonth: row.billMonth,
        billNumber: row.billNumber,
        amount: formatMoney(row.amount),
        reason: row.reason,
        note: row.note,
        by: row.by,
        when: row.writtenOffAt,
      })),
      totals: {
        resident: 'Total',
        house: null,
        billMonth: null,
        billNumber: `${rows.length} bills`,
        amount: formatMoney(total),
        reason: null,
        note: null,
        by: null,
        when: null,
      },
    },
    notes: [
      `Bills written off from ${formatLongDate(dateRange.startDate)} to ${formatLongDate(dateRange.endDate)}, all charges.`,
      'The amount is the unpaid balance that was written off. For a part-paid bill, the paid part stays on the bill.',
      'A write-off that was undone is not shown.',
    ],
  };

  return { type: 'write_offs', layout: 'summary', data };
}
