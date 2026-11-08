// #1404: Project spend and Petty cash reports (layout B). Fake client honours the filters the
// generators send (eq, neq, not is null, lte) and caps every read at 1,000 rows like the API.
import { describe, expect, it, vi } from 'vitest';

import { generateReportWithClient } from '@/lib/reports/report-generator';
import { isSummaryReport, type SummaryReportData } from '@/lib/reports/summary-report';
import { reportRequestSchema, getReportPermission, type ReportRequestFormData } from '@/lib/validators/reports';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { summarizePettyCashAccount } from '@/lib/finance/petty-cash-summary';

type Row = Record<string, unknown>;
const API_ROW_CAP = 1000;
const reads: { table: string; from: number }[] = [];

function clientWith(tables: Record<string, Row[]>) {
  return {
    from: (table: string) => {
      let rows = tables[table] ?? [];
      const q: Record<string, unknown> = {};
      q.select = () => q;
      q.eq = (col: string, v: unknown) => { rows = rows.filter((r) => r[col] === v); return q; };
      q.in = (col: string, vs: unknown[]) => { rows = rows.filter((r) => vs.includes(r[col])); return q; };
      q.neq = (col: string, v: unknown) => { rows = rows.filter((r) => r[col] !== v); return q; };
      q.not = (col: string, _op: string, v: unknown) => { rows = rows.filter((r) => r[col] !== v); return q; };
      q.lte = (col: string, v: string) => { rows = rows.filter((r) => r[col] !== null && r[col] !== undefined && (r[col] as string) <= v); return q; };
      q.order = () => q;
      q.range = (from: number, to: number) => {
        reads.push({ table, from });
        return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + API_ROW_CAP)), error: null });
      };
      return q;
    },
  } as never;
}

const params = (over: Partial<ReportRequestFormData> = {}) =>
  ({ ...reportRequestSchema.parse({ reportType: 'project_spend', periodPreset: 'custom' }), startDate: '2026-10-01', endDate: '2026-10-31', ...over }) as ReportRequestFormData;

async function run(tables: Record<string, Row[]>, over: Partial<ReportRequestFormData>) {
  const result = await generateReportWithClient(clientWith(tables), params(over));
  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  expect(isSummaryReport(result.report)).toBe(true);
  return result.report as unknown as { type: string; layout: string; data: SummaryReportData };
}

const PROJECTS: Row[] = [
  { id: 'p1', name: 'Perimeter fence', status: 'in_progress', total_budget: 1000 },
  { id: 'p2', name: 'Gate house', status: 'planning', total_budget: null },
  { id: 'p3', name: 'Drainage', status: 'in_progress', total_budget: 500 },
];
const MILESTONES: Row[] = [
  { id: 'm1', project_id: 'p1', title: 'Foundation', status: 'completed', due_date: '2026-09-01' },
  { id: 'm2', project_id: 'p1', title: 'Walls', status: 'in_progress', due_date: '2026-12-01' },
  { id: 'm3', project_id: 'p1', title: 'Paint', status: 'pending', due_date: '2026-11-15' },
];
const exp = (id: string, project: string | null, amount: number, date: string, status = 'paid'): Row =>
  ({ id, project_id: project, amount, expense_date: date, status });
const EXPENSES: Row[] = [
  exp('e1', 'p1', 100, '2026-09-10'),
  exp('e2', 'p1', 200.5, '2026-10-05'),
  exp('e3', 'p1', 50, '2026-10-31'),
  exp('e4', 'p1', 999, '2026-10-06', 'cancelled'),
  exp('e5', 'p3', 70, '2026-10-12'),
  exp('e8', 'p1', 5, '2026-10-07', 'pending'),
  exp('e9', 'p1', 10, '2026-10-01'),
  exp('e10', 'p1', 1, '2026-09-30'),
  exp('e6', 'p1', 400, '2026-11-02'),
  exp('e7', null, 300, '2026-10-10'),
];

