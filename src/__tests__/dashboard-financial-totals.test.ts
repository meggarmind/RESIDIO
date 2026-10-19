import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAdminDashboardSnapshot,
  getDashboardFinancialHealth,
} from '@/actions/dashboard/get-enhanced-dashboard-stats';

/**
 * Issue #775: financial health and the development levy card come from one server-side aggregate
 * (get_dashboard_financial_totals) instead of whole-table downloads summed in JavaScript, which
 * the PostgREST 1000-row cap silently truncated.
 */

const { authorizePermission, getCurrentUserPermissions, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  getCurrentUserPermissions: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission, getCurrentUserPermissions }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

type RpcResult = { data: unknown; error: { message: string } | null };

const zeroPaymentMetrics = { collected_count: 0, collected_total: 0, verified_total: 0 };
const zeroStatusCounts = {
  unpaid: 0, paid: 0, partially_paid: 0, void: 0, overdue_unpaid: 0, overdue_partially_paid: 0,
};

function makeClient(totals: () => RpcResult) {
  const fromTables: string[] = [];
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const client = {
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    from(table: string) {
      fromTables.push(table);
      const query: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'neq', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'or', 'order', 'limit']) {
        query[m] = vi.fn(() => query);
      }
      query.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
      return query;
    },
    rpc(name: string, args: Record<string, unknown>) {
      rpcCalls.push({ name, args });
      if (name === 'get_dashboard_financial_totals') return Promise.resolve(totals());
      if (name === 'get_dashboard_invoice_status_counts') return Promise.resolve({ data: zeroStatusCounts, error: null });
      if (name === 'get_dashboard_monthly_invoice_counts') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({ data: zeroPaymentMetrics, error: null });
    },
  };
  return { client, fromTables, rpcCalls };
}

// ── Fixture: the rows the old client queries would have downloaded ──────────────────────────

const TODAY = new Date().toISOString().split('T')[0];
const PAST = '2000-01-01';
const FUTURE = '2999-12-31';

type Invoice = { amount_due: number; amount_paid: number; status: string; due_date: string; levy: boolean; house_id: string | null };
type Fixture = {
  invoices: Invoice[];
  wallets: number[];
  bankRows: Array<{ amount: number; transaction_type: string; importStatus: string }>;
  pettyCash: Array<{ current_balance: number; is_active: boolean }>;
};

const FIXTURE: Fixture = {
  invoices: [
    { amount_due: 1000, amount_paid: 0, status: 'unpaid', due_date: PAST, levy: false, house_id: 'h1' },
    { amount_due: 2000, amount_paid: 500, status: 'partially_paid', due_date: PAST, levy: false, house_id: 'h2' },
    { amount_due: 3000, amount_paid: 0, status: 'unpaid', due_date: FUTURE, levy: false, house_id: 'h3' },
    // Due today is not overdue (strict <).
    { amount_due: 400, amount_paid: 0, status: 'unpaid', due_date: TODAY, levy: false, house_id: 'h3' },
    { amount_due: 1500, amount_paid: 1500, status: 'paid', due_date: PAST, levy: false, house_id: 'h1' },
    // Credit note: a negative-amount invoice still nets into the totals.
    { amount_due: -250, amount_paid: 0, status: 'unpaid', due_date: FUTURE, levy: false, house_id: 'h2' },
    // Void invoices count nowhere, however large.
    { amount_due: 99_999, amount_paid: 0, status: 'void', due_date: PAST, levy: false, house_id: 'h1' },
    { amount_due: 50_000, amount_paid: 0, status: 'void', due_date: PAST, levy: true, house_id: 'h4' },
    // Levy invoices: two houses pending, one fully paid.
    { amount_due: 10_000, amount_paid: 2_000, status: 'partially_paid', due_date: FUTURE, levy: true, house_id: 'h4' },
    { amount_due: 10_000, amount_paid: 0, status: 'unpaid', due_date: PAST, levy: true, house_id: 'h4' },
    { amount_due: 10_000, amount_paid: 0, status: 'unpaid', due_date: FUTURE, levy: true, house_id: 'h5' },
    { amount_due: 10_000, amount_paid: 10_000, status: 'paid', due_date: PAST, levy: true, house_id: 'h6' },
  ],
  wallets: [1200, 300.5, 0],
  bankRows: [
    { amount: 5000, transaction_type: 'credit', importStatus: 'completed' },
    { amount: 1200, transaction_type: 'debit', importStatus: 'completed' },
    { amount: 9999, transaction_type: 'credit', importStatus: 'pending' },
  ],
  pettyCash: [
    { current_balance: 800, is_active: true },
    { current_balance: 700, is_active: false },
  ],
};

