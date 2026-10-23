import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('resident role view migration (static)', () => {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const sql = readFileSync(path.join(root, 'supabase/migrations/20261101090000_resident_role_view_and_groups.sql'), 'utf8')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').replace(/\s+/g, ' ');

  it('keeps only active, not-moved-out house links', () => {
    expect(sql).toContain('WHERE rh.is_active AND (rh.move_out_date IS NULL OR rh.move_out_date > CURRENT_DATE)');
  });

  it('revokes anon and authenticated on the view and the table', () => {
    expect(sql).toContain('REVOKE ALL ON public.resident_role_memberships FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON public.resident_role_groups FROM PUBLIC, anon, authenticated;');
  });

  it('never puts co_resident in a seeded group', () => {
    expect(sql).not.toMatch(/ARRAY\[[^\]]*co_resident/);
  });

  it('seeds the permission the action checks', () => {
    expect(sql).toContain(`'${PERMISSIONS.RESIDENTS_VIEW_GROUPS}'`);
  });
});
