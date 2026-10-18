/**
 * Issue #538 -- pruneSystemData removes system_action_log rows older than 90 days.
 * The admin client is a small in-memory table that applies the delete's filter, so the
 * test proves which rows go and which stay rather than only that a delete was issued.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subDays } from 'date-fns';
import { makeRecordingSupabase, uid } from '@/__tests__/helpers/recording-supabase';
import { pruneSystemData } from '@/actions/system/prune-data';

const { authorizePermission, createServerSupabaseClient, createAdminClient, logAudit, table } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  logAudit: vi.fn(),
  table: { rows: [] as { id: string; occurred_at: string }[], error: null as { message: string } | null },
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

function fakeAdminClient() {
  return {
    from(name: string) {
      if (name !== 'system_action_log') throw new Error(`unexpected admin table ${name}`);
      return {
        delete: (opts: { count?: string }) => ({
          lt: async (column: string, value: string) => {
            if (table.error) return { count: null, error: table.error };
            const before = table.rows.length;
            table.rows = table.rows.filter((r) => !(r[column as 'occurred_at'] < value));
            return { count: opts.count === 'exact' ? before - table.rows.length : null, error: null };
          },
        }),
      };
    },
  };
}

const daysAgo = (n: number) => subDays(new Date(), n).toISOString();

beforeEach(() => {
  vi.clearAllMocks();
  table.rows = [];
  table.error = null;
  authorizePermission.mockResolvedValue({ authorized: true, userId: uid(900), roleName: 'super_admin' });
  createServerSupabaseClient.mockImplementation(async () => makeRecordingSupabase({ results: {}, calls: [] }));
  createAdminClient.mockImplementation(() => fakeAdminClient());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('pruneSystemData: system action log (#538)', () => {
  it('deletes rows older than 90 days, keeps newer ones, and reports the count', async () => {
    table.rows = [
      { id: 'old-1', occurred_at: daysAgo(200) },
      { id: 'old-2', occurred_at: daysAgo(91) },
      { id: 'new-1', occurred_at: daysAgo(89) },
      { id: 'new-2', occurred_at: daysAgo(1) },
    ];

    const result = await pruneSystemData();

    expect(result.error).toBeNull();
    expect(result.data?.systemActionLogs).toBe(2);
    expect(table.rows.map((r) => r.id)).toEqual(['new-1', 'new-2']);
    expect(logAudit).toHaveBeenCalledTimes(1);
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DELETE',
      description: expect.stringContaining('2 system action log entries'),
    }));
  });

  it('reports zero and does not audit when no row is past the window', async () => {
    table.rows = [{ id: 'new-1', occurred_at: daysAgo(30) }];

    const result = await pruneSystemData();

    expect(result.data?.systemActionLogs).toBe(0);
    expect(table.rows).toHaveLength(1);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('returns the error when the delete fails', async () => {
    table.error = { message: 'permission denied' };

    const result = await pruneSystemData();

    expect(result.data).toBeNull();
    expect(result.error).toBe('Failed to prune system action log: permission denied');
  });

  it('throws before touching the table when unauthorized', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    table.rows = [{ id: 'old-1', occurred_at: daysAgo(200) }];

    await expect(pruneSystemData()).rejects.toThrow('Unauthorized');
    expect(table.rows).toHaveLength(1);
  });
});
