// #1403: Collection rate by street, Expenses by category and vendor, Wallet balances (layout B).
import { describe, expect, it } from 'vitest';

import { generateReportWithClient } from '@/lib/reports/report-generator';
import { isSummaryReport, type SummaryReportData } from '@/lib/reports/summary-report';
import { summarizeCollectionByStreet, summarizeDebtByStreet } from '@/lib/billing/debt-by-street';
import { DEBT_STATUS_DEFAULTS } from '@/lib/billing/debt-status';
import { reportRequestSchema, reportTypes, GENERATABLE_REPORT_TYPES, type ReportRequestFormData } from '@/lib/validators/reports';
import { PERMISSIONS } from '@/lib/auth/action-roles';

type Row = Record<string, unknown>;

/**
 * A Supabase stand-in that behaves like the API: filters apply, `.range(a, b)` returns that slice, and
 * no read returns more than 1,000 rows. A read with no `.range` is cut at 1,000, so an unpaged read fails.
 */
const API_ROW_CAP = 1000;
const reads: { table: string; ranges: [number, number][] }[] = [];
function client(tables: Record<string, Row[]>) {
  return {
    from(table: string) {
      const filters: ((r: Row) => boolean)[] = [];
      const log = { table, ranges: [] as [number, number][] };
      reads.push(log);
      const builder: Record<string, unknown> = {};
      const chain = (fn: (...a: never[]) => void) => (...a: unknown[]) => { (fn as (...x: unknown[]) => void)(...a); return builder; };
      builder.select = chain(() => {});
      builder.order = chain(() => {});
      builder.eq = chain((col: string, v: unknown) => filters.push((r) => r[col] === v));
      builder.neq = chain((col: string, v: unknown) => filters.push((r) => r[col] !== v));
      builder.not = chain((col: string) => filters.push((r) => r[col] !== null && r[col] !== undefined));
      builder.gte = chain((col: string, v: string) => filters.push((r) => String(r[col]) >= v));
      builder.lte = chain((col: string, v: string) => filters.push((r) => String(r[col]) <= v));
      const rows = () => (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
      builder.range = (from: number, to: number) => {
        log.ranges.push([from, to]);
        return Promise.resolve({ data: rows().slice(from, Math.min(to + 1, from + API_ROW_CAP)), error: null });
      };
      builder.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
        Promise.resolve({ data: rows().slice(0, API_ROW_CAP), error: null }).then(resolve, reject);
      return builder;
    },
  } as never;
}

const params = (over: Partial<ReportRequestFormData>) =>
  ({ ...reportRequestSchema.parse({ reportType: 'wallet_balances', periodPreset: 'custom', startDate: '2026-10-01', endDate: '2026-10-31' }), ...over }) as ReportRequestFormData;

async function run(tables: Record<string, Row[]>, over: Partial<ReportRequestFormData>): Promise<SummaryReportData> {
  const result = await generateReportWithClient(client(tables), params(over));
  expect(result.error).toBeUndefined();
  expect(result.success).toBe(true);
  expect(isSummaryReport(result.report)).toBe(true);
  return (result.report as { data: SummaryReportData }).data;
}
const n = (v: unknown) => Number(String(v).replace(/,/g, ''));

describe('registration (#1403)', () => {
  it.each(['collection_rate_by_street', 'expenses_by_category', 'wallet_balances'] as const)('%s is listed, generatable and needs the financial reports permission', (type) => {
    const entry = reportTypes.find((r) => r.value === type);
    expect(entry?.permission).toBe(PERMISSIONS.REPORTS_VIEW_FINANCIAL);
    expect(GENERATABLE_REPORT_TYPES).toContain(type);
  });
  it('groups them as the issue says', () => {
    const group = (t: string) => reportTypes.find((r) => r.value === t)?.group;
    expect(group('collection_rate_by_street')).toBe('Debts');
    expect(group('expenses_by_category')).toBe('Money in and out');
    expect(group('wallet_balances')).toBe('Money in and out');
  });
});

// ---------- Collection rate by street ----------

const houseRow = (id: string, street: string, over: Row = {}) => ({
  id, house_number: id, short_name: null, identifier_unverified: false, property_status: 'occupied', is_active: true,
  street: { id: `s-${street}`, name: street }, resident_houses: [{ is_active: true, resident_role: 'tenant' }], ...over,
});
const inv = (id: string, house: string | null, due: number, paid: number, over: Row = {}) =>
  ({ id, house_id: house, amount_due: due, amount_paid: paid, status: 'unpaid', due_date: '2026-10-15', ...over });
const rateParams = { reportType: 'collection_rate_by_street' as const };

describe('Collection rate by street (#1403)', () => {
  const houses = [houseRow('h1', 'Palm Close'), houseRow('h2', 'Palm Close'), houseRow('h3', 'Cedar Way'), houseRow('h4', 'Empty Road'), houseRow('v1', 'Palm Close', { property_status: 'vacant' })];
  const invoices = [
    inv('1', 'h1', 10000, 10000), inv('2', 'h2', 10000, 5000), inv('3', 'h3', 20000, 5000),
    inv('v', 'h1', 99999, 0, { status: 'void' }),
    inv('late', 'h1', 7777, 0, { due_date: '2026-09-30' }),
    inv('vacant', 'v1', 5000, 0),
    inv('orphan', null, 5000, 0),
  ];

  it('gives billed, collected, owed and rate per street, and the totals', async () => {
    const data = await run({ houses: houses as Row[], invoices }, rateParams);
    expect(data.table.rows).toEqual([
      { street: 'Cedar Way', houses: 1, billed: '20,000.00', collected: '5,000.00', owed: '15,000.00', rate: '25.0%' },
      { street: 'Empty Road', houses: 1, billed: '0.00', collected: '0.00', owed: '0.00', rate: '-' },
      { street: 'Palm Close', houses: 2, billed: '20,000.00', collected: '15,000.00', owed: '5,000.00', rate: '75.0%' },
    ]);
    expect(data.table.totals).toMatchObject({ street: 'Total', houses: 4, billed: '40,000.00', collected: '20,000.00', owed: '20,000.00', rate: '50.0%' });
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Billed (NGN)', '40,000.00'], ['Collected (NGN)', '20,000.00'], ['Owed (NGN)', '20,000.00'], ['Collection rate', '50.0%'],
    ]);
  });

  it('charts the collection rate by street, best first, leaving out a street with nothing billed', async () => {
    const data = await run({ houses: houses as Row[], invoices }, rateParams);
    expect(data.chart!.title).toBe('Collection rate by street (%)');
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([['Palm Close', 75], ['Cedar Way', 25]]);
  });

  it('billed = collected + owed on every row', async () => {
    const data = await run({ houses: houses as Row[], invoices: [...invoices, inv('over', 'h3', 1000, 1500)] }, rateParams);
    for (const row of data.table.rows) expect(n(row.billed)).toBeCloseTo(n(row.collected) + n(row.owed), 2);
    // An invoice paid more than it asks for counts as collected only up to what it asks for.
    expect(data.table.rows.find((r) => r.street === 'Cedar Way')).toMatchObject({ billed: '21,000.00', collected: '6,000.00', owed: '15,000.00' });
  });

  it('shows zeros and no bars when there is no data', async () => {
    const data = await run({ houses: [], invoices: [] }, rateParams);
    expect(data.table.rows).toEqual([]);
    expect(data.chart!.bars).toEqual([]);
    expect(data.summary[3].value).toBe('-');
  });

  it('reads every invoice, not just the first 1,000', async () => {
    const many = Array.from({ length: 2500 }, (_, i) => inv(String(i).padStart(5, '0'), 'h1', 100, 0));
    const data = await run({ houses: houses as Row[], invoices: many }, rateParams);
    expect(data.table.totals!.billed).toBe('250,000.00');
  });

  it('uses the same houses and streets as the debt status chart', () => {
    const list = [{ id: 'a', streetName: 'Ojo Kadiri' }, { id: 'b', streetName: 'Gbolahon Bishi' }];
    const byDebt = summarizeDebtByStreet(list, [{ houseId: 'a', status: 'arrears' }, { houseId: 'b', status: 'credit' }], DEBT_STATUS_DEFAULTS.labels).streets.map((s) => [s.streetName, s.total]);
    const byMoney = summarizeCollectionByStreet(list, []).map((s) => [s.streetName, s.houseCount]);
    expect(byMoney).toEqual(byDebt);
  });
});

