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
const n = (v: unknown) => Number(String(v).replace(/,/g, ''));
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

// Like the API: a read with no range returns at most 1,000 rows; `.range(a, b)` returns that slice.
const API_ROW_CAP = 1000;
const reads = { ranges: [] as [number, number][] };
function clientWith(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.in = () => {
    const read: Record<string, unknown> = {};
    read.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
      Promise.resolve({ data: rows.slice(0, API_ROW_CAP), error: null }).then(resolve, reject);
    read.order = () => read;
    read.range = (from: number, to: number) => {
      reads.ranges.push([from, to]);
      return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + API_ROW_CAP)), error: null });
    };
    return read;
  };
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
    expect(data.table.totals).toMatchObject({ current: '10,000.00', days1to30: '15,000.00', days31to60: '30,000.00', days61to90: '30,000.00', over90Days: '50,000.00', total: '135,000.00' });
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
    expect(data.summary[3].hint).toMatch(/^Due \d{2} [A-Z][a-z]{3,8} \d{4}$/);
    expect(data.summary[3].hint).not.toMatch(/\d{1,2}[/-]\d{1,2}/);
  });

  it('has one row per debtor, biggest first, with contact and amounts per bucket', async () => {
    const data = await run(INVOICES, { includeDetails: false });
    expect(data.table.rows).toHaveLength(2);
    expect(data.table.rows[0]).toMatchObject({ debtor: 'Bola Test', house: '2', street: 'Palm Close', contact: '0802, 2@x.test', over90Days: '50,000.00', total: '80,000.00' });
    expect(data.table.rows[1]).toMatchObject({ debtor: 'Ada Test', current: '10,000.00', days1to30: '15,000.00', days31to60: '30,000.00', total: '55,000.00' });
  });

  it('adds one invoice row under each debtor only when invoice lines are on', async () => {
    const off = await run(INVOICES, { includeDetails: false });
    const on = await run(INVOICES, { includeDetails: true });
    expect(off.table.rows).toHaveLength(2);
    expect(on.table.rows).toHaveLength(2 + 5);
    expect(on.table.rows[1].debtor).toMatch(/INV-b120, due \d{2} [A-Z][a-z]{3,8} \d{4}, 120 days late/);
    expect(on.table.rows[1]).toMatchObject({ over90Days: '50,000.00', total: '50,000.00', house: null });
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
    expect(n(totals.total)).toBe(old.summary.totalOutstanding);
    // The old 0-30 bucket is split in two (not yet due / 1-30 late); the rest are the same.
    expect(n(totals.current) + n(totals.days1to30)).toBe(old.summary.current);
    expect(n(totals.days31to60)).toBe(old.summary.days31to60);
    expect(n(totals.days61to90)).toBe(old.summary.days61to90);
    expect(n(totals.over90Days)).toBe(old.summary.over90Days);
    expect(data.summary[1].value).toBe(old.summary.totalDebtors);
    expect(data.table.rows.map((r) => r.debtor)).toEqual(old.debtors.map((d) => d.residentName));
    expect(data.table.rows.map((r) => n(r.total))).toEqual(old.debtors.map((d) => d.totalOutstanding));
  });

  it('equals the retired Invoice Aging report: total and every bracket', async () => {
    const old = await generateInvoiceAging(clientWith(INVOICES));
    const totals = (await run(INVOICES)).table.totals!;
    expect(n(totals.total)).toBe(old.summary.totalOutstanding);
    expect(n(totals.current) + n(totals.days1to30)).toBe(old.summary.current);
    expect(n(totals.days31to60)).toBe(old.summary.days30to60);
    expect(n(totals.days61to90)).toBe(old.summary.days60to90);
    expect(n(totals.over90Days)).toBe(old.summary.over90Days);
  });

  it('shows every money cell with 2 decimals', async () => {
    const data = await run([invoice('m', A, '1', 5, 1234.5, 0)], { includeDetails: false });
    expect(data.table.rows[0]).toMatchObject({ days1to30: '1,234.50', current: '0.00', total: '1,234.50' });
    expect(data.table.totals).toMatchObject({ days1to30: '1,234.50', total: '1,234.50' });
  });

  it('counts an invoice with no resident in the money, one "No resident linked" row per house, not as a debtor', async () => {
    const rows = [...INVOICES, invoice('x', null, '9', 10, 7000, 0), invoice('y', null, '8', 20, 3000, 0), invoice('z', null, '9', 30, 500, 0)];
    const old = await generateInvoiceAging(clientWith(rows));
    const data = await run(rows, { includeDetails: false });
    expect(n(data.table.totals!.total)).toBe(old.summary.totalOutstanding);
    const unlinked = data.table.rows.filter((r) => r.debtor === 'No resident linked');
    expect(unlinked.map((r) => [r.house, r.total]).sort()).toEqual([['8', '3,000.00'], ['9', '7,500.00']]);
    expect(data.table.rows.map((r) => r.debtor)).not.toContain('Unknown resident');
    expect(data.summary[1].value).toBe(2);
    expect(data.notes!.join(' ')).toContain('No resident linked');
    expect((await run(INVOICES)).notes!.join(' ')).not.toContain('No resident linked');
  });

  it('reads every page of invoices, so more than 1,000 are all in the totals', async () => {
    reads.ranges = [];
    const many = Array.from({ length: 2030 }, (_, i) => invoice(`p${i}`, i % 2 ? A : B, i % 2 ? '1' : '2', 100, 100, 0));
    const data = await run(many, { includeDetails: false });
    expect(reads.ranges).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
    expect(n(data.table.totals!.total)).toBe(2030 * 100);
    expect(data.summary[1].value).toBe(2);
    // A read with no range stops at the API cap, which is why the old reports (kept unchanged as
    // the test reference) are not used for this check.
    expect((await generateInvoiceAging(clientWith(many))).summary.totalOutstanding).toBe(1000 * 100);
  });

  it('stops after a full last page with one more empty read, and after a short page at once', async () => {
    reads.ranges = [];
    await run(Array.from({ length: 1000 }, (_, i) => invoice(`q${i}`, A, '1', 5, 10, 0)));
    expect(reads.ranges).toEqual([[0, 999], [1000, 1999]]);
    reads.ranges = [];
    await run(INVOICES);
    expect(reads.ranges).toEqual([[0, 999]]);
    reads.ranges = [];
    await run(Array.from({ length: 999 }, (_, i) => invoice(`r${i}`, A, '1', 5, 10, 0)));
    expect(reads.ranges).toEqual([[0, 999]]);
  });

  it('a database error fails the report with its message', async () => {
    const read = { order: () => read, range: () => Promise.resolve({ data: null, error: { message: 'boom' } }) };
    const chain: Record<string, unknown> = { select: () => chain, in: () => read };
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

async function runSchedule(schedule: Record<string, unknown>, renderResult: Buffer | null = null) {
  vi.resetModules();
  const generate = vi.fn().mockResolvedValue({ success: true, report: { type: 'debtors_aging', layout: 'summary', data: {} } });
  const render = vi.fn().mockResolvedValue(renderResult);
  const inserted: Record<string, unknown>[] = [];
  const uploaded: string[] = [];
  const send = vi.fn().mockResolvedValue({ success: true });
  const email = vi.fn((props: unknown) => props);
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'lte', 'update']) chain[method] = () => chain;
  chain.order = async () => ({ data: [schedule], error: null });
  chain.insert = (row: Record<string, unknown>) => { inserted.push(row); return chain; };
  chain.single = async () => ({ data: { id: 'a1' }, error: null });
  vi.doMock('@/lib/supabase/server', () => ({
    createAdminClient: () => ({
      from: () => chain,
      storage: { from: () => ({ upload: async (name: string) => { uploaded.push(name); return { error: null }; } }) },
    }),
  }));
  vi.doMock('@/lib/reports/report-generator', () => ({ generateReportWithClient: generate }));
  vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: render }));
  vi.doMock('@/lib/email/send-email', () => ({ sendEmail: send, getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }) }));
  vi.doMock('@/emails/scheduled-report', () => ({ ScheduledReportEmail: email }));
  vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
  const { processDueSchedules } = await import('@/lib/reports/process-schedules');
  await processDueSchedules();
  for (const m of ['@/lib/supabase/server', '@/lib/reports/report-generator', '@/lib/pdf/reports/renderer', '@/lib/email/send-email', '@/emails/scheduled-report', '@/lib/audit/logger']) vi.doUnmock(m);
  return { generate, render, inserted, uploaded, send, email };
}