describe('Project spend report (#1404)', () => {
  it('is a registered summary report under REPORTS_VIEW_FINANCIAL', async () => {
    expect(getReportPermission('project_spend')).toBe(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(getReportPermission('petty_cash')).toBe(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    const report = await run({ projects: PROJECTS, project_milestones: MILESTONES, expenses: EXPENSES }, {});
    expect(report).toMatchObject({ type: 'project_spend', layout: 'summary' });
  });

  it('totals spend in the period and to date per project, counting only paid expenses and leaving out later and unlinked ones, with the start date inside the period', async () => {
    const { data } = await run({ projects: PROJECTS, project_milestones: MILESTONES, expenses: EXPENSES }, {});
    const byName = Object.fromEntries(data.table.rows.map((r) => [r.project as string, r]));
    expect(byName['Perimeter fence']).toMatchObject({ spendPeriod: '260.50', spendToDate: '361.50', budget: '1,000.00', budgetLeft: '638.50' });
    expect(byName['Drainage']).toMatchObject({ spendPeriod: '70.00', spendToDate: '70.00', budgetLeft: '430.00' });
    expect(byName['Gate house']).toMatchObject({ spendPeriod: '0.00', spendToDate: '0.00', budget: '', budgetLeft: '' });
    expect(data.table.totals).toMatchObject({ spendPeriod: '330.50', spendToDate: '431.50', budget: '1,500.00', budgetLeft: '1,068.50' });
  });

  it('shows the four tiles and a chart of spend in the period, biggest first', async () => {
    const { data } = await run({ projects: PROJECTS, project_milestones: MILESTONES, expenses: EXPENSES }, {});
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Projects', 3],
      ['Spend in period (NGN)', '330.50'],
      ['Spend to date (NGN)', '431.50'],
      ['Budget left (NGN)', '1,068.50'],
    ]);
    expect(data.summary[1].hint).toBe('01 October 2026 to 31 October 2026');
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([['Perimeter fence', 260.5], ['Drainage', 70], ['Gate house', 0]]);
  });

  it('shows milestones done and the next one due, with a month name', async () => {
    const { data } = await run({ projects: PROJECTS, project_milestones: MILESTONES, expenses: EXPENSES }, {});
    const fence = data.table.rows.find((r) => r.project === 'Perimeter fence')!;
    expect(fence.milestones).toBe('1 of 3 done');
    expect(fence.nextMilestone).toBe('Paint, due 15 November 2026');
    expect(data.table.rows.find((r) => r.project === 'Gate house')!.milestones).toBe('None');
  });

  it('turns the budget tile bad when spend to date is over budget', async () => {
    const { data } = await run({ projects: [PROJECTS[2]], project_milestones: [], expenses: [exp('o1', 'p3', 600, '2026-10-02')] }, {});
    expect(data.summary[3]).toMatchObject({ value: '-100.00', tone: 'bad' });
    const ok = await run({ projects: [PROJECTS[2]], project_milestones: [], expenses: [exp('o2', 'p3', 100, '2026-10-02')] }, {});
    expect(ok.data.summary[3].tone).toBe('good');
  });

  it('marks the budget tile as not set when no project has a budget', async () => {
    const { data } = await run({ projects: [PROJECTS[1]], project_milestones: [], expenses: [] }, {});
    expect(data.summary[3]).toMatchObject({ label: 'Budget left (NGN)', value: 'No budget set' });
    expect(data.table.totals).toMatchObject({ budget: null, budgetLeft: null });
  });

  it('gives an empty report, not an error, when there are no projects', async () => {
    const { data } = await run({ projects: [], project_milestones: [], expenses: [] }, {});
    expect(data.table.rows).toEqual([]);
    expect(data.summary[0].value).toBe(0);
    expect(data.chart!.bars).toEqual([]);
  });

  it('reads every page: 1,200 expenses are all counted, with an ordered paged read', async () => {
    reads.length = 0;
    const many = Array.from({ length: 1200 }, (_, i) => exp(`x${i}`, 'p1', 1, '2026-10-05'));
    const { data } = await run({ projects: PROJECTS, project_milestones: MILESTONES, expenses: many }, {});
    expect(data.table.rows.find((r) => r.project === 'Perimeter fence')!.spendToDate).toBe('1,200.00');
    expect(reads.filter((r) => r.table === 'expenses').map((r) => r.from)).toEqual([0, 1000, 1200]);
  });

  it('fails with the database error rather than a partial report', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const failing = { from: () => { const q: Record<string, unknown> = {}; for (const m of ['select', 'eq', 'neq', 'not', 'lte', 'order']) q[m] = () => q; q.range = () => Promise.resolve({ data: null, error: { message: 'boom' } }); return q; } } as never;
    const result = await generateReportWithClient(failing, params());
    expect(result).toMatchObject({ success: false, error: 'boom' });
    spy.mockRestore();
  });
});

