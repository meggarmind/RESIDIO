// @vitest-environment jsdom
// #1402: Statement of account for one house or one resident. The running balance is the roll-forward
// balance of resident_account_balance (#863): invoices less verified payments, plus or less wallet
// movements that are not mirrors (resident only). These tests pin the lines, the balance, the tiles,
// the chart, the paging, the permission and the schedule.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  can: new Set<string>(),
  houses: { data: undefined as unknown, isLoading: false, error: null as Error | null },
  residents: { data: undefined as unknown, isLoading: false, error: null as Error | null },
  enabled: { houses: [] as unknown[], residents: [] as unknown[] },
}));
vi.mock('@/components/auth/can', () => ({ useCan: (p: string) => mocks.can.has(p) }));
vi.mock('@/hooks/use-houses', () => ({
  useHouses: (_params: unknown, options?: { enabled?: boolean }) => { mocks.enabled.houses.push(options?.enabled); return mocks.houses; },
}));
vi.mock('@/hooks/use-residents', () => ({
  useResidentOptions: (options?: { enabled?: boolean }) => { mocks.enabled.residents.push(options?.enabled); return mocks.residents; },
}));

import { generateReportWithClient } from '@/lib/reports/report-generator';
import { isSummaryReport, subjectTitle, type SummaryReportData } from '@/lib/reports/summary-report';
import {
  getReportPermission,
  hasGenerator,
  reportRequestSchema,
  reportTypes,
  runnableReportsForPermissions,
  scheduleConfigurationError,
  type ReportRequestFormData,
} from '@/lib/validators/reports';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { StatementSubjectPicker } from '@/components/reports/statement-subject-picker';

// "Today" is 15 October 2026 in Lagos.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-15T10:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const H = id(1);
const R1 = id(11);
const R2 = id(12);
const W_DUES = id(21);
const W_TRANSFORMER = id(22);

const HOUSE = { house_number: '12', street: { name: 'Palm Close' } };
const PEOPLE: Record<string, { first_name: string; last_name: string; entity_type: string; company_name: null }> = {
  [R1]: { first_name: 'Res', last_name: 'One', entity_type: 'individual', company_name: null },
  [R2]: { first_name: 'Res', last_name: 'Two', entity_type: 'individual', company_name: null },
};

let seq = 0;
let invoiceNo = 0;
const invoice = (residentId: string, periodStart: string | null, due: number, paid: number, extra: Record<string, unknown> = {}) => {
  const n = ++invoiceNo;
  return {
    id: id(1000 + ++seq), invoice_number: `INV-${n}`, amount_due: due, amount_paid: paid,
    status: paid >= due ? 'paid' : paid > 0 ? 'partially_paid' : 'unpaid', invoice_type: 'SERVICE_CHARGE',
    period_start: periodStart, period_end: null, created_at: '2026-06-01T09:00:00Z', charge_category: 'dues', rate_snapshot: null,
    house_id: H, resident_id: residentId, billing_profile: { name: 'Security Dues' }, items: [] as unknown[],
    resident: PEOPLE[residentId], house: HOUSE, ...extra,
  };
};
const item = (description: string, amount: number, at = '2026-06-01T09:00:00Z') => ({ id: id(5000 + ++seq), description, amount, created_at: at });
const payment = (residentId: string, date: string, amount: number, extra: Record<string, unknown> = {}) => ({
  id: id(2000 + ++seq), amount, payment_date: date, reference_number: null, method: 'bank_transfer', notes: null, charge_category: 'dues',
  status: 'paid', is_verified: true, house_id: H, resident_id: residentId, resident: PEOPLE[residentId], house: HOUSE, ...extra,
});

