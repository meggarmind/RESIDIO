// #1399: Debtors and aging replaces the Debtors and Invoice Aging reports. Its amounts must equal
// theirs for the same invoices; a schedule of a retired report runs as the new one; the server PDF
// can draw a summary-layout report.
import { describe, expect, it, vi } from 'vitest';

import {
  generateReportWithClient,
  generateDebtorsReport,
  generateInvoiceAging,
} from '@/lib/reports/report-generator';
import { isSummaryReport, type SummaryReportData } from '@/lib/reports/summary-report';
import { reportRequestSchema, type ReportRequestFormData } from '@/lib/validators/reports';

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const person = (id: string, first: string) => ({ id, first_name: first, last_name: 'Test', resident_code: `R-${id}`, email: `${id}@x.test`, phone_primary: `080${id}`, phone_secondary: null });
const house = (n: string) => ({ house_number: n, street: { name: 'Palm Close' } });
const invoice = (id: string, resident: ReturnType<typeof person> | null, h: string, due: number, amountDue: number, amountPaid: number) => ({
  id, invoice_number: `INV-${id}`, amount_due: amountDue, amount_paid: amountPaid, status: 'unpaid',
  due_date: daysAgo(due), resident, house: house(h),
});

const A = person('1', 'Ada');
const B = person('2', 'Bola');
// Ages 0, 15, 45, 75, 120 days: one invoice in each bucket, and a settled one that every report skips.
const INVOICES = [
  invoice('a0', A, '1', 0, 10000, 0),
  invoice('a15', A, '1', 15, 20000, 5000),
  invoice('a45', A, '1', 45, 30000, 0),
  invoice('b75', B, '2', 75, 40000, 10000),
  invoice('b120', B, '2', 120, 50000, 0),
  invoice('paid', B, '2', 200, 9000, 9000),
];

function clientWith(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.in = () => Promise.resolve({ data: rows, error: null });
  return { from: () => chain } as never;
}

const params = (over: Partial<ReportRequestFormData> = {}) =>
  ({ ...reportRequestSchema.parse({ reportType: 'debtors_aging', periodPreset: 'this_month' }), ...over }) as ReportRequestFormData;

async function run(rows: unknown[], over: Partial<ReportRequestFormData> = {}): Promise<SummaryReportData> {
  const result = await generateReportWithClient(clientWith(rows), params(over));
  expect(result.success).toBe(true);
  expect(isSummaryReport(result.report)).toBe(true);
  return (result.report as { data: SummaryReportData }).data;
}

describe('Debtors and aging report (#1399)', () => {
  it('returns the summary layout marker and type', async () => {
    const result = await generateReportWithClient(clientWith(INVOICES), params());
    expect(result.report).toMatchObject({ type: 'debtors_aging', layout: 'summary' });
  });

  it('puts each invoice in the right bucket and totals them', async () => {
    const data = await run(INVOICES);
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([
      ['Current', 10000],
      ['1-30 days', 15000],
      ['31-60 days', 30000],
      ['61-90 days', 30000],
      ['Over 90 days', 50000],
    ]);
    expect(data.table.totals).toMatchObject({ current: 10000, days1to30: 15000, days31to60: 30000, days61to90: 30000, over90Days: 50000, total: 135000 });
  });

  it('cuts the buckets at exactly 0, 1, 30, 31, 60, 61, 90 and 91 days', async () => {
    const edge = [[0, 1], [1, 2], [30, 4], [31, 8], [60, 16], [61, 32], [90, 64], [91, 128]]
      .map(([days, amount], i) => invoice(`e${i}`, A, '1', days, amount, 0));
    const data = await run(edge);
    expect(data.chart!.bars.map((b) => b.value)).toEqual([1, 2 + 4, 8 + 16, 32 + 64, 128]);
    // The retired Debtors report cut at the same days (its first bucket was 0-30 together).
    const old = await generateDebtorsReport(clientWith(edge));
    expect([old.summary.current, old.summary.days31to60, old.summary.days61to90, old.summary.over90Days]).toEqual([1 + 2 + 4, 8 + 16, 32 + 64, 128]);
  });

  it('shows the four tiles: total owed, debtors, owed over 90 days, oldest debt', async () => {
    const data = await run(INVOICES);
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Total owed (NGN)', '135,000.00'],
      ['Debtors', 2],
      ['Owed over 90 days (NGN)', '50,000.00'],
      ['Oldest debt', '120 days'],
    ]);
    // Month name, never numeric (CORE.md section 4).
    expect(data.summary[3].hint).toMatch(/^Due \d{2} [A-Z][a-z]{2} \d{4}$/);
  });

  it('has one row per debtor, biggest first, with contact and amounts per bucket', async () => {
    const data = await run(INVOICES, { includeDetails: false });
    expect(data.table.rows).toHaveLength(2);
    expect(data.table.rows[0]).toMatchObject({ debtor: 'Bola Test', house: '2', street: 'Palm Close', contact: '0802, 2@x.test', over90Days: 50000, total: 80000 });
    expect(data.table.rows[1]).toMatchObject({ debtor: 'Ada Test', current: 10000, days1to30: 15000, days31to60: 30000, total: 55000 });
  });

  it('adds one invoice row under each debtor only when invoice lines are on', async () => {
    const off = await run(INVOICES, { includeDetails: false });
    const on = await run(INVOICES, { includeDetails: true });
    expect(off.table.rows).toHaveLength(2);
    expect(on.table.rows).toHaveLength(2 + 5);
    expect(on.table.rows[1].debtor).toMatch(/INV-b120, due \d{2} [A-Z][a-z]{2} \d{4}, 120 days late/);
    expect(on.table.rows[1]).toMatchObject({ over90Days: 50000, total: 50000, house: null });
    // Lines are detail: the totals row and the tiles do not change.
    expect(on.table.totals).toEqual(off.table.totals);
    expect(on.summary).toEqual(off.summary);
  });

  it('reads cleanly with no debts', async () => {
    const data = await run([]);
    expect(data.summary.map((t) => t.value)).toEqual(['0.00', 0, '0.00', 'None']);
    expect(data.table.rows).toEqual([]);
  });

  it('equals the retired Debtors report: debtors, per-debtor and per-bucket amounts', async () => {
    const old = await generateDebtorsReport(clientWith(INVOICES));
    const data = await run(INVOICES, { includeDetails: false });
    const totals = data.table.totals!;
    expect(totals.total).toBe(old.summary.totalOutstanding);
    // The old 0-30 bucket is split in two (not yet due / 1-30 late); the rest are the same.
    expect((totals.current as number) + (totals.days1to30 as number)).toBe(old.summary.current);
    expect(totals.days31to60).toBe(old.summary.days31to60);
    expect(totals.days61to90).toBe(old.summary.days61to90);
    expect(totals.over90Days).toBe(old.summary.over90Days);
    expect(data.summary[1].value).toBe(old.summary.totalDebtors);
    expect(data.table.rows.map((r) => [r.debtor, r.total])).toEqual(old.debtors.map((d) => [d.residentName, d.totalOutstanding]));
  });

  it('equals the retired Invoice Aging report: total and every bracket', async () => {
    const old = await generateInvoiceAging(clientWith(INVOICES));
    const totals = (await run(INVOICES)).table.totals!;
    expect(totals.total).toBe(old.summary.totalOutstanding);
    expect((totals.current as number) + (totals.days1to30 as number)).toBe(old.summary.current);
    expect(totals.days31to60).toBe(old.summary.days30to60);
    expect(totals.days61to90).toBe(old.summary.days60to90);
    expect(totals.over90Days).toBe(old.summary.over90Days);
  });

  it('keeps an invoice with no resident (the Aging report counted it) under "Unknown resident"', async () => {
    const rows = [...INVOICES, invoice('x', null, '9', 10, 7000, 0)];
    const old = await generateInvoiceAging(clientWith(rows));
    const data = await run(rows, { includeDetails: false });
    expect(data.table.totals!.total).toBe(old.summary.totalOutstanding);
    expect(data.table.rows.map((r) => r.debtor)).toContain('Unknown resident');
  });

  it('a database error fails the report with its message', async () => {
    const chain: Record<string, unknown> = { select: () => chain, in: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const result = await generateReportWithClient({ from: () => chain } as never, params());
    spy.mockRestore();
    expect(result).toEqual({ success: false, error: 'boom' });
  });
});