const account = (id: string, name: string, float: number, balance: number, active = true): Row =>
  ({ id, name, initial_float: float, current_balance: balance, last_replenishment_at: null, is_active: active });
const topUp = (id: string, acc: string, amount: number, date: string, status = 'created'): Row =>
  ({ id, matched_petty_cash_account_id: acc, amount, transaction_date: date, status });
const spend = (id: string, acc: string | null, amount: number, date: string, description = 'Diesel', status = 'paid'): Row =>
  ({ id, petty_cash_account_id: acc, amount, expense_date: date, description, status, source_type: 'petty_cash' });

const ACCOUNTS: Row[] = [account('a1', 'Estate office', 1000, 1000 + 500 + 300 - 120 - 80 - 40), account('a2', 'Security post', 200, 200)];
const EMAIL_TOP_UPS: Row[] = [
  { id: 'et1', matched_petty_cash_account_id: 'a1', amount: 25, transaction_date: '2026-10-12', status: 'auto_processed' },
  { id: 'et2', matched_petty_cash_account_id: 'a1', amount: 5, transaction_date: '2026-09-30', status: 'processed' },
  { id: 'et3', matched_petty_cash_account_id: 'a1', amount: 1000, transaction_date: '2026-10-12', status: 'matched' },
];
const TOP_UPS: Row[] = [topUp('t5', 'a2', 40, '2026-10-01'), topUp('t1', 'a1', 500, '2026-09-15'), topUp('t2', 'a1', 300, '2026-10-10'), topUp('t3', 'a1', 999, '2026-10-11', 'pending'), topUp('t4', 'a1', 777, '2026-11-05')];
const SPEND: Row[] = [spend('s1', 'a1', 120, '2026-09-20'), spend('s2', 'a1', 80, '2026-10-03', 'Printer paper'), spend('s3', 'a1', 40, '2026-10-20', 'Water'), spend('s4', null, 55, '2026-10-21'), spend('s5', 'a2', 15, '2026-10-01', 'Stamps'), spend('s6', 'a2', 10, '2026-10-08', 'Bin bags', 'cancelled')];
const pcParams = (over: Partial<ReportRequestFormData> = {}) => ({ reportType: 'petty_cash' as const, includeDetails: false, ...over });

