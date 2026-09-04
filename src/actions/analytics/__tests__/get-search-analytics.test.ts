import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSearchAnalytics } from '@/actions/analytics/get-search-analytics';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

describe('getSearchAnalytics authorization', () => {
  beforeEach(() => {
    authorizePermission.mockReset();
    createServerSupabaseClient.mockReset();
  });

  it('rejects an unauthorized caller before querying search_logs', async () => {
    authorizePermission.mockResolvedValue({
      authorized: false,
      error: 'Unauthorized: Missing permission',
    });

    await expect(getSearchAnalytics('2026-01-01', '2026-12-31')).resolves.toEqual({
      data: null,
      error: 'Unauthorized: Missing permission',
    });

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('queries and aggregates search_logs for an authorized caller', async () => {
    authorizePermission.mockResolvedValue({ authorized: true });

    const limit = vi.fn().mockResolvedValue({
      data: [
        { query_text: 'billing', results_count: 3 },
        { query_text: 'Billing ', results_count: 3 },
        { query_text: 'foobar', results_count: 0 },
      ],
      error: null,
    });
    const lte = vi.fn().mockReturnValue({ limit });
    const gte = vi.fn().mockReturnValue({ lte });
    const select = vi.fn().mockReturnValue({ gte });
    const from = vi.fn().mockReturnValue({ select });
    createServerSupabaseClient.mockResolvedValue({ from });

    const result = await getSearchAnalytics('2026-01-01', '2026-12-31');

    expect(from).toHaveBeenCalledWith('search_logs');
    expect(select).toHaveBeenCalledWith('query_text, results_count');
    expect(gte).toHaveBeenCalledWith('created_at', '2026-01-01');
    expect(lte).toHaveBeenCalledWith('created_at', '2026-12-31');
    expect(result.error).toBeNull();
    expect(result.data?.topSearches).toEqual([
      { query_text: 'billing', count: 2 },
      { query_text: 'foobar', count: 1 },
    ]);
    expect(result.data?.zeroResultSearches).toEqual([{ query_text: 'foobar', count: 1 }]);
  });
});
