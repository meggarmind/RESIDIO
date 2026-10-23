import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { loadSchema } from '@/__tests__/helpers/pglite-schema';

const mocks = vi.hoisted(() => ({ authorizePermission: vi.fn(), createAdminClient: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient }));

import { getResidentRoleCounts } from '@/actions/groups/resident-role-counts';
import { countResidentRoles } from '@/lib/groups/resident-role-counts';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const LANDLORDS = { slug: 'landlords', name: 'Landlords', roles: ['resident_landlord', 'non_resident_landlord'] };
const TENANTS = { slug: 'tenants', name: 'Tenants', roles: ['tenant'] };

describe('countResidentRoles (#1094)', () => {
  const rows = [
    { resident_id: 'a', role: 'resident_landlord' },
    { resident_id: 'a', role: 'non_resident_landlord' }, // both landlord roles: one landlord
    { resident_id: 'b', role: 'tenant' },
    { resident_id: 'c', role: 'co_resident' },
  ];

  it('counts a person in every role they hold', () => {
    const { roles } = countResidentRoles(rows, []);
    expect(roles).toContainEqual({ role: 'resident_landlord', count: 1 });
    expect(roles).toContainEqual({ role: 'non_resident_landlord', count: 1 });
  });

  it('counts a person once in a group that lists two of their roles', () => {
    const { groups } = countResidentRoles(rows, [LANDLORDS]);
    expect(groups[0].count).toBe(1);
  });

  it('does not count a co-resident as a landlord or tenant', () => {
    const { groups, roles } = countResidentRoles(rows, [LANDLORDS, TENANTS]);
    expect(groups.map((g) => g.count)).toEqual([1, 1]);
    expect(roles).toContainEqual({ role: 'co_resident', count: 1 });
  });

  it('returns 0 for a group with no members', () => {
    expect(countResidentRoles([], [TENANTS]).groups[0].count).toBe(0);
  });
});

describe('getResidentRoleCounts (#1094)', () => {
  beforeEach(() => vi.clearAllMocks());

  function stubDb(memberships: unknown[]) {
    mocks.createAdminClient.mockReturnValue({
      from: (table: string) => {
        if (table === 'resident_role_groups') {
          return { select: () => ({ order: () => Promise.resolve({ data: [TENANTS], error: null }) }) };
        }
        const chain: Record<string, unknown> = { select: () => chain, order: () => chain, range: () => Promise.resolve({ data: memberships, error: null }) };
        return chain;
      },
    });
  }

  it('checks residents.view_groups and reads nothing when denied', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
    const res = await getResidentRoleCounts();
    expect(mocks.authorizePermission).toHaveBeenCalledWith(PERMISSIONS.RESIDENTS_VIEW_GROUPS);
    expect(res).toEqual({ data: null, error: 'Unauthorized' });
    expect(mocks.createAdminClient).not.toHaveBeenCalled();
  });

  it('returns role and group counts when allowed', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: true });
    stubDb([{ resident_id: 'b', role: 'tenant' }]);
    const res = await getResidentRoleCounts();
    expect(res.error).toBeNull();
    expect(res.data?.groups[0]).toMatchObject({ slug: 'tenants', count: 1 });
  });
});

describe('resident role view migration, run for real (#1094)', () => {
  let db: PGlite;
  const q = async (sql: string, params: unknown[] = []) => (await db.query<Record<string, any>>(sql, params)).rows; // eslint-disable-line @typescript-eslint/no-explicit-any
  const ids: Record<string, string> = {};

  beforeAll(async () => {
    db = await loadSchema(['20261101090000_resident_role_view_and_groups.sql']);
    await db.exec(`INSERT INTO public.streets (name) VALUES ('Test Street')`);
    const mk = async (key: string, n: number) => {
      ids[key] = (await q(
        `INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ($1, $1, $2) RETURNING id`,
        [key, `+2340000000${n}`]
      ))[0].id;
    };
    const houses: string[] = [];
    for (let i = 0; i < 4; i++) {
      houses.push((await q(
        `INSERT INTO public.houses (house_number, street_id, short_name) SELECT $1, id, $1 FROM public.streets LIMIT 1 RETURNING id`,
        [`H${i}`]
      ))[0].id);
    }
    const link = (key: string, h: number, role: string, active = true, moveOut: string | null = null) =>
      q(
        `INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active, move_in_date, move_out_date) VALUES ($1, $2, $3, $4, '1999-01-01', $5)`,
        [ids[key], houses[h], role, active, moveOut]
      );
    await mk('multi', 1);
    await mk('cores', 2);
    await mk('gone', 3);
    await mk('inactive', 4);
    await link('multi', 0, 'non_resident_landlord');
    await link('multi', 1, 'non_resident_landlord');
    await link('multi', 2, 'tenant');
    await link('cores', 0, 'co_resident');
    await link('gone', 3, 'tenant', true, '2000-01-01');
    await link('inactive', 3, 'tenant', false);
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  it('lists a person once per role, with the house count, and drops moved-out and inactive links', async () => {
    const rows = await q(`SELECT resident_id, role, house_count FROM public.resident_role_memberships ORDER BY role::text`);
    expect(rows.map((r) => [r.resident_id, r.role, r.house_count])).toEqual([
      [ids.cores, 'co_resident', 1],
      [ids.multi, 'non_resident_landlord', 2],
      [ids.multi, 'tenant', 1],
    ]);
  });

  it('seeds groups that never include co_resident', async () => {
    const groups = await q(`SELECT slug, roles::text AS roles FROM public.resident_role_groups`);
    expect(groups.map((g) => g.slug).sort()).toEqual(['landlords', 'non_resident_landlords', 'owner_occupiers', 'tenants']);
    expect(groups.some((g) => g.roles.includes('co_resident'))).toBe(false);
  });

  it('is unreadable to anon and authenticated, readable to service_role', async () => {
    for (const rel of ['resident_role_memberships', 'resident_role_groups']) {
      const [p] = await q(
        `SELECT has_table_privilege('anon', $1, 'SELECT') AS anon, has_table_privilege('authenticated', $1, 'SELECT') AS auth, has_table_privilege('service_role', $1, 'SELECT') AS svc`,
        [`public.${rel}`]
      );
      expect(p).toEqual({ anon: false, auth: false, svc: true });
    }
  });

  it('seeds the permission the action checks', async () => {
    const rows = await q(`SELECT 1 FROM public.app_permissions WHERE name = $1`, [PERMISSIONS.RESIDENTS_VIEW_GROUPS]);
    expect(rows).toHaveLength(1);
  });
});