describe('Petty cash report (#1404)', () => {
  it('works out opening, top-ups, spend and closing per account for the period', async () => {
    const report = await run({ petty_cash_accounts: ACCOUNTS, bank_statement_rows: TOP_UPS, email_transactions: EMAIL_TOP_UPS, expenses: SPEND }, pcParams());
    expect(report).toMatchObject({ type: 'petty_cash', layout: 'summary' });
    const rows = Object.fromEntries(report.data.table.rows.map((r) => [r.account as string, r]));
    // opening = 1000 float + 500 earlier top-up - 120 earlier spend; pending and later top-ups are out.
    expect(rows['Estate office']).toMatchObject({ opening: '1,385.00', topUps: '325.00', spend: '120.00', closing: '1,590.00' });
    expect(rows['Security post']).toMatchObject({ opening: '200.00', topUps: '40.00', spend: '25.00', closing: '215.00' });
    expect(report.data.table.totals).toMatchObject({ opening: '1,585.00', topUps: '365.00', spend: '145.00', closing: '1,805.00' });
  });

  it('shows the four tiles and a chart of spend by account', async () => {
    const { data } = await run({ petty_cash_accounts: ACCOUNTS, bank_statement_rows: TOP_UPS, email_transactions: EMAIL_TOP_UPS, expenses: SPEND }, pcParams());
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Accounts', 2], ['Top-ups (NGN)', '365.00'], ['Spend (NGN)', '145.00'], ['Closing balance (NGN)', '1,805.00'],
    ]);
    expect(data.summary[3].hint).toBe('On 31 October 2026');
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([['Estate office', 120], ['Security post', 25]]);
  });

  it('lists spend lines only when asked, indented under their account, with a month name', async () => {
    const tables = { petty_cash_accounts: ACCOUNTS, bank_statement_rows: TOP_UPS, email_transactions: EMAIL_TOP_UPS, expenses: SPEND };
    const off = await run(tables, pcParams({ includeDetails: false }));
    expect(off.data.table.rows).toHaveLength(2);
    const on = await run(tables, pcParams({ includeDetails: true }));
    expect(on.data.table.rows.map((r) => r.account)).toEqual([
      'Estate office', '    03 October 2026, Printer paper', '    20 October 2026, Water', 'Security post',
      '    01 October 2026, Stamps', '    08 October 2026, Bin bags',
    ]);
    expect(on.data.table.rows[1]).toMatchObject({ spend: '80.00', opening: null, closing: null });
    // Same totals either way.
    expect(on.data.table.totals).toEqual(off.data.table.totals);
  });

  it('notes a balance on record that differs from the closing balance when the period reaches today', async () => {
    const today = new Date().toISOString().slice(0, 10);
    // A cash collection added 50 to the balance without any history row.
    const accounts = [account('a1', 'Estate office', 1000, 1610), ACCOUNTS[1]];
    const tables = { petty_cash_accounts: accounts, bank_statement_rows: TOP_UPS, expenses: SPEND };
    const { data } = await run(tables, pcParams({ endDate: today }));
    expect(data.notes!.join(' ')).toMatch(/Estate office \(1,610.00 on record\)/);
    const past = await run(tables, pcParams());
    expect(past.data.notes!.join(' ')).not.toMatch(/differs/);
  });

  it('counts a transfer matched to the account as a top-up whichever way the sign runs', async () => {
    const { data } = await run({ petty_cash_accounts: [ACCOUNTS[1]], bank_statement_rows: [topUp('d1', 'a2', -100, '2026-10-04')], expenses: [] }, pcParams());
    expect(data.table.rows[0]).toMatchObject({ topUps: '100.00', closing: '300.00' });
  });

  it('leaves out an inactive account with no activity, keeps one with activity', async () => {
    const accounts = [...ACCOUNTS, account('a3', 'Old float', 0, 0, false), account('a4', 'Closed float', 50, 50, false)];
    const spendRows = [...SPEND, spend('s9', 'a4', 10, '2026-10-02')];
    const { data } = await run({ petty_cash_accounts: accounts, bank_statement_rows: TOP_UPS, expenses: spendRows }, pcParams());
    expect(data.table.rows.map((r) => r.account)).toEqual(['Closed float', 'Estate office', 'Security post']);
    expect(data.table.rows.map((r) => r.account)).not.toContain('Old float');
  });

  it('gives an empty report when there are no accounts', async () => {
    const { data } = await run({ petty_cash_accounts: [], bank_statement_rows: [], expenses: [] }, pcParams());
    expect(data.table.rows).toEqual([]);
    expect(data.table.totals).toMatchObject({ opening: '0.00', closing: '0.00' });
  });

  it('reads every page: 1,500 spend lines are all counted, in ordered pages', async () => {
    reads.length = 0;
    const many = Array.from({ length: 1500 }, (_, i) => spend(`m${i}`, 'a2', 1, '2026-10-05'));
    const { data } = await run({ petty_cash_accounts: ACCOUNTS, bank_statement_rows: [], expenses: many }, pcParams());
    expect(data.table.totals).toMatchObject({ spend: '1,500.00' });
    expect(reads.filter((r) => r.table === 'expenses').map((r) => r.from)).toEqual([0, 1000, 1500]);
  });

  it('shares the account summary with getPettyCashMetrics and keeps its output', () => {
    expect(summarizePettyCashAccount({ id: 'a', name: 'N', current_balance: '12.5', initial_float: null, last_replenishment_at: '2026-10-01', is_active: true }))
      .toEqual({ id: 'a', name: 'N', currentBalance: 12.5, initialFloat: 0, lastReplenishmentAt: '2026-10-01', isActive: true });
  });
});

