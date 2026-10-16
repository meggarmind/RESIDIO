import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createServerSupabaseClient, authorizePermission } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  authorizePermission: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));

import { getSystemActionLog } from '@/actions/system/action-log';
import { PERMISSIONS, ROUTE_PERMISSIONS } from '@/lib/auth/action-roles';
import { ADMIN_NAV_SECTIONS } from '@/config/navigation';

/** A chainable, awaitable stand-in for the PostgREST query builder. */
function makeBuilder(result: { data: unknown[] | null; count: number | null; error: unknown }) {
  const calls: Array<[string, unknown[]]> = [];
  const builder: Record<string, unknown> = {
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  for (const m of ['select', 'order', 'range', 'eq', 'ilike', 'gte', 'lte']) {
    builder[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return builder;
    };
  }
  const from = vi.fn(() => builder);
  createServerSupabaseClient.mockResolvedValue({ from });
  return { calls, from };
}

const callsOf = (calls: Array<[string, unknown[]]>, name: string) =>
  calls.filter(([m]) => m === name).map(([, a]) => a);

describe('getSystemActionLog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizePermission.mockResolvedValue({ authorized: true });
  });

  it('denies without the permission and never queries', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });

    const result = await getSystemActionLog();

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.SYSTEM_VIEW_SYSTEM_LOG);
    expect(result).toEqual({ data: null, error: 'Forbidden' });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns newest-first rows, paginated, with total', async () => {
    const row = { id: '1', source: 'cron:x', action: 'run', outcome: 'success' };
    const { calls, from } = makeBuilder({ data: [row], count: 60, error: null });

    const result = await getSystemActionLog({ page: 3, limit: 10 });

    expect(from).toHaveBeenCalledWith('system_action_log');
    expect(callsOf(calls, 'order')).toEqual([['occurred_at', { ascending: false }]]);
    expect(callsOf(calls, 'range')).toEqual([[20, 29]]);
    expect(result.error).toBeNull();
    expect(result.data).toEqual({ data: [row], total: 60, page: 3, limit: 10 });
  });

  it('applies source, outcome and date filters', async () => {
    const { calls } = makeBuilder({ data: [], count: 0, error: null });

    await getSystemActionLog({
      source: 'cron:100%_a',
      outcome: 'failure',
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-02T00:00:00.000Z',
    });

    expect(callsOf(calls, 'ilike')).toEqual([['source', '%cron:100\\%\\_a%']]);
    expect(callsOf(calls, 'eq')).toEqual([['outcome', 'failure']]);
    expect(callsOf(calls, 'gte')).toEqual([['occurred_at', '2026-10-01T00:00:00.000Z']]);
    expect(callsOf(calls, 'lte')).toEqual([['occurred_at', '2026-10-02T00:00:00.000Z']]);
  });

  it('ignores an unknown outcome and clamps the page size', async () => {
    const { calls } = makeBuilder({ data: [], count: 0, error: null });

    await getSystemActionLog({ outcome: 'bogus' as never, limit: 5000, page: -2 });

    expect(callsOf(calls, 'eq')).toEqual([]);
    expect(callsOf(calls, 'range')).toEqual([[0, 99]]);
  });

  it('escapes a backslash in the source filter', async () => {
    const { calls } = makeBuilder({ data: [], count: 0, error: null });

    await getSystemActionLog({ source: 'a\\b' });

    expect(callsOf(calls, 'ilike')).toEqual([['source', '%a\\\\b%']]);
  });

  it('trims whitespace around the source filter and skips a blank one', async () => {
    const first = makeBuilder({ data: [], count: 0, error: null });
    await getSystemActionLog({ source: '  cron:x  ' });
    expect(callsOf(first.calls, 'ilike')).toEqual([['source', '%cron:x%']]);

    const second = makeBuilder({ data: [], count: 0, error: null });
    await getSystemActionLog({ source: '   ' });
    expect(callsOf(second.calls, 'ilike')).toEqual([]);
  });

  it.each([0, -5])('raises a page size of %i to 1', async (limit) => {
    const { calls } = makeBuilder({ data: [], count: 0, error: null });

    const result = await getSystemActionLog({ limit });

    expect(callsOf(calls, 'range')).toEqual([[0, 0]]);
    expect(result.data?.limit).toBe(1);
  });

  it('surfaces a query error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    makeBuilder({ data: null, count: null, error: { message: 'boom' } });

    expect(await getSystemActionLog()).toEqual({ data: null, error: 'boom' });
  });
});

describe('system action log gating', () => {
  it('maps the route to the view_system_log permission only', () => {
    expect(ROUTE_PERMISSIONS['/system/action-log']).toEqual([PERMISSIONS.SYSTEM_VIEW_SYSTEM_LOG]);
  });

  it('gates the nav item on the same permission', () => {
    const items = ADMIN_NAV_SECTIONS.flatMap((s) => s.items);
    const item = items.find((i) => i.href === '/system/action-log');
    expect(item?.permissions).toEqual([PERMISSIONS.SYSTEM_VIEW_SYSTEM_LOG]);
  });
});