describe('Server PDF for a summary-layout report (#1399)', () => {
  it('renders a PDF for Debtors and aging, with and without invoice lines', async () => {
    const { renderReportPdf } = await import('@/lib/pdf/reports/renderer');
    for (const includeDetails of [false, true]) {
      const data = await run(INVOICES, { includeDetails });
      const buffer = await renderReportPdf('debtors_aging', data, 'Test Estate');
      expect(buffer, String(includeDetails)).not.toBeNull();
      expect(buffer!.subarray(0, 4).toString()).toBe('%PDF');
    }
  });

  it('still returns null for a type with no PDF', async () => {
    const { renderReportPdf } = await import('@/lib/pdf/reports/renderer');
    expect(await renderReportPdf('indebtedness_detail', {}, 'Test Estate')).toBeNull();
  });

  it('draws the tiles, bars and table text', async () => {
    const { SummaryReportPdf } = await import('@/lib/pdf/reports/summary-report-pdf');
    const data = await run(INVOICES, { includeDetails: false });
    const tree = JSON.stringify(SummaryReportPdf({ data, title: 'Debtors and aging', estateName: 'Test Estate' }));
    for (const text of ['Total owed (NGN)', '135,000.00', 'Owed by age (NGN)', 'Over 90 days', 'Bola Test', 'Total']) {
      expect(tree, text).toContain(text);
    }
  });
});

describe('processDueSchedules runs a retired report as Debtors and aging (#1399)', () => {
  it.each(['debtors_report', 'invoice_aging'])('a %s schedule', async (savedType) => {
    vi.resetModules();
    const generate = vi.fn().mockResolvedValue({ success: true, report: { type: 'debtors_aging', layout: 'summary', data: {} } });
    const render = vi.fn().mockResolvedValue(null);
    const schedule = { id: 's1', report_type: savedType, period_preset: 'last_month', frequency: 'monthly', bank_account_ids: [], recipients: [], configuration: {} };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte']) chain[method] = () => chain;
    chain.order = async () => ({ data: [schedule], error: null });
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => chain }) }));
    vi.doMock('@/lib/reports/report-generator', () => ({ generateReportWithClient: generate }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: render }));
    vi.doMock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { processDueSchedules } = await import('@/lib/reports/process-schedules');
    await processDueSchedules();
    expect(generate.mock.calls[0][1].reportType).toBe('debtors_aging');
    expect(render.mock.calls[0][0]).toBe('debtors_aging');
    for (const m of ['@/lib/supabase/server', '@/lib/reports/report-generator', '@/lib/pdf/reports/renderer', '@/lib/email/send-email', '@/lib/audit/logger']) vi.doUnmock(m);
  });
});
