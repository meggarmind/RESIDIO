import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';

const { authorizePermission, getCurrentUserPermissions, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  getCurrentUserPermissions: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission, getCurrentUserPermissions }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

type RpcResult = { data: unknown; error: { message: string } | null };

const zeroStatusCounts = {
  unpaid: 0,
  paid: 0,
  partially_paid: 0,
  void: 0,
  overdue_unpaid: 0,
  overdue_partially_paid: 0,
};

function makeClient(
  rpc: (args: Record<string, string>) => RpcResult,
  other: (name: string, args: Record<string, unknown>) => RpcResult = (name) =>
    name === 'get_dashboard_invoice_status_counts'
      ? { data: zeroStatusCounts, error: null }
      : name === 'get_dashboard_financial_totals'
        ? { data: {}, error: null }
        : { data: [], error: null }, // get_dashboard_monthly_invoice_counts: nothing generated
) {
  const selects: Array<{ table: string; columns: string }> = [];
  const rpcCalls: Array<{ name: string; args: Record<string, string> }> = [];
  const client = {
    from(table: string) {
      const query: Record<string, unknown> = {};
      for (const m of ['eq', 'neq', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'or', 'order', 'limit', 'range']) {
        query[m] = vi.fn(() => query);
      }
      query.select = vi.fn((columns: string) => {
        selects.push({ table, columns });
        return query;
      });
      query.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve({ data: [], count: 0, error: null }).then(resolve, reject);
      return query;
    },
    rpc(name: string, args: Record<string, string>) {
      rpcCalls.push({ name, args });
      if (name !== 'get_dashboard_payment_metrics') return Promise.resolve(other(name, args));
      return Promise.resolve(rpc(args));
    },
  };
  return { client, selects, rpcCalls };
}

// Totals far above the 1000-row PostgREST cap, keyed on the window's month so the current month,
// the previous month and the 6 trend months get distinguishable numbers.
const metricsFor = (args: Record<string, string>): RpcResult => {
  const month = Number(args.p_month_start.slice(5, 7));
  return {
    data: {
      collected_count: 2000 + month,
      collected_total: 1_000_000 + month,
      verified_total: 500_000 + month,
      unverified_count: 7,
      unverified_total: 70,
    },
    error: null,
  };
};

describe('admin dashboard snapshot payment figures come from the RPC (#215, #459)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizePermission.mockResolvedValue({ authorized: true });
    getCurrentUserPermissions.mockResolvedValue({ userId: 'u', permissions: [] });
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('derives revenue, previous-month revenue and the 6-month trend from the aggregate, with no payment row download', async () => {
    const { client, selects, rpcCalls } = makeClient(metricsFor);
    createServerSupabaseClient.mockResolvedValue(client);

    const { data, error } = await getAdminDashboardSnapshot();
    expect(error).toBeNull();

    const now = new Date();
    const cur = now.getMonth() + 1;
    const prevMonth = ((now.getMonth() + 11) % 12) + 1;
    expect(data?.financialHealth?.totalMonthlyRevenue).toBe(1_000_000 + cur);
    expect(data?.financialHealth?.monthlyRevenue).toBe(500_000 + cur);
    expect(data?.financialHealth?.previousMonthRevenue).toBe(500_000 + prevMonth);

    expect(data?.monthlyTrends).toHaveLength(6);
    const last = data!.monthlyTrends[5];
    expect(last.revenue).toBe(1_000_000 + cur);
    expect(last.paymentsReceived).toBe(2000 + cur);

    // current + previous month for financial health, 6 trend months
    const paymentCalls = rpcCalls.filter((c) => c.name === 'get_dashboard_payment_metrics');
    expect(paymentCalls).toHaveLength(8);
    // plus ONE invoice-status call and ONE monthly-invoice call (not 6 + 6 head counts)
    expect(rpcCalls.filter((c) => c.name === 'get_dashboard_invoice_status_counts')).toHaveLength(1);
    expect(rpcCalls.filter((c) => c.name === 'get_dashboard_monthly_invoice_counts')).toHaveLength(1);
    // plus ONE financial totals call shared by the financial and levy cards (#775)
    expect(rpcCalls.filter((c) => c.name === 'get_dashboard_financial_totals')).toHaveLength(1);
    expect(rpcCalls).toHaveLength(11);
    expect(selects.filter((s) => s.table === 'invoices' && s.columns === '*')).toEqual([]);
    for (const c of paymentCalls) {
      expect(c.args.p_month_start).toMatch(/^\d{4}-\d{2}-01$/);
      expect(c.args.p_month_end).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/);
    }

    // No payment_records read selects `amount` any more.
    expect(selects.filter((s) => s.table === 'payment_records' && s.columns.includes('amount'))).toEqual([]);
  });

  it('reports financial health as null (not zeros) and an empty trend on RPC error, never partial numbers', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boom' } }));
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.financialHealth).toBeNull();
    expect(data?.monthlyTrends).toEqual([]);
  });

  it('maps the grouped monthly invoice counts onto the six month labels, zero for empty months', async () => {
    const { client, rpcCalls } = makeClient(metricsFor, (name) =>
      name === 'get_dashboard_monthly_invoice_counts'
        ? // windows 2 and 5 absent from the result: they must read 0 and not shift the others
          { data: [{ idx: 1, count: 11 }, { idx: 3, count: 33 }, { idx: 4, count: 44 }, { idx: 6, count: 66 }], error: null }
        : { data: zeroStatusCounts, error: null },
    );
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.monthlyTrends.map((t) => t.invoicesGenerated)).toEqual([11, 0, 33, 44, 0, 66]);

    // The windows sent are the six calendar months, oldest first, inclusive of the last second.
    const call = rpcCalls.find((c) => c.name === 'get_dashboard_monthly_invoice_counts')!;
    const starts = call.args.p_month_starts as unknown as string[];
    const ends = call.args.p_month_ends as unknown as string[];
    expect(starts).toHaveLength(6);
    expect(ends).toHaveLength(6);
    const now = new Date();
    expect(starts[0]).toBe(new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString());
    expect(starts[5]).toBe(new Date(now.getFullYear(), now.getMonth(), 1).toISOString());
    expect(ends[5]).toBe(new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString());
    expect(data?.monthlyTrends[5].month).toBe(
      new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
    );
  });

  it('empties the trend (never partial numbers) when the monthly invoice counts RPC errors', async () => {
    const { client } = makeClient(metricsFor, (name) =>
      name === 'get_dashboard_monthly_invoice_counts'
        ? { data: null, error: { message: 'boom' } }
        : { data: zeroStatusCounts, error: null },
    );
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.monthlyTrends).toEqual([]);
    expect(data?.financialHealth).not.toBeNull();
  });

  it('treats a null result with no error the same way', async () => {
    const { client } = makeClient(() => ({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.financialHealth).toBeNull();
    expect(data?.monthlyTrends).toEqual([]);
  });
});