describe('getPettyCashMetrics output is unchanged by the extraction (#1404)', () => {
  it('maps accounts exactly as before', async () => {
    vi.resetModules();
    const accountRows = [
      { id: 'a1', name: 'Office', current_balance: '250.75', initial_float: 500, last_replenishment_at: '2026-10-01T00:00:00Z', is_active: true },
      { id: 'a2', name: 'Post', current_balance: null, initial_float: '100', last_replenishment_at: null, is_active: true },
    ];
    vi.doMock('@/lib/supabase/server', () => ({
      createServerSupabaseClient: async () => ({
        from: (table: string) => {
          const q: Record<string, unknown> = {};
          for (const m of ['select', 'eq', 'gte', 'order', 'limit']) q[m] = () => q;
          q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: table === 'petty_cash_accounts' ? accountRows : [], error: null, count: 0 }).then(resolve);
          return q;
        },
      }),
    }));
    vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: async () => {} }));
    vi.doMock('next/cache', () => ({ revalidatePath: () => {} }));
    const { getPettyCashMetrics } = await import('@/actions/finance/petty-cash');
    const metrics = await getPettyCashMetrics();
    expect(metrics.accounts).toEqual([
      { id: 'a1', name: 'Office', currentBalance: 250.75, initialFloat: 500, lastReplenishmentAt: '2026-10-01T00:00:00Z', isActive: true },
      { id: 'a2', name: 'Post', currentBalance: 0, initialFloat: 100, lastReplenishmentAt: null, isActive: true },
    ]);
    expect(metrics.totalBalance).toBe(250.75);
    for (const m of ['@/lib/supabase/server', '@/lib/auth/authorize', '@/lib/audit/logger', 'next/cache']) vi.doUnmock(m);
  });
});

describe('Server PDF for the new reports (#1404)', () => {
  it('renders a PDF for each', async () => {
    const { renderReportPdf } = await import('@/lib/pdf/reports/renderer');
    for (const [type, tables] of [
      ['project_spend', { projects: PROJECTS, project_milestones: MILESTONES, expenses: EXPENSES }],
      ['petty_cash', { petty_cash_accounts: ACCOUNTS, bank_statement_rows: TOP_UPS, email_transactions: EMAIL_TOP_UPS, expenses: SPEND }],
    ] as const) {
      const result = await generateReportWithClient(clientWith(tables as never), params({ reportType: type, includeDetails: true }));
      const buffer = await renderReportPdf(type, (result.report as { data: unknown }).data, 'Test Estate');
      expect(buffer, type).not.toBeNull();
      expect(buffer!.subarray(0, 4).toString()).toBe('%PDF');
    }
  });
});

