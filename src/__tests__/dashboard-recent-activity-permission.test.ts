/**
 * Issue #197 -- the server half.
 *
 * `audit_logs` is guarded by an RLS SELECT policy reading
 * `has_permission('settings.view_audit_logs')` (introduced by #181, merged).
 * Six of the eight roles do not hold it, and PostgREST returns a denial as
 * zero rows -- so `fetchRecentActivity` could not tell "you may not look" from
 * "nothing happened", and every caller inherited that ambiguity.
 *
 * These tests pin the fix at all three entry points into `fetchRecentActivity`:
 * `getAdminDashboardSnapshot`, `getEnhancedDashboardStats` and
 * `getDashboardRecentActivity`. They fail if the pre-query permission check is
 * removed, if it stops using `settings.view_audit_logs`, if the flag stops
 * being propagated into the snapshot, or if a denial starts being reported as
 * an ordinary empty list.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAdminDashboardSnapshot,
  getEnhancedDashboardStats,
  getDashboardRecentActivity,
} from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, getCurrentUserPermissions, createServerSupabaseClient } = vi.hoisted(
  () => ({
    authorizePermission: vi.fn(),
    getCurrentUserPermissions: vi.fn(),
    createServerSupabaseClient: vi.fn(),
  })
);

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

const AUDIT_ROW = {
  id: 'log-1',
  action: 'CREATE',
  entity_type: 'payment_records',
  entity_display: 'House 12',
  description: 'Payment recorded',
  created_at: '2026-09-08T09:00:00.000Z',
  new_values: {},
  actor: { full_name: 'Admin User' },
};

/** Table names the mock was asked for, so we can assert audit_logs was skipped. */
let tablesQueried: string[] = [];

function mockSupabase(auditRows: unknown[] = []) {
  tablesQueried = [];
  const from = vi.fn().mockImplementation((table: string) => {
    tablesQueried.push(table);
    if (table === 'audit_logs') {
      return createChainableQuery({ data: auditRows, error: null });
    }
    return createChainableQuery({ data: [], error: null, count: 0 });
  });

  createServerSupabaseClient.mockResolvedValue({
    from,
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
  });
}

/** Every permission except the audit-log one -- i.e. a chairman-shaped role. */
const WITHOUT_AUDIT = ['billing.view', 'residents.view', 'settings.manage_general'];
const WITH_AUDIT = [...WITHOUT_AUDIT, PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS];

describe('recent activity permission state (#197)', () => {
  beforeEach(() => {
    authorizePermission.mockReset();
    getCurrentUserPermissions.mockReset();
    createServerSupabaseClient.mockReset();
    authorizePermission.mockResolvedValue({ authorized: true });
  });

  describe('getAdminDashboardSnapshot', () => {
    it('flags the card unavailable for a role without settings.view_audit_logs', async () => {
      getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: WITHOUT_AUDIT });
      mockSupabase([AUDIT_ROW]);

      const result = await getAdminDashboardSnapshot();

      expect(result.error).toBeNull();
      expect(result.data?.recentActivityUnavailable).toBe(true);
      expect(result.data?.recentActivity).toEqual([]);
    });

    it('never issues the audit_logs query it knows RLS will deny', async () => {
      getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: WITHOUT_AUDIT });
      mockSupabase([AUDIT_ROW]);

      await getAdminDashboardSnapshot();

      expect(tablesQueried).not.toContain('audit_logs');
    });

    it('returns the activity list unchanged, and unflagged, for a permitted role', async () => {
      getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: WITH_AUDIT });
      mockSupabase([AUDIT_ROW]);

      const result = await getAdminDashboardSnapshot();

      expect(result.data?.recentActivityUnavailable).toBe(false);
      expect(result.data?.recentActivity).toHaveLength(1);
      expect(result.data?.recentActivity[0]?.id).toBe('log-1');
      expect(tablesQueried).toContain('audit_logs');
    });

    it('does not blame the viewer when a permitted role simply has no activity', async () => {
      getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: WITH_AUDIT });
      mockSupabase([]);

      const result = await getAdminDashboardSnapshot();

      expect(result.data?.recentActivity).toEqual([]);
      expect(result.data?.recentActivityUnavailable).toBe(false);
    });
  });

  describe('getEnhancedDashboardStats', () => {
    it('carries the same flag as the snapshot entry point', async () => {
      getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: WITHOUT_AUDIT });
      mockSupabase([AUDIT_ROW]);

      const result = await getEnhancedDashboardStats();

      expect(result.data?.recentActivityUnavailable).toBe(true);
      expect(result.data?.recentActivity).toEqual([]);
      expect(tablesQueried).not.toContain('audit_logs');
    });
  });

  describe('getDashboardRecentActivity', () => {
    it('reports the denial explicitly rather than as an empty list', async () => {
      getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: WITHOUT_AUDIT });
      mockSupabase([AUDIT_ROW]);

      const result = await getDashboardRecentActivity();

      expect(result.error).toBeNull();
      expect(result.data).toEqual({ items: [], permissionDenied: true });
    });

    it('reports items with permissionDenied false for a permitted role', async () => {
      getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: WITH_AUDIT });
      mockSupabase([AUDIT_ROW]);

      const result = await getDashboardRecentActivity();

      expect(result.data?.permissionDenied).toBe(false);
      expect(result.data?.items).toHaveLength(1);
    });
  });

  it('gates on settings.view_audit_logs specifically, not some other permission', async () => {
    // Holding every other permission in the constant table must not be enough.
    const everythingElse = Object.values(PERMISSIONS).filter(
      (p) => p !== PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS
    );
    getCurrentUserPermissions.mockResolvedValue({ userId: 'user-1', permissions: everythingElse });
    mockSupabase([AUDIT_ROW]);

    const result = await getDashboardRecentActivity();

    expect(result.data).toEqual({ items: [], permissionDenied: true });
  });
});
