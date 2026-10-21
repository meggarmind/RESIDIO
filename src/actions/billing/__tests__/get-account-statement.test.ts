import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccountStatement, getMyAccountStatement } from '@/actions/billing/get-account-statement';

const { createServerSupabaseClient, resolveAccess, getSettingResultAsService } = vi.hoisted(() => ({
    createServerSupabaseClient: vi.fn(),
    resolveAccess: vi.fn(),
    getSettingResultAsService: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/access', () => ({ resolveAccess, toAccessClient: (client: unknown) => client }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService }));

type QueryResult = { data: unknown; error: { message: string } | null };

// A thenable, chainable query that records every builder call so the test can read back the
// columns selected and the filters applied.
function createQuery(result: QueryResult) {
  const calls: Array<[string, unknown[]]> = [];
  const query: Record<string, unknown> = {
    then: (resolve: (value: QueryResult) => unknown) => resolve(result),
  };
  for (const method of ['select', 'eq', 'neq', 'or', 'gte', 'lte', 'lt', 'order', 'single']) {
    query[method] = (...args: unknown[]) => {
      calls.push([method, args]);
      return query;
    };
  }
  return { query, calls };
}

type Balance = { opening_balance: number; closing_balance: number; total_invoiced: number; total_paid: number; total_wallet_credits: number; total_wallet_debits: number; awaiting_verification: number };

const RESIDENT = { id: 'r1', first_name: 'ADEGOKE', last_name: 'TUNDE', resident_code: '551277', email: null, phone_primary: null, entity_type: 'individual', company_name: null };

function setup(responses: Record<string, QueryResult[]>, balance?: { data: Balance | null; error: { message: string } | null }) {
  const queries: Array<{ table: string; calls: Array<[string, unknown[]]> }> = [];
  const from = vi.fn((table: string) => {
    const { query, calls } = createQuery(responses[table]?.shift() ?? { data: [], error: null });
    queries.push({ table, calls });
    return query;
  });
  const rpc = vi.fn(() => ({ single: async () => balance ?? { data: null, error: { message: 'no balance stubbed' } } }));
  createServerSupabaseClient.mockResolvedValue({ from, rpc, auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) } });
  return { from, rpc, queries };
}

function asAdmin(isAdmin: boolean) {
  resolveAccess.mockResolvedValue(isAdmin
    ? { status: 'resolved', userId: 'u1', roleId: 'r', roleName: 'treasurer', permissions: ['billing.view'] }
    : { status: 'resolved', userId: 'u1', roleId: 'r', roleName: 'resident', permissions: [] });
}

function residentSetting(on: boolean) {
  getSettingResultAsService.mockResolvedValue({ status: 'ok', value: on });
}

const balanceOf = (b: Partial<Balance>): { data: Balance; error: null } => ({
  data: { opening_balance: 0, closing_balance: 0, total_invoiced: 0, total_paid: 0, total_wallet_credits: 0, total_wallet_debits: 0, awaiting_verification: 0, ...b },
  error: null,
});

// April invoice (₦10,000) paid on 5 May: a May to October statement must close at ₦0 (#863).
const APRIL_PAID_IN_MAY = {
  residents: [{ data: RESIDENT, error: null }],
  invoices: [
    { data: [], error: null },
    { data: [{ amount_due: 10000, amount_paid: 10000 }], error: null },
  ],
  payment_records: [{ data: [{ id: 'p1', amount: 10000, payment_date: '2026-05-05', reference_number: 'TRF1', method: 'bank_transfer', notes: null }], error: null }],
  resident_wallets: [{ data: null, error: null }],
};

const args = (calls: Array<[string, unknown[]]>, method: string) => calls.filter(([m]) => m === method).map(([, a]) => a);

describe('getAccountStatement', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
    asAdmin(false);
    residentSetting(false);
  });

  it('rejects dates that are not plain YYYY-MM-DD before querying', async () => {
    const { from } = setup({});
    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2015-01-01),or(id.neq.0', toDate: '2026-10-19' });
    expect(result).toEqual({ data: null, error: 'Dates must be in YYYY-MM-DD format' });
    expect(from).not.toHaveBeenCalled();
  });

  it('rejects a malformed toDate on its own', async () => {
    const { from } = setup({});
    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2015-01-01', toDate: '2026-10-19,id.neq.0' });
    expect(result).toEqual({ data: null, error: 'Dates must be in YYYY-MM-DD format' });
    expect(from).not.toHaveBeenCalled();
  });

  it('selects reference_number, filters invoices by period, and nets mirrored wallet credits out', async () => {
    const { queries } = setup({
      residents: [{ data: RESIDENT, error: null }],
      invoices: [
        { data: [{ id: 'i1', invoice_number: 'LEGACY-IBB-1-2015-01', amount_due: 5000, status: 'paid', invoice_type: 'SERVICE_CHARGE', period_start: '2015-01-01', period_end: '2015-01-31', created_at: '2026-08-09T22:35:50Z', billing_profile: { name: '5k per month' } }], error: null },
        { data: [], error: null },
      ],
      payment_records: [{ data: [{ id: 'p1', amount: 5000, payment_date: '2015-01-01', reference_number: 'TRX-1', method: 'bank_transfer', notes: null }], error: null }],
      resident_wallets: [{ data: { id: 'w' }, error: null }],
      wallet_transactions: [{ data: [{ id: 'w1', type: 'credit', amount: 5000, description: null, reference_type: 'payment', reference_id: 'p1', created_at: '2015-01-01T00:00:00Z' }], error: null }],
    });

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2015-01-01', toDate: '2026-10-19' });

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({ openingBalance: 0, closingBalance: 0, summary: { totalInvoiced: 5000, totalPaid: 5000, totalCredits: 0 } });
    expect(result.data!.transactions.map((t) => [t.type, t.date, t.reference])).toEqual([
      ['invoice', '2015-01-01', 'LEGACY-IBB-1-2015-01'],
      ['payment', '2015-01-01', 'TRX-1'],
    ]);

    const payments = queries.find((q) => q.table === 'payment_records')!;
    expect(args(payments.calls, 'select')[0][0]).toBe('id, amount, payment_date, reference_number, method, notes');

    const [periodQuery, priorQuery] = queries.filter((q) => q.table === 'invoices');
    expect(args(periodQuery.calls, 'gte')).toEqual([]);
    expect(args(periodQuery.calls, 'or')[0][0]).toBe(
      'and(period_start.gte.2015-01-01,period_start.lte.2026-10-19),and(period_start.is.null,created_at.gte.2015-01-01,created_at.lte.2026-10-19)',
    );
    expect(args(priorQuery.calls, 'or')[0][0]).toBe('period_start.lt.2015-01-01,and(period_start.is.null,created_at.lt.2015-01-01)');
  });

  it('keeps the pre-#863 opening balance for a non-admin while the resident setting is off', async () => {
    const { rpc } = setup(structuredClone(APRIL_PAID_IN_MAY));

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });

    // Today's computation, double count included: it opens at 0 and closes in false credit.
    expect(result.data).toMatchObject({ openingBalance: 0, closingBalance: -10000 });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('gives an admin the roll-forward balance, so the April invoice paid in May closes at 0', async () => {
    asAdmin(true);
    const { rpc, queries } = setup(structuredClone(APRIL_PAID_IN_MAY), balanceOf({ opening_balance: 10000, closing_balance: 0, total_paid: 10000 }));

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });

    expect(result.error).toBeNull();
    expect(rpc).toHaveBeenCalledWith('resident_account_balance', { p_resident_id: 'r1', p_house_id: null, p_from: '2026-05-01', p_to: '2026-10-20' });
    expect(result.data).toMatchObject({ openingBalance: 10000, closingBalance: 0, summary: { totalPaid: 10000, totalInvoiced: 0, netChange: -10000 } });
    expect(result.data!.transactions.map((t) => t.balance)).toEqual([0]);
    // The opening balance no longer reads amount_paid: only the period's invoice query runs.
    expect(queries.filter((q) => q.table === 'invoices')).toHaveLength(1);
  });

  it('switches a non-admin to the roll-forward balance once the resident setting is on', async () => {
    residentSetting(true);
    const { rpc } = setup(structuredClone(APRIL_PAID_IN_MAY), balanceOf({ opening_balance: 10000, closing_balance: 0, total_paid: 10000 }));

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.data).toMatchObject({ openingBalance: 10000, closingBalance: 0 });
  });

  it('lists only verified payments and bounds created_at by the Lagos day on a roll-forward statement', async () => {
    asAdmin(true);
    const { queries } = setup(structuredClone(APRIL_PAID_IN_MAY), balanceOf({ opening_balance: 10000, closing_balance: 0, total_paid: 10000 }));

    await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });

    const payments = queries.find((q) => q.table === 'payment_records')!;
    expect(args(payments.calls, 'eq')).toContainEqual(['is_verified', true]);
    const [periodQuery] = queries.filter((q) => q.table === 'invoices');
    expect(args(periodQuery.calls, 'or')[0][0]).toBe(
      'and(period_start.gte.2026-05-01,period_start.lte.2026-10-20),and(period_start.is.null,created_at.gte."2026-04-30T23:00:00.000Z",created_at.lt."2026-10-20T23:00:00.000Z")',
    );
  });

  it('leaves the wallet out of a single-property roll-forward statement and keeps it on all properties', async () => {
    asAdmin(true);
    const house = setup({ ...structuredClone(APRIL_PAID_IN_MAY), houses: [{ data: null, error: null }] }, balanceOf({}));
    await getAccountStatement({ residentId: 'r1', houseId: 'h1', fromDate: '2026-05-01', toDate: '2026-10-20' });
    expect(house.queries.map((q) => q.table)).not.toContain('resident_wallets');
    expect(house.rpc).toHaveBeenCalledWith('resident_account_balance', expect.objectContaining({ p_house_id: 'h1' }));

    const all = setup({ ...structuredClone(APRIL_PAID_IN_MAY), resident_wallets: [{ data: { id: 'w' }, error: null }], wallet_transactions: [{ data: [], error: null }] }, balanceOf({ opening_balance: 10000, closing_balance: 0, total_paid: 10000 }));
    await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });
    const wallet = all.queries.find((q) => q.table === 'wallet_transactions')!;
    expect(args(wallet.calls, 'gte')).toEqual([['created_at', '2026-04-30T23:00:00.000Z']]);
    expect(args(wallet.calls, 'lt')).toEqual([['created_at', '2026-10-20T23:00:00.000Z']]);
  });

  it('shows a wallet-credit resident in credit: totals come from the function, not the rows', async () => {
    asAdmin(true);
    setup({
      residents: [{ data: RESIDENT, error: null }],
      resident_wallets: [{ data: { id: 'w' }, error: null }],
      wallet_transactions: [{ data: [{ id: 'w1', type: 'credit', amount: 60000, description: 'Legacy credit', reference_type: 'legacy_tracker_credit', reference_id: null, created_at: '2026-06-01T09:00:00Z' }], error: null }],
    }, balanceOf({ closing_balance: -60000, total_wallet_credits: 60000 }));

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });

    expect(result.data).toMatchObject({ openingBalance: 0, closingBalance: -60000, summary: { totalCredits: 60000, netChange: -60000 } });
    expect(result.data!.transactions.map((t) => [t.type, t.balance])).toEqual([['wallet_credit', -60000]]);
  });

  it('logs when the rows disagree with the function, and reports the function figure', async () => {
    asAdmin(true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(structuredClone(APRIL_PAID_IN_MAY), balanceOf({ opening_balance: 10000, closing_balance: 500, total_paid: 9500 }));

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });

    expect(result.data).toMatchObject({ closingBalance: 500, summary: { totalPaid: 9500, netChange: -9500 } });
    expect(errorSpy).toHaveBeenCalledWith('[account-statement] rows disagree with resident_account_balance', expect.objectContaining({ rowsClosing: 0, balanceClosing: 500 }));
    errorSpy.mockRestore();
  });

  it('returns an error instead of a statement when the balance cannot be read', async () => {
    asAdmin(true);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    setup(structuredClone(APRIL_PAID_IN_MAY), { data: null, error: { message: 'function missing' } });

    const result = await getAccountStatement({ residentId: 'r1', fromDate: '2026-05-01', toDate: '2026-10-20' });

    expect(result).toEqual({ data: null, error: 'Account balance could not be read: function missing' });
    errorSpy.mockRestore();
  });

  it('keeps the portal statement on the pre-#863 balance for an admin who is also a resident while the setting is off', async () => {
    asAdmin(true);
    const { rpc } = setup({ ...structuredClone(APRIL_PAID_IN_MAY), residents: [{ data: { id: 'r1' }, error: null }, { data: RESIDENT, error: null }] });
    const client = await createServerSupabaseClient();
    client.auth.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });

    const result = await getMyAccountStatement({ fromDate: '2026-05-01', toDate: '2026-10-20' });

    expect(rpc).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ openingBalance: 0, closingBalance: -10000 });
  });
});
