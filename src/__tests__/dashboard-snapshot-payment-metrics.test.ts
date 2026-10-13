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

function makeClient(rpc: (args: Record<string, string>) => RpcResult) {
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
    expect(data?.financialHealth.totalMonthlyRevenue).toBe(1_000_000 + cur);
    expect(data?.financialHealth.monthlyRevenue).toBe(500_000 + cur);
    expect(data?.financialHealth.previousMonthRevenue).toBe(500_000 + prevMonth);

    expect(data?.monthlyTrends).toHaveLength(6);
    const last = data!.monthlyTrends[5];
    expect(last.revenue).toBe(1_000_000 + cur);
    expect(last.paymentsReceived).toBe(2000 + cur);

    // current + previous month for financial health, 6 trend months
    expect(rpcCalls).toHaveLength(8);
    expect(new Set(rpcCalls.map((c) => c.name))).toEqual(new Set(['get_dashboard_payment_metrics']));
    for (const c of rpcCalls) {
      expect(c.args.p_month_start).toMatch(/^\d{4}-\d{2}-01$/);
      expect(c.args.p_month_end).toMatch(/^\d{4}-\d{2}-(28|29|30|31)$/);
    }

    // No payment_records read selects `amount` any more.
    expect(selects.filter((s) => s.table === 'payment_records' && s.columns.includes('amount'))).toEqual([]);
  });

  it('falls back to the existing empty financial figures and an empty trend on RPC error, never partial numbers', async () => {
    const { client } = makeClient(() => ({ data: null, error: { message: 'boom' } }));
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.financialHealth.totalMonthlyRevenue).toBe(0);
    expect(data?.financialHealth.monthlyRevenue).toBe(0);
    expect(data?.monthlyTrends).toEqual([]);
  });

  it('treats a null result with no error the same way', async () => {
    const { client } = makeClient(() => ({ data: null, error: null }));
    createServerSupabaseClient.mockResolvedValue(client);

    const { data } = await getAdminDashboardSnapshot();

    expect(data?.financialHealth.totalMonthlyRevenue).toBe(0);
    expect(data?.monthlyTrends).toEqual([]);
  });
});