// ---------- Expenses by category and vendor ----------

const exp = (id: string, amount: number, category: string | null, vendor: string | null, over: Row = {}) => ({
  id, amount, expense_date: '2026-10-10', description: `Expense ${id}`, status: 'paid', resident_id: null, staff_id: null,
  category: category ? { name: category } : null, vendor: vendor ? { name: vendor } : null, ...over,
});
const expParams = { reportType: 'expenses_by_category' as const, includeDetails: false };

describe('Expenses by category and vendor (#1403)', () => {
  const expenses = [
    exp('1', 1000, 'Security', 'Guard Co'), exp('2', 500, 'Security', 'Guard Co'), exp('3', 300, 'Utilities', 'Power Ltd'),
    exp('4', 200, null, null), exp('5', 100, 'Utilities', null, { resident_id: 'r1' }),
    exp('pending', 9999, 'Security', 'Guard Co', { status: 'pending' }),
    exp('old', 8888, 'Security', 'Guard Co', { expense_date: '2026-09-30' }),
  ];

  it('totals and counts each category and each vendor, and both add up to the total', async () => {
    const data = await run({ expenses }, expParams);
    const rows = data.table.rows;
    const of = (kind: string) => rows.filter((r) => r.kind === kind);
    expect(of('Category').map((r) => [r.name, r.count, r.total])).toEqual([
      ['Security', 2, '1,500.00'], ['Utilities', 2, '400.00'], ['Uncategorised', 1, '200.00'],
    ]);
    expect(of('Vendor').map((r) => [r.name, r.count, r.total])).toEqual([
      ['Guard Co', 2, '1,500.00'], ['Power Ltd', 1, '300.00'], ['No vendor', 1, '200.00'], ['Resident (no vendor)', 1, '100.00'],
    ]);
    expect(data.table.totals).toMatchObject({ count: 5, total: '2,100.00' });
    expect(of('Category').reduce((s, r) => s + n(r.total), 0)).toBe(2100);
    expect(of('Vendor').reduce((s, r) => s + n(r.total), 0)).toBe(2100);
  });

  it('has tiles and a chart of the top categories', async () => {
    const data = await run({ expenses }, expParams);
    expect(data.summary.map((t) => [t.label, t.value])).toEqual([
      ['Total spent (NGN)', '2,100.00'], ['Expenses', 5], ['Categories used', 3], ['Largest category', 'Security'],
    ]);
    expect(data.chart!.title).toBe('Top categories (NGN)');
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([['Security', 1500], ['Utilities', 400], ['Uncategorised', 200]]);
  });

  it('limits the chart to the 8 largest categories but lists all in the table', async () => {
    const twelve = Array.from({ length: 12 }, (_, i) => exp(`c${i}`, 100 + i, `Cat ${i}`, 'V'));
    const data = await run({ expenses: twelve }, expParams);
    expect(data.chart!.bars).toHaveLength(8);
    expect(data.table.rows.filter((r) => r.kind === 'Category')).toHaveLength(12);
  });

  it('adds expense lines under their category only when asked', async () => {
    const off = await run({ expenses }, expParams);
    const on = await run({ expenses }, { ...expParams, includeDetails: true });
    expect(off.table.rows.some((r) => r.kind === null)).toBe(false);
    const lines = on.table.rows.filter((r) => r.kind === null);
    expect(lines).toHaveLength(5);
    expect(String(lines[0].name)).toBe('    10 October 2026, Guard Co, Expense 1');
    expect(on.table.rows[0]).toMatchObject({ kind: 'Category', name: 'Security' });
    expect(on.table.rows[1].kind).toBeNull();
    expect(on.table.totals).toMatchObject({ count: 5, total: '2,100.00' });
  });

  it('shows an empty report when nothing was spent', async () => {
    const data = await run({ expenses: [] }, expParams);
    expect(data.table.rows).toEqual([]);
    expect(data.summary[0].value).toBe('0.00');
    expect(data.summary[3].value).toBe('None');
    expect(data.chart!.bars).toEqual([]);
  });

  it('reads every expense, not just the first 1,000', async () => {
    const many = Array.from({ length: 2300 }, (_, i) => exp(String(i).padStart(5, '0'), 10, 'Security', 'Guard Co'));
    const data = await run({ expenses: many }, expParams);
    expect(data.table.totals).toMatchObject({ count: 2300, total: '23,000.00' });
  });
});