describe('Spend lines stay off unless asked for (#1404)', () => {
  it('the wizard lists petty cash among the reports whose lines start off, and leaves project spend alone', async () => {
    const { INVOICE_LINES_OFF_BY_DEFAULT } = await import('@/components/reports/report-request-wizard');
    expect(INVOICE_LINES_OFF_BY_DEFAULT).toContain('petty_cash');
    expect(INVOICE_LINES_OFF_BY_DEFAULT).not.toContain('project_spend');
  }, 60000);

  it('the schedule form starts with the lines off for petty cash only', async () => {
    const { includeSummaryDefault } = await import('@/components/reports/report-schedules');
    expect(includeSummaryDefault('petty_cash')).toBe(false);
    expect(includeSummaryDefault('project_spend')).toBe(true);
  });

  async function runSchedule(schedule: Record<string, unknown>) {
    vi.resetModules();
    const generate = vi.fn().mockResolvedValue({ success: true, report: { type: 'petty_cash', layout: 'summary', data: {} } });
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte', 'update']) chain[method] = () => chain;
    chain.order = async () => ({ data: [schedule], error: null });
    chain.insert = () => chain;
    chain.single = async () => ({ data: { id: 'a1' }, error: null });
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => chain, storage: { from: () => ({ upload: async () => ({ error: null }) }) } }) }));
    vi.doMock('@/lib/reports/report-generator', () => ({ generateReportWithClient: generate }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')) }));
    vi.doMock('@/lib/email/send-email', () => ({ sendEmail: vi.fn().mockResolvedValue({ success: true }), getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }) }));
    vi.doMock('@/emails/scheduled-report', () => ({ ScheduledReportEmail: vi.fn((props: unknown) => props) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { processDueSchedules } = await import('@/lib/reports/process-schedules');
    await processDueSchedules();
    for (const m of ['@/lib/supabase/server', '@/lib/reports/report-generator', '@/lib/pdf/reports/renderer', '@/lib/email/send-email', '@/emails/scheduled-report', '@/lib/audit/logger']) vi.doUnmock(m);
    return generate;
  }
  const base = { id: 's1', period_preset: 'last_month', frequency: 'monthly', bank_account_ids: [], recipients: ['a@x.test'], configuration: {} };

  it.each([
    ['petty_cash', true, true],
    ['petty_cash', false, false],
    ['petty_cash', null, false],
    ['project_spend', false, true],
  ])('%s with include_summary %s generates with includeDetails %s', async (type, includeSummary, expected) => {
    const generate = await runSchedule({ ...base, report_type: type, include_summary: includeSummary });
    expect(generate.mock.calls[0][1].includeDetails).toBe(expected);
  });

  async function download(query: string) {
    vi.resetModules();
    const generateReport = vi.fn().mockResolvedValue({ success: true, report: { type: 'petty_cash', layout: 'summary', data: {} } });
    vi.doMock('@/actions/reports/report-engine', () => ({ generateReport }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn().mockResolvedValue(Buffer.from('%PDF-test')) }));
    vi.doMock('@/lib/pdf/reports/archive', () => ({ storeReportPdf: vi.fn().mockResolvedValue(null) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1' }) }));
    vi.doMock('@/lib/email/send-email', () => ({ getEstateEmailSettings: async () => ({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({}) }));
    const { GET } = await import('@/app/api/reports/download/route');
    const { NextRequest } = await import('next/server');
    await GET(new NextRequest(`http://localhost/api/reports/download?${query}`));
    for (const m of ['@/actions/reports/report-engine', '@/lib/pdf/reports/renderer', '@/lib/pdf/reports/archive', '@/lib/audit/logger', '@/lib/auth/authorize', '@/lib/email/send-email', '@/lib/supabase/server']) vi.doUnmock(m);
    return generateReport.mock.calls[0][0].includeDetails;
  }

  it('the download route shows spend lines only when asked for', async () => {
    expect(await download('type=petty_cash')).toBe(false);
    expect(await download('type=petty_cash&includeDetails=true')).toBe(true);
    expect(await download('type=project_spend')).toBe(true);
  });
});
