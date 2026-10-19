/**
 * Issue #538 -- pruneSystemData removes system_action_log rows older than 90 days.
 * Issue #815 -- it removes audit_logs older than audit_log_retention_days, and the preview
 * counts exactly what the delete removes.
 * The admin client is a small in-memory store that applies each query's filter, so the
 * tests prove which rows go and which stay rather than only that a delete was issued.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { subDays } from 'date-fns';
import { makeRecordingSupabase, uid } from '@/__tests__/helpers/recording-supabase';
import { previewPruneSystemData, pruneSystemData } from '@/actions/system/prune-data';

const { authorizePermission, createServerSupabaseClient, createAdminClient, logAudit, readSetting, table, audit } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  logAudit: vi.fn(),
  readSetting: vi.fn(),
  table: { rows: [] as { id: string; occurred_at: string }[], error: null as { message: string } | null },
  audit: { rows: [] as { id: string; created_at: string }[] },
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient, createAdminClient }));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ readSetting }));

function fakeAdminClient() {
  return {
    from(name: string) {
      if (name !== 'system_action_log' && name !== 'audit_logs') throw new Error(`unexpected admin table ${name}`);
      const store = (name === 'system_action_log' ? table : audit) as { rows: Record<string, string>[] };
      const failure = name === 'system_action_log' ? table.error : null;
      return {
        select: () => ({
          lt: async (column: string, value: string) =>
            failure ? { count: null, error: failure } : { count: store.rows.filter((r) => r[column] < value).length, error: null },
        }),
        delete: (opts: { count?: string }) => ({
          lt: async (column: string, value: string) => {
            if (failure) return { count: null, error: failure };
            const before = store.rows.length;
            store.rows = store.rows.filter((r) => !(r[column] < value));
            return { count: opts.count === 'exact' ? before - store.rows.length : null, error: null };
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
  audit.rows = [];
  readSetting.mockResolvedValue({ status: 'absent' });
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


// A server client whose in_app_notifications rejects any filter column the table lacks, as
// PostgREST does, and records the filters it was given (#807).
function notificationsClient(filters: string[]) {
  const columns = new Set(['id', 'created_at', 'is_read', 'read_at', 'recipient_id']);
  return {
    from(name: string) {
      let badColumn: string | null = null;
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.delete = () => chain;
      chain.eq = (column: string, value: unknown) => {
        if (name === 'in_app_notifications') filters.push(`${column}=${String(value)}`);
        if (!columns.has(column)) badColumn = column;
        return chain;
      };
      chain.lt = () => chain;
      chain.then = (resolve: (v: unknown) => unknown) =>
        resolve(badColumn
          ? { count: null, error: { message: `column ${name}.${badColumn} does not exist` } }
          : { count: 0, error: null });
      return chain;
    },
  };
}

describe('prune data: in_app_notifications read filter (#807)', () => {
  it('pruneSystemData filters notifications on is_read', async () => {
    const filters: string[] = [];
    createServerSupabaseClient.mockImplementation(async () => notificationsClient(filters));

    const result = await pruneSystemData();

    expect(result.error).toBeNull();
    expect(filters).toEqual(['is_read=true', 'is_read=false']);
  });

  it('previewPruneSystemData filters notifications on is_read', async () => {
    const filters: string[] = [];
    createServerSupabaseClient.mockImplementation(async () => notificationsClient(filters));
    createAdminClient.mockImplementation(() => notificationsClient([]));

    const result = await previewPruneSystemData();

    expect(result.error).toBeNull();
    expect(filters).toEqual(['is_read=true', 'is_read=false']);
  });
});


describe('prune data: audit logs follow audit_log_retention_days (#815)', () => {
  // Rows a minute either side of the cutoff, so the boundary is tested without racing the clock.
  const nearCutoff = (days: number, minutes: number) => new Date(subDays(new Date(), days).getTime() + minutes * 60_000).toISOString();

  it('deletes audit logs older than the saved retention and keeps newer ones', async () => {
    readSetting.mockResolvedValue({ status: 'ok', value: 60 });
    audit.rows = [
      { id: 'old-1', created_at: daysAgo(400) },
      { id: 'old-2', created_at: nearCutoff(60, -1) },
      { id: 'new-1', created_at: nearCutoff(60, 1) },
      { id: 'new-2', created_at: daysAgo(1) },
    ];

    const result = await pruneSystemData();

    expect(result.error).toBeNull();
    expect(result.data?.auditLogs).toBe(2);
    expect(result.data?.auditLogRetentionDays).toBe(60);
    expect(audit.rows.map((r) => r.id)).toEqual(['new-1', 'new-2']);
  });

  it('uses 365 days when the setting was never saved', async () => {
    audit.rows = [
      { id: 'old', created_at: nearCutoff(365, -1) },
      { id: 'new', created_at: nearCutoff(365, 1) },
    ];

    const result = await pruneSystemData();

    expect(result.data?.auditLogs).toBe(1);
    expect(audit.rows.map((r) => r.id)).toEqual(['new']);
  });

  it('the preview counts exactly the rows the prune then deletes', async () => {
    readSetting.mockResolvedValue({ status: 'ok', value: 90 });
    audit.rows = [
      { id: 'a', created_at: daysAgo(500) },
      { id: 'b', created_at: nearCutoff(90, -1) },
      { id: 'c', created_at: nearCutoff(90, 1) },
    ];
    table.rows = [{ id: 's-old', occurred_at: daysAgo(120) }, { id: 's-new', occurred_at: daysAgo(10) }];

    const preview = await previewPruneSystemData();
    const result = await pruneSystemData();

    expect(preview.data?.auditLogs).toBe(2);
    expect(preview.data?.auditLogRetentionDays).toBe(90);
    expect(result.data?.auditLogs).toBe(preview.data?.auditLogs);
    expect(result.data?.systemActionLogs).toBe(preview.data?.systemActionLogs);
  });

  it.each([0, 29, 3651, 45.5, 'abc', null])('refuses retention %s and deletes nothing', async (value) => {
    readSetting.mockResolvedValue({ status: 'ok', value });
    audit.rows = [{ id: 'old', created_at: daysAgo(4000) }];
    table.rows = [{ id: 's-old', occurred_at: daysAgo(200) }];

    const preview = await previewPruneSystemData();
    const result = await pruneSystemData();

    expect(preview.data).toBeNull();
    expect(preview.error).toMatch(/from 30 to 3650/);
    expect(result.data).toBeNull();
    expect(result.error).toMatch(/Nothing was deleted/);
    expect(audit.rows).toHaveLength(1);
    expect(table.rows).toHaveLength(1);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('deletes nothing when the setting cannot be read', async () => {
    readSetting.mockResolvedValue({ status: 'error', message: 'boom' });
    audit.rows = [{ id: 'old', created_at: daysAgo(4000) }];

    const result = await pruneSystemData();

    expect(result.error).toBe('Failed to read the audit log retention setting: boom');
    expect(audit.rows).toHaveLength(1);
  });
});