// ---------- Wallet balances ----------

const wallet = (id: string, resident: string, balance: number, name = resident) => ({ id, resident_id: resident, balance, resident: { first_name: name, last_name: 'Test' } });
const tx = (id: string, walletId: string, type: 'credit' | 'debit', amount: number, at: string) => ({ id, wallet_id: walletId, type, amount, created_at: `${at}T10:00:00+00:00` });
const walletParams = { reportType: 'wallet_balances' as const };

describe('Wallet balances (#1403)', () => {
  // Ada: two wallets (dues, levy). Balance now 700 = 300 + 400.
  // Dues: +500 on 5 Oct, -200 on 12 Oct (in period), +100 on 5 Nov (after). Levy: +400 on 20 Oct.
  const wallets = [wallet('w1', 'ada', 300, 'Ada'), wallet('w2', 'ada', 400, 'Ada'), wallet('w3', 'bola', 0, 'Bola'), wallet('w4', 'chi', 50, 'Chi')];
  const txs = [
    tx('t1', 'w1', 'credit', 500, '2026-10-05'), tx('t2', 'w1', 'debit', 200, '2026-10-12'), tx('t3', 'w1', 'credit', 100, '2026-11-05'),
    tx('t4', 'w2', 'credit', 400, '2026-10-20'), tx('t0', 'w1', 'credit', 999, '2026-09-30'),
  ];

  it('sums a resident across charges, and opening + credits - debits = closing', async () => {
    const data = await run({ resident_wallets: wallets, wallet_transactions: txs }, { ...walletParams, endDate: '2026-10-31' });
    // Closing at 31 Oct = 700 - 100 (5 Nov credit) = 600. Credits 900, debits 200, so opening = 600 - 900 + 200 = -100.
    expect(data.table.rows[0]).toEqual({ resident: 'Ada Test', opening: '-100.00', credits: '900.00', debits: '200.00', closing: '600.00' });
    for (const row of data.table.rows) expect(n(row.opening) + n(row.credits) - n(row.debits)).toBeCloseTo(n(row.closing), 2);
    expect(data.table.rows.map((r) => r.resident)).toEqual(['Ada Test', 'Chi Test']);
  });

  it('closing balance equals the wallet balance when the period reaches today', async () => {
    // A period that ends on or after the latest movement (as "today" always does): nothing is taken back out.
    const data = await run({ resident_wallets: wallets, wallet_transactions: txs }, { ...walletParams, startDate: '2026-10-01', endDate: '2099-12-31' });
    const ada = data.table.rows.find((r) => r.resident === 'Ada Test')!;
    expect(ada.closing).toBe('700.00');
    expect(data.table.totals!.closing).toBe('750.00');
    expect(data.summary[0].value).toBe('750.00');
  });

  it('keeps a resident with a balance but no movement, with opening = closing', async () => {
    const data = await run({ resident_wallets: wallets, wallet_transactions: txs }, walletParams);
    expect(data.table.rows.find((r) => r.resident === 'Chi Test')).toEqual({ resident: 'Chi Test', opening: '50.00', credits: '0.00', debits: '0.00', closing: '50.00' });
  });

  it('has tiles and a credits-versus-debits chart by month', async () => {
    const data = await run({ resident_wallets: wallets, wallet_transactions: txs }, { ...walletParams, startDate: '2026-09-01', endDate: '2026-10-31' });
    expect(data.summary.map((t) => t.label)).toEqual(['Resident credit held (NGN)', 'Credits in period (NGN)', 'Debits in period (NGN)', 'Residents with credit']);
    expect(data.chart!.bars.map((b) => [b.label, b.value])).toEqual([
      ['September 2026 credits', 999], ['September 2026 debits', 0], ['October 2026 credits', 900], ['October 2026 debits', 200],
    ]);
  });

  it('shows an empty report when there are no wallets', async () => {
    const data = await run({ resident_wallets: [], wallet_transactions: [] }, walletParams);
    expect(data.table.rows).toEqual([]);
    expect(data.summary[0].value).toBe('0.00');
  });

  it('reads every wallet and every transaction, not just the first 1,000', async () => {
    const manyWallets = Array.from({ length: 1500 }, (_, i) => wallet(`w${String(i).padStart(5, '0')}`, `r${i}`, 10));
    const manyTx = Array.from({ length: 2500 }, (_, i) => tx(`t${String(i).padStart(5, '0')}`, 'w00000', 'credit', 1, '2026-10-10'));
    const data = await run({ resident_wallets: manyWallets, wallet_transactions: manyTx }, walletParams);
    expect(data.table.rows).toHaveLength(1500);
    expect(data.table.rows.find((r) => r.resident === 'r0 Test')).toMatchObject({ credits: '2,500.00' });
  });
});
