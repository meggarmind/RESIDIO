// #1460: Write-offs report (layout B).
import { describe, expect, it } from 'vitest';

import { generateReportWithClient } from '@/lib/reports/report-generator';
import { isSummaryReport, type SummaryReportData } from '@/lib/reports/summary-report';
import { reportRequestSchema, reportTypes, GENERATABLE_REPORT_TYPES, type ReportRequestFormData } from '@/lib/validators/reports';
import { PERMISSIONS } from '@/lib/auth/action-roles';

type Row = Record<string, unknown>;

/** A Supabase stand-in: filters apply, `.range(a, b)` returns that slice, and no read returns more than 1,000 rows. */
const API_ROW_CAP = 1000;
function client(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const builder: Record<string, unknown> = {};
      const chain = (fn: (...a: never[]) => void) => (...a: unknown[]) => { (fn as (...x: unknown[]) => void)(...a); return builder; };
      builder.select = chain(() => {});
      builder.order = chain(() => {});
      builder.gte = chain((col: string, v: string) => filters.push((r) => String(r[col]) >= v));
      builder.lt = chain((col: string, v: string) => filters.push((r) => String(r[col]) < v));
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      builder.range = (from: number, to: number) =>
        Promise.resolve({ data: rows().slice(from, Math.min(to + 1, from + API_ROW_CAP)), error: null });
      return builder;
    },
  } as never;
}

const params = (over: Partial<ReportRequestFormData> = {}) =>
  ({ ...reportRequestSchema.parse({ reportType: 'write_offs', periodPreset: 'custom', startDate: '2026-11-01', endDate: '2026-11-30' }), ...over }) as ReportRequestFormData;

async function run(rows: Row[], over: Partial<ReportRequestFormData> = {}): Promise<SummaryReportData> {
  const result = await generateReportWithClient(client({ invoice_write_offs: rows }), params(over));
  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  expect(isSummaryReport(result.report)).toBe(true);
  return (result.report as { data: SummaryReportData }).data;
}

const writeOff = (id: string, at: string, amount: number, over: Row = {}): Row => ({
  id,
  batch_id: 'batch-1',
  amount_written_off: amount,
  reason: 'exco_settlement',
  note: 'Exco settlement 4 Nov 2026',
  written_off_at: at,
  resident: { first_name: 'Shakiru', last_name: 'Alhaji' },
  house: { house_number: '36', short_name: 'IBB-36', street: { name: 'Ibrahim Babangida' } },
  invoice: { invoice_number: `INV-${id}`, period_start: '2020-07-01' },
  by: { full_name: 'Chairman Admin' },
  ...over,
});

describe('Write-offs report (#1460)', () => {
  it('is listed under Debts, generatable and needs the financial reports permission', () => {
    const entry = reportTypes.find((r) => r.value === 'write_offs');
    expect(entry?.label).toBe('Write-offs');
    expect(entry?.group).toBe('Debts');
    expect(entry?.permission).toBe(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(GENERATABLE_REPORT_TYPES).toContain('write_offs');
  });

  it('lists each written-off bill in the period with month names and a grand total', async () => {
    const data = await run([
      writeOff('a', '2026-11-05T09:00:00+00:00', 5000),
      writeOff('b', '2026-11-30T23:30:00+00:00', 3000, { reason: 'hardship', invoice: { invoice_number: 'INV-b', period_start: '2020-08-01' } }),
      writeOff('early', '2026-10-31T23:59:00+00:00', 7000),
      writeOff('late', '2026-12-01T00:00:00+00:00', 9000),
    ]);
    expect(data.table.rows).toEqual([
      {
        resident: 'Shakiru Alhaji', house: 'IBB-36', billMonth: 'July 2020', billNumber: 'INV-a', amount: '5,000.00',
        reason: 'Exco settlement', note: 'Exco settlement 4 Nov 2026', by: 'Chairman Admin', when: '05 November 2026',
      },
      {
        resident: 'Shakiru Alhaji', house: 'IBB-36', billMonth: 'August 2020', billNumber: 'INV-b', amount: '3,000.00',
        reason: 'Hardship', note: 'Exco settlement 4 Nov 2026', by: 'Chairman Admin', when: '30 November 2026',
      },
    ]);
    expect(data.table.totals).toMatchObject({ resident: 'Total', billNumber: '2 bills', amount: '8,000.00' });
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Written off (NGN)', '8,000.00'], ['Bills', 2], ['Residents', 1], ['Write-offs', 1],
    ]);
  });

  it('shows dashes for a missing house or author, and an empty report when nothing was written off', async () => {
    const data = await run([writeOff('a', '2026-11-05T09:00:00+00:00', 5000, { house: null, by: null })]);
    expect(data.table.rows[0]).toMatchObject({ house: '-', by: '-' });
    const empty = await run([]);
    expect(empty.table.rows).toEqual([]);
    expect(empty.table.totals).toMatchObject({ amount: '0.00' });
  });

  it('reads every row, not just the first 1,000', async () => {
    const many = Array.from({ length: 1500 }, (_, i) => writeOff(`w${String(i).padStart(5, '0')}`, '2026-11-10T10:00:00+00:00', 1));
    const data = await run(many);
    expect(data.table.rows).toHaveLength(1500);
    expect(data.table.totals).toMatchObject({ amount: '1,500.00' });
  });
});
