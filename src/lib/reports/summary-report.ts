/**
 * "Summary first" report layout (#1397, mockup option B): up to four summary tiles, an optional
 * bar chart, then one table. A report result opts in with `layout: 'summary'`; the viewer, the
 * print templates and CSV export pick it up from that marker, so a new report of this shape needs
 * no change to their per-type switches.
 *
 * Values are shown as given. Generators format dates before they put them here, with month names
 * (`dd mmm yyyy`, CORE.md section 4), e.g. through `formatCalendarDate` in `@/lib/utils/calendar-date`.
 */

import { formatCalendarDate } from '@/lib/utils/calendar-date';

export type SummaryTone = 'good' | 'bad' | 'neutral';

/** A house's state in one month: the vocabulary of the estate map and `PAYMENT_STATUS_META`. */
export type SummaryGridStatus = 'paid_up' | 'outstanding' | 'overdue' | 'no_invoice';

/**
 * Optional extra view (mockup option C, #1400): houses down, months across. Shown on screen only, so a
 * report without it is unchanged. `houses[].months` has one status per entry of `months`, by its `key`.
 */
export interface SummaryGrid {
  months: { key: string; label: string }[];
  houses: {
    id: string;
    houseNumber: string;
    streetName: string;
    /** Levy status text, e.g. "Paid" or "No levy". */
    levy: string;
    owed: number;
    months: Record<string, SummaryGridStatus>;
  }[];
}

export type SummaryCell = string | number | null;

export interface SummaryReportData {
  /** At most MAX_SUMMARY_TILES; extra entries are not shown. */
  summary: { label: string; value: string | number; tone?: SummaryTone; hint?: string }[];
  chart?: {
    title: string;
    bars: { label: string; value: number; display?: string; tone?: SummaryTone }[];
  };
  table: {
    columns: { key: string; label: string; align?: 'left' | 'right' | 'center' }[];
    rows: Record<string, SummaryCell>[];
    totals?: Record<string, SummaryCell>;
  };
  notes?: string[];
  grid?: SummaryGrid;
  /** The charge a report covers (e.g. "Security Dues"); it goes in the report title (#1400). */
  chargeName?: string;
  /** Who and when a one-account report covers, e.g. "12, Palm Close, 01 January 2026 to 31 October 2026"; it goes in the title (#1402). */
  subject?: string;
}

/**
 * Report types that use this layout. A later report adds its value here, and its generator
 * returns `{ type, layout: 'summary', data }`.
 */
export type SummaryLayoutReportType =
  | 'debtors_aging'
  | 'dues_collection_status'
  | 'collection_rate_by_street'
  | 'expenses_by_category'
  | 'wallet_balances'
  | 'statement_of_account';

export interface SummaryReport {
  type: SummaryLayoutReportType;
  layout: 'summary';
  data: SummaryReportData;
}

export const MAX_SUMMARY_TILES = 4;

/** Title of a report that shows the position on one day for one charge: "<report> - <Charge> - As of 02 November 2026". */
export function asOfChargeTitle(label: string, chargeName: string | undefined, date: Date = new Date()): string {
  const day = formatCalendarDate(date, 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  return `${label}${chargeName ? ` - ${chargeName}` : ''} - As of ${day}`;
}

/** Title of a report for one house or resident: "<report> - <subject>" (#1402). */
export function subjectTitle(label: string, subject: string | undefined): string {
  return subject ? `${label} - ${subject}` : label;
}

/** True for a report result that asks for the summary-first layout. */
export function isSummaryReport(report: unknown): report is SummaryReport {
  return (
    typeof report === 'object' &&
    report !== null &&
    (report as { layout?: unknown }).layout === 'summary' &&
    typeof (report as { data?: unknown }).data === 'object' &&
    (report as { data?: unknown }).data !== null
  );
}

/** Shows a cell: numbers with thousands separators, null as empty. */
export function formatSummaryCell(value: SummaryCell | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') return value.toLocaleString('en-GB');
  return value;
}

function csvField(value: SummaryCell | undefined): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV of the table: a header row of column labels, the rows, then the totals row if any. */
export function summaryTableToCsv(table: SummaryReportData['table']): string {
  const keys = table.columns.map((c) => c.key);
  const lines = [table.columns.map((c) => csvField(c.label)).join(',')];
  for (const row of table.rows) lines.push(keys.map((k) => csvField(row[k])).join(','));
  if (table.totals) lines.push(keys.map((k) => csvField(table.totals![k])).join(','));
  return lines.join('\n');
}