const EMPTY: Fixture = { invoices: [], wallets: [], bankRows: [], pettyCash: [] };

/** The pre-#775 client-side sums, verbatim in effect, over the rows each old query returned. */
function oldClientSums(f: Fixture) {
  const nonVoid = f.invoices.filter((i) => i.status !== 'void');
  const totalDue = nonVoid.reduce((s, i) => s + i.amount_due, 0);
  const totalCollected = nonVoid.reduce((s, i) => s + i.amount_paid, 0);
  const overdue = f.invoices.filter((i) => ['unpaid', 'partially_paid'].includes(i.status) && i.due_date < TODAY);
  const walletCredits = f.wallets.reduce((s, b) => s + b, 0);
  const bankBalance = f.bankRows
    .filter((r) => r.importStatus === 'completed')
    .reduce((s, r) => (r.transaction_type === 'credit' ? s + r.amount : s - r.amount), 0);
  const pettyCashBalance = f.pettyCash.filter((p) => p.is_active).reduce((s, p) => s + p.current_balance, 0);
  const levy = nonVoid.filter((i) => i.levy);
  const totalLevyAmount = levy.reduce((s, i) => s + i.amount_due, 0);
  const paidLevyAmount = levy.reduce((s, i) => s + i.amount_paid, 0);
  return {
    financialHealth: {
      totalOutstanding: totalDue - totalCollected,
      totalCollected,
      collectionRate: totalDue > 0 ? (totalCollected / totalDue) * 100 : 0,
      totalWalletBalance: walletCredits,
      walletCredits,
      importedBankNetCash: bankBalance,
      pettyCashBalance,
      estateCash: bankBalance + pettyCashBalance,
      portfolioValue: bankBalance + pettyCashBalance,
      overdueAmount: overdue.reduce((s, i) => s + (i.amount_due - i.amount_paid), 0),
      overdueCount: overdue.length,
    },
    developmentLevy: {
      totalLeviesGenerated: levy.length,
      totalLevyAmount,
      paidLevyAmount,
      pendingLevyAmount: totalLevyAmount - paidLevyAmount,
      housesWithPendingLevy: new Set(
        levy.filter((i) => i.status !== 'paid' && i.amount_due - i.amount_paid > 0).map((i) => i.house_id),
      ).size,
    },
  };
}

/**
 * What get_dashboard_financial_totals returns for the fixture. Postgres serialises bigint COUNTs
 * as numbers and numeric SUMs as numbers or strings depending on the driver; strings are used for
 * some fields to prove the mapping coerces them.
 */
function rpcRowFor(f: Fixture) {
  const old = oldClientSums(f);
  const nonVoid = f.invoices.filter((i) => i.status !== 'void');
  const totalDue = nonVoid.reduce((s, i) => s + i.amount_due, 0);
  return {
    invoice_total_due: String(totalDue),
    invoice_total_paid: old.financialHealth.totalCollected,
    overdue_amount: String(old.financialHealth.overdueAmount),
    overdue_count: old.financialHealth.overdueCount,
    wallet_balance: old.financialHealth.walletCredits,
    bank_net: old.financialHealth.importedBankNetCash,
    petty_cash_balance: old.financialHealth.pettyCashBalance,
    levy_count: old.developmentLevy.totalLeviesGenerated,
    levy_total_due: String(old.developmentLevy.totalLevyAmount),
    levy_total_paid: old.developmentLevy.paidLevyAmount,
    levy_houses_pending: old.developmentLevy.housesWithPendingLevy,
  };
}