const INVOICES = [
  invoice(R1, '2026-07-01', 15000, 10000), // before the period: opening + 15,000
  invoice(R2, '2026-08-01', 10000, 10000, { items: [item('Security Dues', 8000), item('Late fee', 2000, '2026-08-20T09:00:00Z')] }),
  invoice(R2, '2026-09-01', 10000, 0),
  invoice(R2, '2026-10-01', 12000, 0, { items: [item('Security Dues', 10000)] }), // a 2,000 remainder line
  invoice(R2, '2026-09-01', 99999, 0, { status: 'void' }),
  // No period: dated by created_at in Lagos, which is 1 August (23:30 UTC is 00:30 in Lagos).
  invoice(R2, null, 500, 0, { created_at: '2026-07-31T23:30:00Z', charge_category: 'transformer_fee', invoice_type: 'LEVY', billing_profile: { name: 'Transformer Fee' } }),
  invoice(R2, '2026-11-01', 10000, 0), // after the period
  invoice(R2, '2026-12-01', 1000, 1500), // after the period, overpaid: the house page counts it as 0 owed, not -500
];
const PAYMENTS = [
  payment(R1, '2026-07-05', 10000), // before the period: opening - 10,000
  payment(R2, '2026-08-10', 10000, { reference_number: 'FBN-1' }),
  payment(R2, '2026-09-20', 3000, { is_verified: false }), // awaiting verification
  payment(R2, '2026-10-05', 4000, { status: 'pending', is_verified: false }), // awaiting verification
  payment(R2, '2026-10-10', 5000),
  payment(R2, '2026-10-11', 9999, { status: 'failed', is_verified: false }), // never counted, not even as awaiting verification
  payment(R2, '2026-11-05', 600, { is_verified: false }), // awaiting, but after the period: not in the note
];
const WALLETS = [
  { id: W_DUES, resident_id: R2, charge_category: 'dues' },
  { id: W_TRANSFORMER, resident_id: R2, charge_category: 'transformer_fee' },
];
const wtx = (walletId: string, type: string, amount: number, referenceType: string | null, at: string, description: string | null) => ({
  id: id(3000 + ++seq), wallet_id: walletId, type, amount, description, reference_type: referenceType, reference_id: null, created_at: at,
});
const WALLET_TX = [
  wtx(W_DUES, 'credit', 10000, 'payment', '2026-08-10T10:00:00Z', 'Payment received'), // mirror
  wtx(W_DUES, 'debit', 10000, 'invoice', '2026-08-10T10:00:01Z', 'Paid INV-2'), // mirror
  wtx(W_DUES, 'credit', 2500, null, '2026-07-15T10:00:00Z', 'Opening credit'), // before the period
  wtx(W_DUES, 'credit', 3000, 'payment', '2026-07-20T10:00:00Z', 'Payment received'), // mirror, before the period: not in the opening
  wtx(W_TRANSFORMER, 'debit', 700, 'adjustment', '2026-09-15T12:00:00Z', 'Transformer adjustment'),
  wtx(W_DUES, 'credit', 1000, 'adjustment', '2026-10-31T20:00:00Z', 'Goodwill credit'), // the last day of the period, in Lagos
];
const CHARGES = [
  { code: 'dues', name: 'Security Dues' },
  { code: 'transformer_fee', name: 'Transformer Fee' },
];

