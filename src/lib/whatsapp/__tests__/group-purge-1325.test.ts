import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { purgeUnmatchedGroupMembers } from '@/lib/whatsapp/group-sync';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: vi.fn() }));

const NOW = Date.parse('2026-10-29T00:00:00.000Z');

function fakeDelete(result: { count: number | null; error: unknown }) {
  const calls: Array<[string, ...unknown[]]> = [];
  const query: Record<string, unknown> = {};
  query.delete = (...args: unknown[]) => (calls.push(['delete', ...args]), query);
  query.is = (...args: unknown[]) => (calls.push(['is', ...args]), query);
  query.lt = (...args: unknown[]) => (calls.push(['lt', ...args]), query);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result));
  vi.mocked(createAdminClient).mockReturnValue({ from: (table: string) => (calls.push(['from', table]), query) } as never);
  return calls;
}

describe('purgeUnmatchedGroupMembers (#1325)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('deletes only rows with no resident whose last_seen_at is older than the window', async () => {
    const calls = fakeDelete({ count: 3, error: null });

    expect(await purgeUnmatchedGroupMembers(30)).toBe(3);
    expect(calls).toContainEqual(['from', 'whatsapp_group_members']);
    expect(calls).toContainEqual(['is', 'resident_id', null]);
    expect(calls).toContainEqual(['lt', 'last_seen_at', new Date(NOW - 30 * 86_400_000).toISOString()]);
  });

  it('throws the database error', async () => {
    fakeDelete({ count: null, error: new Error('db down') });
    await expect(purgeUnmatchedGroupMembers(30)).rejects.toThrow('db down');
  });
});

describe('createSupabaseGroupMemberStore.markLeft (#1325)', () => {
  it('updates only active rows, first by member id and then by phone, and returns each changed row once', async () => {
    const { createSupabaseGroupMemberStore } = await import('@/lib/whatsapp/group-sync');
    const calls: Array<[string, ...unknown[]]> = [];
    const answers = [
      [{ group_id: 'g@g.us', member_id: 'a@c.us', phone: '+1', resident_id: 'r1' }],
      [
        { group_id: 'g@g.us', member_id: 'a@c.us', phone: '+1', resident_id: 'r1' },
        { group_id: 'g@g.us', member_id: 'b@lid', phone: '+2', resident_id: null },
      ],
    ];
    const query: Record<string, unknown> = {};
    for (const method of ['update', 'eq', 'is', 'in', 'select']) {
      query[method] = (...args: unknown[]) => (calls.push([method, ...args]), query);
    }
    query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data: answers.shift(), error: null }));
    vi.mocked(createAdminClient).mockReturnValue({ from: () => query } as never);

    const left = await createSupabaseGroupMemberStore().markLeft('g@g.us', { memberIds: ['a@c.us'], phones: ['+1', '+2'] }, 'T');

    expect(left.map((m) => m.member_id).sort()).toEqual(['a@c.us', 'b@lid']);
    expect(calls).toContainEqual(['in', 'member_id', ['a@c.us']]);
    expect(calls).toContainEqual(['in', 'phone', ['+1', '+2']]);
    expect(calls.filter((c) => c[0] === 'is' && c[1] === 'left_at' && c[2] === null)).toHaveLength(2);
    expect(calls).toContainEqual(['update', { left_at: 'T', updated_at: 'T' }]);
  });
});
