import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAdminDashboardSnapshot } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { ADMIN_DASHBOARD_SNAPSHOT_QUERY_KEY } from '@/hooks/use-dashboard';

const { authorizePermission, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

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
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