const reads: { table: string; from: number; to: number }[] = [];
const tablesRead: string[] = [];
function table(name: string, rows: Record<string, unknown>[]) {
  let filtered = rows;
  let lo = 0;
  let hi = 999; // like PostgREST, a read with no range returns at most 1000 rows
  const q: Record<string, unknown> = {};
  q.select = () => q;
  q.order = () => q;
  q.eq = (col: string, val: unknown) => { filtered = filtered.filter((r) => r[col] === val); return q; };
  q.neq = (col: string, val: unknown) => { filtered = filtered.filter((r) => r[col] !== val); return q; };
  q.in = (col: string, vals: unknown[]) => { filtered = filtered.filter((r) => vals.includes(r[col])); return q; };
  q.range = (a: number, b: number) => { lo = a; hi = b; reads.push({ table: name, from: a, to: b }); return q; };
  q.maybeSingle = () => Promise.resolve({ data: filtered[0] ?? null, error: null });
  q.then = (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
    Promise.resolve({ data: filtered.slice(lo, hi + 1), error: null }).then(res, rej);
  return q;
}

type Balances = Record<string, number>; // `${residentId}|${houseId ?? ''}` -> closing
const rpcCalls: Record<string, unknown>[] = [];
function clientWith(over: { invoices?: unknown[]; payments?: unknown[]; walletTx?: unknown[]; balances?: Balances } = {}) {
  const data: Record<string, unknown[]> = {
    houses: [{ id: H, ...HOUSE }],
    residents: Object.entries(PEOPLE).map(([rid, p]) => ({ id: rid, resident_code: `C-${rid.slice(-2)}`, ...p })),
    charge_categories: CHARGES,
    invoices: over.invoices ?? INVOICES,
    payment_records: over.payments ?? PAYMENTS,
    resident_wallets: WALLETS,
    wallet_transactions: over.walletTx ?? WALLET_TX,
  };
  const balances = over.balances ?? { [`${R1}|${H}`]: 5000, [`${R2}|${H}`]: 17500, [`${R2}|`]: 14700 };
  return {
    from: (t: string) => { tablesRead.push(t); return table(t, data[t] as Record<string, unknown>[]); },
    rpc: (fn: string, args: { p_resident_id: string; p_house_id: string | null }) => {
      rpcCalls.push({ fn, ...args });
      const closing = balances[`${args.p_resident_id}|${args.p_house_id ?? ''}`] ?? 0;
      return { single: async () => ({ data: { opening_balance: 0, closing_balance: closing, total_invoiced: 0, total_paid: 0, total_wallet_credits: 0, total_wallet_debits: 0, awaiting_verification: 0 }, error: null }) };
    },
  } as never;
}

const PERIOD = { periodPreset: 'custom' as const, startDate: '2026-08-01', endDate: '2026-10-31' };
const params = (over: Partial<ReportRequestFormData> = {}) =>
  reportRequestSchema.parse({ reportType: 'statement_of_account', ...PERIOD, statementFor: 'house', statementId: H, ...over }) as ReportRequestFormData;

async function run(over: Partial<ReportRequestFormData> = {}, client = clientWith()): Promise<SummaryReportData> {
  const result = await generateReportWithClient(client, params(over));
  expect(result.error).toBeUndefined();
  expect(isSummaryReport(result.report)).toBe(true);
  expect(result.report).toMatchObject({ type: 'statement_of_account', layout: 'summary' });
  return (result.report as { data: SummaryReportData }).data;
}
const tiles = (d: SummaryReportData) => d.summary.map((t) => [t.label, t.value]);
const lines = (d: SummaryReportData) => d.table.rows.map((r) => [r.date, r.debtor, r.category, r.charged, r.paid, r.balance]);

beforeEach(() => {
  reads.length = 0;
  tablesRead.length = 0;
  rpcCalls.length = 0;
});

describe('Statement of account: house (#1402)', () => {
  it('is a listed, generatable report in Money in and out, run with reports.view_financial', () => {
    const entry = reportTypes.find((r) => r.value === 'statement_of_account');
    expect(entry).toMatchObject({ group: 'Money in and out', permission: PERMISSIONS.REPORTS_VIEW_FINANCIAL });
    expect(getReportPermission('statement_of_account')).toBe(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(hasGenerator('statement_of_account')).toBe(true);
    expect(runnableReportsForPermissions([PERMISSIONS.REPORTS_VIEW_FINANCIAL])).toContain('statement_of_account');
    expect(runnableReportsForPermissions([PERMISSIONS.REPORTS_VIEW_OCCUPANCY])).not.toContain('statement_of_account');
  });

  it('shows the four tiles: opening balance, charged, paid, owed now', async () => {
    const data = await run();
    // Opening 15,000 - 10,000; charged 10,000 + 10,000 + 12,000 + 500; paid 10,000 + 5,000 (verified only).
    expect(tiles(data)).toEqual([
      ['Opening balance (NGN)', '5,000.00'],
      ['Charged (NGN)', '32,500.00'],
      ['Paid (NGN)', '15,000.00'],
      ['Owed now (NGN)', '22,500.00'],
    ]);
    expect(data.summary[3]).toMatchObject({ tone: 'bad', hint: 'On 31 October 2026' });
  });

  it('lists every invoice line and payment with a running balance, an opening row and a totals row', async () => {
    const data = await run();
    expect(lines(data)).toEqual([
      ['01 August 2026', 'Opening balance', null, null, null, '5,000.00'],
      ['01 August 2026', 'Invoice #INV-6 - Transformer Fee (Res Two)', 'Transformer Fee', '500.00', null, '5,500.00'],
      ['01 August 2026', 'INV-2: Security Dues (Res Two)', 'Security Dues', '8,000.00', null, '13,500.00'],
      ['01 August 2026', 'INV-2: Late fee (Res Two)', 'Security Dues', '2,000.00', null, '15,500.00'],
      ['10 August 2026', 'Payment (bank_transfer), ref FBN-1 (Res Two)', 'Security Dues', null, '10,000.00', '5,500.00'],
      ['01 September 2026', expect.stringMatching(/^Invoice #INV-3 - .*\(Res Two\)$/), 'Security Dues', '10,000.00', null, '15,500.00'],
      ['01 October 2026', 'INV-4: Security Dues (Res Two)', 'Security Dues', '10,000.00', null, '25,500.00'],
      ['01 October 2026', 'INV-4: rest of the invoice amount (Res Two)', 'Security Dues', '2,000.00', null, '27,500.00'],
      ['10 October 2026', 'Payment (bank_transfer) (Res Two)', 'Security Dues', null, '5,000.00', '22,500.00'],
    ]);
    expect(data.table.totals).toEqual({ date: null, debtor: 'Total', category: null, charged: '32,500.00', paid: '15,000.00', balance: '22,500.00' });
    expect(data.table.columns.map((c) => c.label)).toEqual(['Date', 'Item', 'Charge type', 'Charge', 'Payment', 'Balance']);
  });

  it('the closing balance is opening + charged - paid, and equals the last line', async () => {
    const data = await run();
    const last = data.table.rows.at(-1)!;
    expect(last.balance).toBe(data.table.totals!.balance);
    expect(data.summary[3].value).toBe(data.table.totals!.balance);
  });

  it('charts charged and paid by month', async () => {
    const data = await run();
    expect(data.chart!.title).toBe('Charged and paid by month (NGN)');
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([
      ['Aug 2026 charged', 10500], ['Aug 2026 paid', 10000],
      ['Sep 2026 charged', 10000], ['Sep 2026 paid', 0],
      ['Oct 2026 charged', 12000], ['Oct 2026 paid', 5000],
    ]);
  });

  it('reads no wallet for a house, and notes payments awaiting verification and the house page figure', async () => {
    const data = await run();
    expect(tablesRead).not.toContain('wallet_transactions');
    expect(tablesRead).not.toContain('resident_wallets');
    expect(data.notes!.join('\n')).toContain('Payments of 7,000.00 are awaiting verification');
    // House page: unpaid on each invoice, today: 5,000 + 10,000 + 12,000 + 500 + 10,000 (November).
    expect(data.notes!.join('\n')).toContain('as the house page shows it: 37,500.00. It is different');
    expect(data.notes!.join('\n')).not.toContain('Check:');
  });

  it('puts the house and the period in the title', async () => {
    const data = await run();
    expect(data.subject).toBe('12, Palm Close, 01 August 2026 to 31 October 2026');
    expect(subjectTitle('Statement of account', data.subject)).toBe('Statement of account - 12, Palm Close, 01 August 2026 to 31 October 2026');
  });

  it('checks the lines against resident_account_balance for each resident of the house', async () => {
    await run();
    expect(rpcCalls.map((c) => [c.fn, c.p_resident_id, c.p_house_id]).sort()).toEqual([
      ['resident_account_balance', R1, H],
      ['resident_account_balance', R2, H],
    ]);
    const data = await run({}, clientWith({ balances: { [`${R1}|${H}`]: 5000, [`${R2}|${H}`]: 17000 } }));
    expect(data.notes!.join('\n')).toContain('Check: the account balance is 22,000.00');
  });

  it('with nothing billed or paid shows zeros, the opening row and a zero totals row', async () => {
    const data = await run({}, clientWith({ invoices: [], payments: [], balances: {} }));
    expect(tiles(data).map((t) => t[1])).toEqual(['0.00', '0.00', '0.00', '0.00']);
    expect(data.table.rows).toHaveLength(1);
    expect(data.table.totals).toMatchObject({ charged: '0.00', paid: '0.00', balance: '0.00' });
    expect(data.chart!.bars.every((b) => b.value === 0)).toBe(true);
    expect(data.summary[3].tone).toBe('good');
  });

  it('a past period says owed at end of period, and a credit says in credit', async () => {
    const data = await run({ startDate: '2026-08-01', endDate: '2026-08-31' });
    // 5,000 + 500 + 10,000 - 10,000
    expect(data.summary[3]).toMatchObject({ label: 'Owed at end of period (NGN)', value: '5,500.00' });
    const credit = await run({}, clientWith({ invoices: [], payments: [payment(R2, '2026-08-10', 4000)], balances: {} }));
    expect(credit.summary[3]).toMatchObject({ value: '-4,000.00', tone: 'good', hint: 'In credit on 31 October 2026' });
  });

  it('reads every page, so more than 1,000 invoices are all in the balance', async () => {
    const many = Array.from({ length: 1500 }, () => invoice(R2, '2026-09-01', 10, 0));
    const data = await run({}, clientWith({ invoices: many, payments: [], balances: {} }));
    expect(data.summary[1].value).toBe('15,000.00');
    expect(reads.filter((r) => r.table === 'invoices')[0]).toEqual({ table: 'invoices', from: 0, to: 999 });
    expect(reads.filter((r) => r.table === 'invoices').length).toBeGreaterThan(1);
  });

  it('refuses a statement with no house or resident, and a period that ends before it starts', async () => {
    const none = await generateReportWithClient(clientWith(), { ...params(), statementId: undefined });
    expect(none).toEqual({ success: false, error: 'Choose the house or the resident for the statement.' });
    const backwards = await generateReportWithClient(clientWith(), params({ startDate: '2026-10-31', endDate: '2026-08-01' }));
    expect(backwards.success).toBe(false);
    expect(() => reportRequestSchema.parse({ reportType: 'statement_of_account', ...PERIOD, statementId: 'x,y' })).toThrow();
  });
});

describe('Statement of account: resident (#1402)', () => {
  const resident = { statementFor: 'resident' as const, statementId: R2 };

  it('counts wallet movements that are not mirrors, and leaves the mirrors out', async () => {
    const data = await run(resident);
    // Opening: the 2,500 wallet credit. Charged: 32,500 + the 700 wallet debit. Paid: 15,000 + the 1,000 wallet credit.
    expect(tiles(data)).toEqual([
      ['Opening balance (NGN)', '-2,500.00'],
      ['Charged (NGN)', '33,200.00'],
      ['Paid (NGN)', '16,000.00'],
      ['Owed now (NGN)', '14,700.00'],
    ]);
    expect(data.table.rows.at(-1)).toMatchObject({ date: '31 October 2026', debtor: 'Wallet credit: Goodwill credit', paid: '1,000.00', balance: '14,700.00' });
    const items = data.table.rows.map((r) => r.debtor as string);
    expect(items).toContain('Wallet debit: Transformer adjustment');
    expect(items.join('\n')).not.toContain('Paid INV-2');
    expect(items.join('\n')).not.toContain('Payment received');
    expect(data.table.rows.find((r) => r.debtor === 'Wallet debit: Transformer adjustment')).toMatchObject({
      date: '15 September 2026', category: 'Transformer Fee', charged: '700.00', paid: null,
    });
  });

  it('names the house on each line, and checks against the all-properties account balance', async () => {
    const data = await run(resident);
    expect(data.table.rows[1].debtor).toBe('Invoice #INV-6 - Transformer Fee (12, Palm Close)');
    expect(rpcCalls).toEqual([expect.objectContaining({ p_resident_id: R2, p_house_id: null })]);
    expect(data.notes!.join('\n')).not.toContain('Check:');
    expect(data.subject).toMatch(/^Res Two · C-12, 01 August 2026/);
  });
});

describe('Statement of account: schedule, PDF and picker (#1402)', () => {
  it('a schedule must carry the house or resident', () => {
    expect(scheduleConfigurationError('statement_of_account', {})).toMatch(/needs the house or resident/);
    expect(scheduleConfigurationError('statement_of_account', { statementFor: 'house', statementId: 'nope' })).not.toBeNull();
    expect(scheduleConfigurationError('statement_of_account', { statementFor: 'house', statementId: H })).toBeNull();
    expect(scheduleConfigurationError('financial_overview', {})).toBeNull();
  });

  it('createReportSchedule refuses a statement schedule without a subject', async () => {
    vi.resetModules();
    const insert = vi.fn();
    vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1' }) }));
    vi.doMock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ from: () => ({ insert }) }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
    const { createReportSchedule } = await import('@/actions/reports/report-schedules');
    const result = await createReportSchedule({ name: 'S', report_type: 'statement_of_account', frequency: 'monthly', period_preset: 'last_month', configuration: {} });
    expect(result.error).toMatch(/needs the house or resident/);
    expect(insert).not.toHaveBeenCalled();
    for (const m of ['@/lib/auth/authorize', '@/lib/supabase/server', '@/lib/audit/logger', 'next/cache']) vi.doUnmock(m);
  });

  it('updateReportSchedule refuses to make a schedule a statement without a subject, and checks the saved one', async () => {
    vi.resetModules();
    const update = vi.fn();
    let existing: Record<string, unknown> = { id: 's1', name: 'S', report_type: 'financial_overview', configuration: {} };
    const read = { select: () => read, eq: () => read, single: async () => ({ data: existing, error: null }) };
    vi.doMock('@/lib/auth/authorize', () => ({ authorizePermission: async () => ({ authorized: true, userId: 'u1' }) }));
    vi.doMock('@/lib/supabase/server', () => ({ createServerSupabaseClient: async () => ({ from: () => ({ ...read, update }) }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    vi.doMock('next/cache', () => ({ revalidatePath: vi.fn() }));
    const { updateReportSchedule } = await import('@/actions/reports/report-schedules');
    expect((await updateReportSchedule('s1', { report_type: 'statement_of_account' })).error).toMatch(/needs the house or resident/);
    existing = { ...existing, report_type: 'statement_of_account', configuration: { statementFor: 'house', statementId: H } };
    expect((await updateReportSchedule('s1', { configuration: { statementFor: 'house', statementId: 'bad' } })).error).toMatch(/needs the house or resident/);
    expect(update).not.toHaveBeenCalled();
    for (const m of ['@/lib/auth/authorize', '@/lib/supabase/server', '@/lib/audit/logger', 'next/cache']) vi.doUnmock(m);
  });

  it('the report title from New report names the house and the period', async () => {
    vi.resetModules();
    const data = await run();
    const save = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.doMock('@/actions/reports/report-engine', () => ({
      generateReport: vi.fn().mockResolvedValue({ success: true, report: { type: 'statement_of_account', layout: 'summary', data } }),
    }));
    vi.doMock('@/actions/reports/report-schedules', () => ({ saveGeneratedReport: save }));
    const { useGenerateReport } = await import('@/hooks/use-reports');
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query');
    const { renderHook } = await import('@testing-library/react');
    const client = new QueryClient();
    const { result } = renderHook(() => useGenerateReport(), { wrapper: ({ children }) => <QueryClientProvider client={client}>{children}</QueryClientProvider> });
    const report = await result.current.mutateAsync({ ...params(), saveToHistory: true });
    expect(report.title).toBe('Statement of account - 12, Palm Close, 01 August 2026 to 31 October 2026');
    expect(save.mock.calls[0][0].name).toBe(report.title);
    for (const m of ['@/actions/reports/report-engine', '@/actions/reports/report-schedules']) vi.doUnmock(m);
  });

  it('a statement schedule runs for the house or resident it saved', async () => {
    vi.resetModules();
    const generate = vi.fn().mockResolvedValue({ success: false, error: 'stop' });
    const schedule = { id: 's1', report_type: 'statement_of_account', period_preset: 'last_month', frequency: 'monthly', bank_account_ids: [], recipients: [], configuration: { statementFor: 'resident', statementId: R2 } };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'lte']) chain[method] = () => chain;
    chain.order = async () => ({ data: [schedule], error: null });
    vi.doMock('@/lib/supabase/server', () => ({ createAdminClient: () => ({ from: () => chain }) }));
    vi.doMock('@/lib/reports/report-generator', () => ({ generateReportWithClient: generate }));
    vi.doMock('@/lib/pdf/reports/renderer', () => ({ renderReportPdf: vi.fn() }));
    vi.doMock('@/lib/email/send-email', () => ({ sendEmail: vi.fn(), getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }) }));
    vi.doMock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
    const { processDueSchedules } = await import('@/lib/reports/process-schedules');
    await processDueSchedules();
    expect(generate.mock.calls[0][1]).toMatchObject({ reportType: 'statement_of_account', statementFor: 'resident', statementId: R2 });
    for (const m of ['@/lib/supabase/server', '@/lib/reports/report-generator', '@/lib/pdf/reports/renderer', '@/lib/email/send-email', '@/lib/audit/logger']) vi.doUnmock(m);
  });

  it('renders a server PDF with the subject in the title', async () => {
    const { renderReportPdf } = await import('@/lib/pdf/reports/renderer');
    const pdf = await import('@/lib/pdf/reports/summary-report-pdf');
    const spy = vi.spyOn(pdf, 'SummaryReportPdf');
    const buffer = await renderReportPdf('statement_of_account', await run(), 'Test Estate');
    expect(buffer).not.toBeNull();
    expect(buffer!.subarray(0, 4).toString()).toBe('%PDF');
    expect(spy.mock.calls[0][0].title).toBe('Statement of account - 12, Palm Close, 01 August 2026 to 31 October 2026');
    spy.mockRestore();
  });

  it('the picker offers only the lists the user can load, and shows a refused load as an error', () => {
    mocks.can = new Set([PERMISSIONS.HOUSES_VIEW]);
    mocks.enabled = { houses: [], residents: [] };
    mocks.houses = { data: { data: [{ id: H, house_number: '12', street: { name: 'Palm Close' }, short_name: null }] }, isLoading: false, error: null };
    render(<StatementSubjectPicker statementFor="house" statementId="" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: /A house/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /A resident/ })).toBeNull();
    expect(screen.getByText('You cannot view residents, so only a house statement is available.')).toBeTruthy();
    // The resident list is not loaded for a user who cannot view residents.
    expect(mocks.enabled.houses.every((e) => e === true)).toBe(true);
    expect(mocks.enabled.residents.every((e) => e === false)).toBe(true);
    expect(mocks.enabled.residents.length).toBeGreaterThan(0);
    cleanup();

    mocks.houses = { data: undefined, isLoading: false, error: new Error('permission denied') };
    render(<StatementSubjectPicker statementFor="house" statementId="" onChange={vi.fn()} />);
    expect(screen.getByText('Could not load houses: permission denied')).toBeTruthy();
    cleanup();

    mocks.can = new Set();
    mocks.enabled = { houses: [], residents: [] };
    render(<StatementSubjectPicker statementFor="house" statementId="" onChange={vi.fn()} />);
    expect(screen.getByText(/You cannot view houses or residents/)).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
    expect([...mocks.enabled.houses, ...mocks.enabled.residents].every((e) => e === false)).toBe(true);
  });
});
