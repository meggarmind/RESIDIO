import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';
import { getSettingValueAsService } from '@/lib/settings/service';
import { getUnmatchedGroupMembers } from '../group-members-report';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: vi.fn() }));

const authorized = { authorized: true, userId: 'u1', role: null, roleName: null, roleId: null, permissions: [], error: null };
const denied = { authorized: false, userId: 'u', role: null, roleName: null, roleId: null, permissions: [], error: 'Forbidden' };

type Call = { select: unknown[]; filters: unknown[][] };

/** Records each query's filters and answers the unmatched list and the matched count. */
function fakeClient(rows: unknown[], matched: number, error: unknown = null) {
  const calls: Call[] = [];
  const from = vi.fn(() => {
    const call: Call = { select: [], filters: [] };
    calls.push(call);
    const builder: Record<string, unknown> = {};
    for (const name of ['eq', 'is', 'not']) builder[name] = (...args: unknown[]) => (call.filters.push([name, ...args]), builder);
    builder.select = (...args: unknown[]) => ((call.select = args), builder);
    builder.order = () => builder;
    builder.then = (resolve: (value: unknown) => unknown) =>
      resolve(call.select[1] ? { data: null, count: matched, error } : { data: rows, count: null, error });
    return builder;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { calls, from };
}

function settings(values: Record<string, unknown>) {
  vi.mocked(getSettingValueAsService).mockImplementation(async (key: string) => (values[key] ?? null) as never);
}

describe('getUnmatchedGroupMembers (#1327)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    settings({ whatsapp_estate_group_id: '1203@g.us' });
  });

  it('needs whatsapp.manage and reads nothing without it', async () => {
    vi.mocked(authorizePermission).mockResolvedValue(denied as never);
    const client = fakeClient([], 0);

    expect(await getUnmatchedGroupMembers()).toEqual({ success: false, data: null, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.WHATSAPP_MANAGE);
    expect(client.from).not.toHaveBeenCalled();
    expect(getSettingValueAsService).not.toHaveBeenCalled();
  });

  it('lists only current members of the chosen group with no resident, and counts matched ones the same way', async () => {
    const client = fakeClient(
      [{ id: 'm1', phone: '+2348031234567', role: 'admin', joined_at: '2026-10-01T10:00:00Z', last_seen_at: '2026-10-29T01:00:00Z' }],
      41,
    );

    const result = await getUnmatchedGroupMembers();

    expect(result.data).toEqual({
      groupChosen: true,
      matchedCount: 41,
      retentionDays: 30,
      unmatched: [{ id: 'm1', phone: '+2348031234567', role: 'admin', firstSeen: '2026-10-01T10:00:00Z', lastSeen: '2026-10-29T01:00:00Z' }],
    });
    const [unmatchedQuery, matchedQuery] = client.calls;
    for (const query of client.calls) {
      expect(client.from).toHaveBeenCalledWith('whatsapp_group_members');
      expect(query.filters).toContainEqual(['eq', 'group_id', '1203@g.us']);
      expect(query.filters).toContainEqual(['is', 'left_at', null]);
    }
    expect(unmatchedQuery.filters).toContainEqual(['is', 'resident_id', null]);
    expect(matchedQuery.filters).toContainEqual(['not', 'resident_id', 'is', null]);
  });

  it('keeps a member whose number WAHA has not resolved', async () => {
    fakeClient([{ id: 'm2', phone: null, role: 'participant', joined_at: '2026-10-02T00:00:00Z', last_seen_at: '2026-10-02T00:00:00Z' }], 0);

    expect((await getUnmatchedGroupMembers()).data?.unmatched).toMatchObject([{ id: 'm2', phone: null }]);
  });

  it('reads the retention days from the setting', async () => {
    settings({ whatsapp_estate_group_id: '1203@g.us', whatsapp_group_unmatched_retention_days: 14 });
    fakeClient([], 0);

    expect((await getUnmatchedGroupMembers()).data?.retentionDays).toBe(14);
  });

  it('shows nothing and reads no members while no group is chosen', async () => {
    settings({});
    const client = fakeClient([], 0);

    expect((await getUnmatchedGroupMembers()).data).toEqual({ groupChosen: false, matchedCount: 0, unmatched: [], retentionDays: 30 });
    expect(client.from).not.toHaveBeenCalled();
  });

  it('returns an error, not an empty list, when the read fails', async () => {
    fakeClient([], 0, { message: 'boom' });
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(await getUnmatchedGroupMembers()).toEqual({ success: false, data: null, error: 'Failed to load the estate group members' });
  });
});
