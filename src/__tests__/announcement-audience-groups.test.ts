import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizePermission: vi.fn(), createAdminClient: vi.fn(), addToQueue: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient, createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/notifications/queue', async (importOriginal) => ({ ...(await importOriginal<object>()), addToQueue: mocks.addToQueue }));

import { getAnnouncementAudienceGroups, getAnnouncementReach } from '@/actions/announcements/audience-reach';
import { enumAudienceForRoles, resolveGroupReach, type GroupDb } from '@/lib/announcements/audience-groups';
import { publishAnnouncementCore } from '@/lib/announcements/publish';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const LANDLORDS = { slug: 'landlords', name: 'Landlords', roles: ['resident_landlord', 'non_resident_landlord'] };

type Tables = {
  groups?: unknown[];
  memberships?: { resident_id: string; role: string }[];
  residents?: { id: string; account_status: string }[];
  optins?: { resident_id: string; phone_number: string; opted_in?: boolean }[];
};

/** Query-builder double that applies the filters the code under test uses. */
function db(t: Tables) {
  const calls: { table: string; filters: [string, string, unknown][] }[] = [];
  const from = (table: string) => {
    const call = { table, filters: [] as [string, string, unknown][] };
    calls.push(call);
    const rows = () => {
      let r: Record<string, unknown>[] =
        table === 'resident_role_groups' ? (t.groups ?? []) as Record<string, unknown>[] :
        table === 'resident_role_memberships' ? (t.memberships ?? []) :
        table === 'residents' ? (t.residents ?? []) : (t.optins ?? []);
      for (const [op, col, v] of call.filters) {
        if (op === 'eq') r = r.filter((x) => x[col] === v);
        if (op === 'in') r = r.filter((x) => (v as unknown[]).includes(x[col]));
      }
      return r;
    };
    const q: Record<string, unknown> = {};
    q.then = (f: (v: unknown) => unknown) => Promise.resolve({ data: rows(), error: null }).then(f);
    for (const m of ['select', 'order', 'range', 'is']) q[m] = () => q;
    q.eq = (c: string, v: unknown) => (call.filters.push(['eq', c, v]), q);
    q.in = (c: string, v: unknown[]) => (call.filters.push(['in', c, v]), q);
    return q;
  };
  return { from, calls } as unknown as GroupDb & { calls: typeof calls };
}

describe('resolveGroupReach (#1095)', () => {
  it('counts a person in two of the group roles once, and counts only active residents', async () => {
    const res = await resolveGroupReach(
      db({
        groups: [LANDLORDS],
        memberships: [
          { resident_id: 'a', role: 'resident_landlord' },
          { resident_id: 'a', role: 'non_resident_landlord' },
          { resident_id: 'b', role: 'non_resident_landlord' },
          { resident_id: 'c', role: 'non_resident_landlord' },
          { resident_id: 't', role: 'tenant' },
        ],
        residents: [
          { id: 'a', account_status: 'active' },
          { id: 'b', account_status: 'active' },
          { id: 'c', account_status: 'archived' },
        ],
        optins: [
          { resident_id: 'a', phone_number: '+1', opted_in: true },
          { resident_id: 'a', phone_number: '+1b', opted_in: true }, // second row for the same person
          { resident_id: 'c', phone_number: '+3', opted_in: true }, // inactive account
          { resident_id: 'b', phone_number: '+2', opted_in: false }, // opted out
          { resident_id: 't', phone_number: '+4', opted_in: true }, // not in the group
        ],
      }),
      'landlords'
    );
    expect(res).toMatchObject({ error: null, reach: 2, optedIn: 1 });
    if (res.error === null) expect([...res.optIns.keys()]).toEqual(['a']);
  });

  it('reports an unknown group instead of reaching everyone', async () => {
    const res = await resolveGroupReach(db({ groups: [] }), 'gone');
    expect(res.error).toMatch(/not found/);
  });
});

describe('enumAudienceForRoles', () => {
  it('maps to an enum value no wider than the group', () => {
    expect(enumAudienceForRoles(['non_resident_landlord'])).toBe('owners');
    expect(enumAudienceForRoles(['resident_landlord', 'non_resident_landlord'])).toBe('owners');
    expect(enumAudienceForRoles(['tenant'])).toBe('tenants');
    expect(enumAudienceForRoles(['tenant', 'resident_landlord'])).toBe('residents');
  });
});

describe('audience actions (#1095)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuse without the announcements.view permission and never touch the database', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    expect(await getAnnouncementReach('landlords')).toEqual({ data: null, error: 'nope' });
    expect((await getAnnouncementAudienceGroups()).data).toBeNull();
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.ANNOUNCEMENTS_VIEW);
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('return the reach and the opt-in count', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true });
    mocks.createAdminClient.mockReturnValue(
      db({
        groups: [LANDLORDS],
        memberships: [{ resident_id: 'a', role: 'resident_landlord' }, { resident_id: 'b', role: 'non_resident_landlord' }],
        residents: [{ id: 'a', account_status: 'active' }, { id: 'b', account_status: 'active' }],
        optins: [{ resident_id: 'b', phone_number: '+2', opted_in: true }],
      })
    );
    expect(await getAnnouncementReach('landlords')).toEqual({ data: { reach: 2, optedIn: 1 }, error: null });
  });
});

describe('publish to a group audience (#1095)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.addToQueue.mockResolvedValue({ success: true });
  });

  it('queues one WhatsApp message for each opted-in group member', async () => {
    const base = db({
      groups: [LANDLORDS],
      memberships: [
        { resident_id: 'a', role: 'resident_landlord' },
        { resident_id: 'a', role: 'non_resident_landlord' },
        { resident_id: 'b', role: 'non_resident_landlord' },
      ],
      residents: [{ id: 'a', account_status: 'active' }, { id: 'b', account_status: 'active' }],
      optins: [{ resident_id: 'a', phone_number: '+1', opted_in: true }],
    }) as unknown as { from: (t: string) => unknown };
    const announcement = { id: 'x', title: 'T', content: 'C', summary: null, target_audience: 'owners', target_group_slug: 'landlords', target_houses: null, status: 'draft' };
    const client = {
      from: (table: string) => {
        if (table !== 'announcements') return base.from(table);
        const q: Record<string, unknown> = {};
        for (const m of ['select', 'update', 'eq']) q[m] = () => q;
        q.single = vi.fn().mockResolvedValueOnce({ data: announcement, error: null }).mockResolvedValue({ data: { ...announcement, status: 'published' }, error: null });
        return q;
      },
    };

    const res = await publishAnnouncementCore(client as never, 'x', null);

    expect(res.error).toBeNull();
    expect(mocks.addToQueue).toHaveBeenCalledTimes(1);
    expect(mocks.addToQueue.mock.calls[0][0]).toMatchObject({ recipient_id: 'a' });
  });
});