const baseSchedule = { id: 's1', period_preset: 'last_month', frequency: 'monthly', bank_account_ids: [], recipients: ['a@x.test'], configuration: {}, include_summary: true };

describe('processDueSchedules runs a retired report as Debtors and aging (#1399)', () => {
  it.each(['debtors_report', 'invoice_aging'])('a %s schedule', async (savedType) => {
    const r = await runSchedule({ ...baseSchedule, report_type: savedType }, Buffer.from('%PDF-test'));
    expect(r.generate.mock.calls[0][1].reportType).toBe('debtors_aging');
    expect(r.render.mock.calls[0][0]).toBe('debtors_aging');
    // The archive row, the stored file name and the email all use the resolved type.
    expect(r.inserted[0].report_type).toBe('debtors_aging');
    expect(r.uploaded[0]).toMatch(/^debtors_aging-/);
    expect(r.send.mock.calls[0][0].subject).toBe('Scheduled Report: debtors_aging');
    expect(r.send.mock.calls[0][0].metadata.reportType).toBe('debtors_aging');
    // A point-in-time report states no period in the email.
    expect(r.email.mock.calls[0][0]).toMatchObject({ reportLabel: 'Debtors and aging', periodLabel: undefined });
  });

  it('a period report still states its period', async () => {
    const r = await runSchedule({ ...baseSchedule, report_type: 'transaction_log' }, Buffer.from('%PDF-test'));
    expect((r.email.mock.calls[0][0] as { periodLabel: string }).periodLabel).toMatch(/ to /);
  });
});