describe('dashboard financial totals come from one aggregate (#775)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1', permissions: [], error: null });
    getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: [] });
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('pins the fixture to hand-computed figures, so the parity tests below compare real numbers', () => {
    const { financialHealth: f, developmentLevy: l } = oldClientSums(FIXTURE);
    // non-void due: 1000+2000+3000+400+1500-250 + 10000*4 = 47650; paid: 500+1500+2000+10000 = 14000
    expect(f.totalOutstanding).toBe(33_650);
    expect(f.totalCollected).toBe(14_000);
    // overdue: 1000 + (2000-500) + 10000 levy unpaid past due
    expect(f.overdueAmount).toBe(12_500);
    expect(f.overdueCount).toBe(3);
    expect(f.importedBankNetCash).toBe(3_800);
    expect(f.estateCash).toBe(4_600);
    expect(f.walletCredits).toBe(1500.5);
    expect(l).toEqual({
      totalLeviesGenerated: 4,
      totalLevyAmount: 40_000,
      paidLevyAmount: 12_000,
      pendingLevyAmount: 28_000,
      housesWithPendingLevy: 2,
    });
  });

  for (const [label, fixture] of [['a populated estate', FIXTURE], ['empty tables', EMPTY]] as const) {
    it(`maps the RPC row to the same figures the old client sums produced, for ${label}`, async () => {
      const { client } = makeClient(() => ({ data: rpcRowFor(fixture), error: null }));
      createServerSupabaseClient.mockResolvedValue(client);

      const { data, error } = await getAdminDashboardSnapshot();

      expect(error).toBeNull();
      const expected = oldClientSums(fixture);
      expect(data?.financialHealth).toMatchObject(expected.financialHealth);
      expect(data?.developmentLevy).toEqual(expected.developmentLevy);
    });
  }

  it('reads none of the summed tables and issues the aggregate once, with the UTC date', async () => {
    const { client, fromTables, rpcCalls } = makeClient(() => ({ data: rpcRowFor(FIXTURE), error: null }));
    createServerSupabaseClient.mockResolvedValue(client);

    await getAdminDashboardSnapshot();

    for (const table of ['invoices', 'resident_wallets', 'bank_statement_rows', 'petty_cash_accounts', 'billing_profiles']) {
      expect(fromTables).not.toContain(table);
    }
    const calls = rpcCalls.filter((c) => c.name === 'get_dashboard_financial_totals');
    expect(calls).toEqual([{ name: 'get_dashboard_financial_totals', args: { p_today: TODAY } }]);
  });

  it('reports financial health as null and the levy card as its zero fallback when the RPC errors', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boom' } }));
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.financialHealth).toBeNull();
    expect(data?.developmentLevy).toEqual({
      totalLeviesGenerated: 0, totalLevyAmount: 0, paidLevyAmount: 0, pendingLevyAmount: 0, housesWithPendingLevy: 0,
    });
    expect(data?.invoiceDistribution).not.toBeNull();
  });

  it('treats a null result with no error as a failure, not zeros', async () => {
    const { client } = makeClient(() => ({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.financialHealth).toBeNull();
  });

  it('serves the standalone financial card from the same aggregate', async () => {
    const { client, rpcCalls } = makeClient(() => ({ data: rpcRowFor(FIXTURE), error: null }));
    createServerSupabaseClient.mockResolvedValue(client);

    const { data, error } = await getDashboardFinancialHealth();

    expect(error).toBeNull();
    expect(data).toMatchObject(oldClientSums(FIXTURE).financialHealth);
    expect(rpcCalls.filter((c) => c.name === 'get_dashboard_financial_totals')).toHaveLength(1);
  });

  it('surfaces the RPC error on the standalone financial card', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boom' } }));
    createServerSupabaseClient.mockResolvedValue(client);

    const result = await getDashboardFinancialHealth();

    expect(result.data).toBeNull();
  });
});
