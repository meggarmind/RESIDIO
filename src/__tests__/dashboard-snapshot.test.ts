import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY } from '@/hooks/use-dashboard';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
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

describe('admin dashboard snapshot contract', () => {
  beforeEach(() => {
    authorizePermission.mockReset();
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
});
