import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY } from '@/hooks/use-dashboard';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, getCurrentUserPermissions, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  // #197: fetchRecentActivity now reads the caller's permission set before
  // touching audit_logs. Without this in the mock the module export is
  // undefined and the sub-fetch throws into its timeout fallback, quietly
  // hollowing out the recentActivity assertion below.
  getCurrentUserPermissions: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission, getCurrentUserPermissions }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

interface QueryResult {
  data?: unknown[];
  error?: Error | null;
  count?: number | null;
}

function createChainableQuery(result: QueryResult = { data: [], error: null, count: 0 }) {
  const query: Record<string, unknown> = {};
  const methods = ['select', 'eq', 'neq', 'in', 'not', 'gt', 'gte', 'lt', 'lte', 'or', 'order', 'limit'];
  for (const method of methods) {
    query[method] = vi.fn().mockImplementation(() => query);
  }
  query.then = (resolve: (value: QueryResult) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return query;
}

// Realistic aggregate keyed on the window's calendar month, so each trend month and the
// current / previous month produce distinguishable values (#215).
const rpc = vi.fn();
const metricsByMonth = (month: number) => ({
  collected_count: 1200 + month,
  collected_total: 2_500_000 + month * 1000,
  verified_total: 2_000_000 + month * 1000,
  unverified_count: 4,
  unverified_total: 40_000,
});

describe('admin dashboard snapshot contract', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
      if (name === 'get_dashboard_invoice_status_counts') {
        return Promise.resolve({
          data: { unpaid: 5, paid: 0, partially_paid: 0, void: 0, overdue_unpaid: 0, overdue_partially_paid: 0 },
          error: null,
        });
      }
      if (name === 'get_dashboard_monthly_invoice_counts') {
        // Every trend month reports 5 invoices generated.
        return Promise.resolve({
          data: [1, 2, 3, 4, 5, 6].map((idx) => ({ idx, count: 5 })),
          error: null,
        });
      }
      return Promise.resolve({
        data: metricsByMonth(Number((args as { p_month_start: string }).p_month_start.slice(5, 7))),
        error: null,
      });
    });
    authorizePermission.mockReset();
    getCurrentUserPermissions.mockReset();
    getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: [] });
    createServerSupabaseClient.mockReset();
  });

  it('uses one stable query key for the dashboard snapshot', () => {
    expect(ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY).toEqual(['admin-dashboard-snapshot']);
  });

  it('rejects unauthorized reads before creating a Supabase client', async () => {
    authorizePermission.mockResolvedValue({
      authorized: false,
      error: 'Unauthorized: Missing permission',
    });

    const result = await getAdminDashboardSnapshot();

    expect(result).toEqual({ data: null, error: 'Unauthorized: Missing permission' });
    expect(authorizePermission).toHaveBeenCalledTimes(1);
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('fetches full snapshot when authorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: true });

    const mockFrom = vi.fn().mockImplementation(() => createChainableQuery({ data: [], error: null, count: 5 }));

    createServerSupabaseClient.mockResolvedValue({
      from: mockFrom,
      rpc,
    });

    const result = await getAdminDashboardSnapshot();

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_VIEW);
    expect(createServerSupabaseClient).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data).toHaveProperty('financialHealth');
    expect(result.data).toHaveProperty('invoiceDistribution');
    expect(result.data).toHaveProperty('securityAlerts');
    expect(result.data).toHaveProperty('developmentLevy');
    expect(result.data).toHaveProperty('quickStats');
    expect(result.data).toHaveProperty('recentActivity');
    expect(result.data).toHaveProperty('monthlyTrends');
    expect(result.data).toHaveProperty('actionMetrics');
    expect(result.data).toHaveProperty('lastUpdated');

    // Financial health and trends are sourced from the RPC, not from the fallback defaults.
    const now = new Date();
    const cur = now.getMonth() + 1;
    const prev = ((now.getMonth() + 11) % 12) + 1;
    expect(result.data?.financialHealth?.totalMonthlyRevenue).toBe(2_500_000 + cur * 1000);
    expect(result.data?.financialHealth?.monthlyRevenue).toBe(2_000_000 + cur * 1000);
    expect(result.data?.financialHealth?.previousMonthRevenue).toBe(2_000_000 + prev * 1000);
    expect(result.data?.monthlyTrends).toHaveLength(6);
    expect(result.data?.monthlyTrends[5]).toMatchObject({
      revenue: 2_500_000 + cur * 1000,
      paymentsReceived: 1200 + cur,
      invoicesGenerated: 5,
    });
    // 8 payment-metric windows + 1 invoice status counts + 1 monthly invoice counts
    expect(rpc).toHaveBeenCalledTimes(10);
  });

  it('reports financial health as null and trends as empty when the payment RPC errors', async () => {
    authorizePermission.mockResolvedValue({ authorized: true });
    rpc.mockResolvedValue({ data: null, error: { message: 'rpc failed' } });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    createServerSupabaseClient.mockResolvedValue({
      from: vi.fn().mockImplementation(() => createChainableQuery({ data: [], error: null, count: 5 })),
      rpc,
    });

    const result = await getAdminDashboardSnapshot();

    expect(result.error).toBeNull();
    expect(result.data?.financialHealth).toBeNull();
    expect(result.data?.monthlyTrends).toEqual([]);
    // Unrelated sections are unaffected by the payment failure.
    expect(result.data?.invoiceDistribution).toBeDefined();
  });

  it('gracefully handles partial subsystem query failures via fallback defaults', async () => {
    authorizePermission.mockResolvedValue({ authorized: true });

    const mockFrom = vi.fn().mockImplementation((table: string) => {
      if (table === 'security_contacts') {
        throw new Error('Security subsystem query failed');
      }
      return createChainableQuery({ data: [], error: null, count: 2 });
    });

    createServerSupabaseClient.mockResolvedValue({
      from: mockFrom,
      rpc,
    });

    const result = await getAdminDashboardSnapshot();

    expect(result.error).toBeNull();
    expect(result.data).not.toBeNull();
    expect(result.data?.securityAlerts).toEqual({
      expiringCodesCount: 0,
      expiredCodesCount: 0,
      suspendedContactsCount: 0,
      recentFlaggedEntries: 0,
      expiringCodes: [],
    });
  });
  // #101 criterion 3: a failed section is "unavailable" (null), never a zero-filled object
  // the UI would render as a genuine "All clear" / "0 items" / "No invoices recorded".
  describe('failed sub-queries are reported as null, not zeros (#101)', () => {
    async function snapshotWith(
      from: (table: string) => unknown,
      overrideRpc?: (name: string, args: Record<string, unknown>) => unknown,
    ) {
      if (overrideRpc) {
        const base = rpc.getMockImplementation()!;
        rpc.mockImplementation((name: string, args: Record<string, unknown>) =>
          overrideRpc(name, args) ?? base(name, args),
        );
      }
      authorizePermission.mockResolvedValue({ authorized: true });
      vi.spyOn(console, 'error').mockImplementation(() => {});
      createServerSupabaseClient.mockResolvedValue({ from: vi.fn(from), rpc });
      const result = await getAdminDashboardSnapshot();
      expect(result.error).toBeNull();
      return result.data!;
    }
    const ok = () => createChainableQuery({ data: [], error: null, count: 2 });

    it('reports actionMetrics as null when its payment_records query throws', async () => {
      const data = await snapshotWith((table) => {
        if (table === 'payment_records') throw new Error('payment_records failed');
        return ok();
      });
      expect(data.actionMetrics).toBeNull();
      expect(data.quickStats).not.toBeNull();
      expect(data.invoiceDistribution).not.toBeNull();
    });

    it('reports quickStats as null when its houses query throws', async () => {
      const data = await snapshotWith((table) => {
        if (table === 'houses') throw new Error('houses failed');
        return ok();
      });
      expect(data.quickStats).toBeNull();
      expect(data.actionMetrics).not.toBeNull();
      expect(data.invoiceDistribution).not.toBeNull();
    });

    it('reports invoiceDistribution as null when the status counts RPC errors', async () => {
      const data = await snapshotWith(
        () => ok(),
        (name) =>
          name === 'get_dashboard_invoice_status_counts'
            ? Promise.resolve({ data: null, error: { message: 'status counts failed' } })
            : undefined,
      );
      expect(data.invoiceDistribution).toBeNull();
      expect(data.quickStats).not.toBeNull();
      expect(data.actionMetrics).not.toBeNull();
    });

    it('reports monthlyTrends as empty when the monthly invoice counts RPC errors', async () => {
      const data = await snapshotWith(
        () => ok(),
        (name) =>
          name === 'get_dashboard_monthly_invoice_counts'
            ? Promise.resolve({ data: null, error: { message: 'monthly counts failed' } })
            : undefined,
      );
      expect(data.monthlyTrends).toEqual([]);
      expect(data.invoiceDistribution).not.toBeNull();
    });

    it('keeps a genuine zero as a zero object, distinct from null', async () => {
      const data = await snapshotWith(
        () => createChainableQuery({ data: [], error: null, count: 0 }),
        (name) =>
          name === 'get_dashboard_invoice_status_counts'
            ? Promise.resolve({
                data: { unpaid: 0, paid: 0, partially_paid: 0, void: 0, overdue_unpaid: 0, overdue_partially_paid: 0 },
                error: null,
              })
            : undefined,
      );
      expect(data.invoiceDistribution).toEqual({ unpaid: 0, paid: 0, partiallyPaid: 0, overdue: 0, void: 0 });
      expect(data.actionMetrics).toMatchObject({ totalRequiringAttention: 0 });
      expect(data.quickStats).toMatchObject({ totalHouses: 0 });
    });
  });
});