describe('Invoice lines follow the saved choice (#1399)', () => {
  it.each([
    ['debtors_aging', true, true],
    ['debtors_aging', false, false],
    ['debtors_aging', null, false],
    ['debtors_report', true, false],
    ['invoice_aging', true, false],
    ['transaction_log', false, true],
  ])('%s with include_summary %s generates with includeDetails %s', async (type, includeSummary, expected) => {
    const r = await runSchedule({ ...baseSchedule, report_type: type, include_summary: includeSummary });
    expect(r.generate.mock.calls[0][1].includeDetails).toBe(expected);
  });
});

describe('saveGeneratedReport refuses an unknown report type (#1399)', () => {
  it('writes nothing for a type outside the list', async () => {
    vi.resetModules();
    const from = vi.fn();
    vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1', permissions: [] }) }));
    vi.doMock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ from }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { saveGeneratedReport } = await import('@/actions/reports/report-schedules');
    const base = { name: 'x', period_start: '2026-01-01', period_end: '2026-01-31', report_data: {} };
    expect(await saveGeneratedReport({ ...base, report_type: 'bogus' as never })).toEqual({ data: null, error: 'Unknown report type' });
    expect(from).not.toHaveBeenCalled();
    for (const m of ['@/lib/auth/authorize', '@/lib/supabase/server', '@/lib/audit/logger']) vi.doUnmock(m);
  });
});

describe('/api/reports/download regenerates a retired History row as Debtors and aging (#1399)', () => {
  async function download(query: string) {
    vi.resetModules();
    const generateReport = vi.fn().mockResolvedValue({ success: true, report: { type: 'debtors_aging', layout: 'summary', data: {} } });
    const render = vi.fn().mockResolvedValue(Buffer.from('%PDF-test'));
    vi.doMock('@/actions/reports/report-engine', () => ({ generateReport }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: render }));
    vi.doMock('@/lib/pdf/reports/archive', () => ({ storeReportPdf: vi.fn().mockResolvedValue(null) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1' }) }));
    vi.doMock('@/lib/email/send-email', () => ({ getEstateEmailSettings: async () => ({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }));
    const { GET } = await import('@/app/api/reports/download/route');
    const { NextRequest } = await import('next/server');
    const res = await GET(new NextRequest(`http://localhost/api/reports/download?${query}`));
    for (const m of ['@/actions/reports/report-engine', '@/lib/pdf/reports/renderer', '@/lib/pdf/reports/archive', '@/lib/audit/logger', '@/lib/auth/authorize', '@/lib/email/send-email', '@/lib/supabase/server']) vi.doUnmock(m);
    return { res, generateReport, render };
  }

  it.each(['debtors_report', 'invoice_aging'])('%s', async (type) => {
    const { res, generateReport, render } = await download(`type=${type}`);
    expect(generateReport.mock.calls[0][0].reportType).toBe('debtors_aging');
    expect(render.mock.calls[0][0]).toBe('debtors_aging');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Disposition')).toContain('debtors_aging-');
  });

  it('shows invoice lines only when asked for, and leaves other reports alone', async () => {
    expect((await download('type=debtors_aging')).generateReport.mock.calls[0][0].includeDetails).toBe(false);
    expect((await download('type=debtors_aging&includeDetails=true')).generateReport.mock.calls[0][0].includeDetails).toBe(true);
    expect((await download('type=transaction_log')).generateReport.mock.calls[0][0].includeDetails).toBe(true);
  });
});
