import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #1316: role assignment for a Chairman (system.assign_roles only),
 * approval that links a resident before giving a resident-only role, the
 * "Who can hold each role" rules on assign and approve, and the rule editor's
 * input checks. Drives the actions against an in-memory fake of both Supabase
 * clients and asserts on the rows written, not on return values alone.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; op: string; values: unknown }>,
  /** Permissions the caller holds. */
  held: [] as string[],
  /** Fail the profiles update that sets role_id (the approval's second write). */
  failRoleWrite: false,
  /** Every .or() filter string sent, by table. */
  orFilters: [] as Array<{ table: string; filter: string }>,
}));

function fakeFrom(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let op: 'select' | 'update' | 'insert' | 'upsert' = 'select';
  let values: unknown = {};
  let ordered: Array<[string, boolean]> = [];

  const matching = () => {
    const rows = (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    for (const [col, asc] of [...ordered].reverse()) {
      rows.sort((a, b) => {
        const x = a[col] as never;
        const y = b[col] as never;
        return x === y ? 0 : (x > y ? 1 : -1) * (asc ? 1 : -1);
      });
    }
    return rows;
  };

  const run = () => {
    if (op === 'update') {
      const v = values as Row;
      if (table === 'profiles' && state.failRoleWrite && 'role_id' in v) {
        return { data: null, error: { code: 'XX000', message: 'boom' } };
      }
      state.writes.push({ table, op, values: v });
      const rows = matching();
      rows.forEach((r) => Object.assign(r, v));
      return { data: rows.map((r) => ({ ...r })), error: null };
    }
    if (op === 'upsert') {
      const saved: Row[] = [];
      for (const v of values as Row[]) {
        state.writes.push({ table, op, values: v });
        const rows = (state.tables[table] ??= []);
        const existing = rows.find(
          (r) => r.resident_role === v.resident_role && r.app_role_id === v.app_role_id
        );
        if (existing) {
          Object.assign(existing, v);
          saved.push(existing);
        } else {
          const row = { id: `rule-${rows.length + 1}`, ...v };
          rows.push(row);
          saved.push(row);
        }
      }
      return { data: saved.map((r) => ({ ...r })), error: null };
    }
    return { data: matching().map((r) => ({ ...r })), error: null };
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    update: (v: Row) => ((op = 'update'), (values = v), builder),
    upsert: (v: Row[]) => ((op = 'upsert'), (values = v), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), builder),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
    or: (f: string) => (state.orFilters.push({ table, filter: f }), builder),
    order: (c: string, o?: { ascending?: boolean }) => (ordered.push([c, o?.ascending !== false]), builder),
    limit: () => builder,
    single: async () => {
      const r = run();
      return r.error ? r : r.data?.[0] ? { data: r.data[0], error: null } : { data: null, error: { message: 'no rows' } };
    },
    maybeSingle: async () => {
      const r = run();
      return r.error ? r : { data: r.data?.[0] ?? null, error: null };
    },
    then: (resolve: (v: unknown) => unknown) => resolve(run()),
  };
  ordered = [];
  return builder;
}

const fakeClient = { from: fakeFrom };

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => fakeClient,
  createServerSupabaseClient: async () => fakeClient,
}));
vi.mock('@/lib/auth/authorize', () => {
  const result = (ok: boolean) => ({
    authorized: ok,
    userId: 'caller',
    roleName: 'chairman',
    roleId: 'r-caller',
    permissions: state.held,
    error: ok ? null : 'Unauthorized: missing permission',
  });
  return {
    authorizePermission: vi.fn(async (p: string) => result(state.held.includes(p))),
    authorizeAnyPermission: vi.fn(async (ps: string[]) => result(ps.some((p) => state.held.includes(p)))),
  };
});
const logAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/auth/account-guards', () => ({
  assertCanManageTarget: async () => ({ ok: true, targetRoleName: null, targetApprovalStatus: 'pending' }),
  assertCanGrantRoles: async () => ({ ok: true }),
}));
vi.mock('@/lib/auth/super-admin-invariant', () => ({
  isLastActiveSuperAdmin: async () => false,
  LAST_SUPER_ADMIN_ERROR: 'last super admin',
}));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { authorizeAnyPermission } from '@/lib/auth/authorize';
import { getAssignableRoles } from '@/actions/roles/assignable-roles';
import {
  assignRoleToProfile,
  searchProfilesForRoleAssignment,
  searchResidentsForRoleAssignment,
} from '@/actions/roles/assign-role';
import { approveAccount, rejectAccount } from '@/actions/auth/account-approval';
import {
  batchUpdateRoleAssignmentRules,
  checkRoleAssignmentAllowed,
} from '@/actions/roles/assignment-rules';

const ASSIGN = PERMISSIONS.SYSTEM_ASSIGN_ROLES;
const MANAGE = PERMISSIONS.SYSTEM_MANAGE_ROLES;

const TRUSTEE = '11111111-1111-4111-8111-111111111111';
const SECRETARY = '22222222-2222-4222-8222-222222222222';
const RETIRED = '33333333-3333-4333-8333-333333333333';
const TRUSTEE_TITLE = 'title-trustee';

const profileRow = (id: string) => state.tables.profiles.find((p) => p.id === id)!;
const residentRow = (id: string) => state.tables.residents.find((r) => r.id === id)!;
const writesTo = (table: string) => state.writes.filter((w) => w.table === table);

function seed() {
  state.writes = [];
  state.orFilters = [];
  state.held = [ASSIGN];
  state.failRoleWrite = false;
  logAudit.mockClear();
  vi.mocked(authorizeAnyPermission).mockClear();
  state.tables = {
    app_roles: [
      { id: TRUSTEE, name: 'trustee', display_name: 'Trustee', description: null, category: 'exco', is_active: true, requires_resident: true, requires_contact_verification: false },
      { id: SECRETARY, name: 'secretary', display_name: 'Secretary', description: null, category: 'exco', is_active: true, requires_resident: false, requires_contact_verification: false },
      { id: RETIRED, name: 'retired', display_name: 'Retired', description: null, category: 'exco', is_active: false, requires_resident: false, requires_contact_verification: false },
    ],
    admin_titles: [
      { id: TRUSTEE_TITLE, role_id: TRUSTEE, name: 'Lead Trustee', seats: 1 },
    ],
    profiles: [
      { id: 'pending-pat', email: 'pat@x.test', full_name: 'Pat Pending', approval_status: 'pending', resident_id: null, role_id: null, title_id: null },
      { id: 'active-amy', email: 'amy@x.test', full_name: 'Amy Active', approval_status: 'active', resident_id: 'res-amy', role_id: null, title_id: null },
      { id: 'rejected-rex', email: 'rex@x.test', full_name: 'Rex Rejected', approval_status: 'rejected', resident_id: null, role_id: null, title_id: null },
      { id: 'pending-tia', email: 'tia@x.test', full_name: 'Tia Titled', approval_status: 'pending', resident_id: null, role_id: SECRETARY, title_id: 'title-x' },
    ],
    residents: [
      { id: 'res-free', first_name: 'Fola', last_name: 'Free', email: 'f@x.test', email_verified_at: '2026-01-01', profile_id: null },
      { id: 'res-amy', first_name: 'Amy', last_name: 'Active', email: 'amy@x.test', email_verified_at: null, profile_id: 'active-amy' },
      { id: 'res-taken', first_name: 'Tunde', last_name: 'Taken', email: null, email_verified_at: null, profile_id: 'someone-else' },
      { id: 'res-tenant', first_name: 'Toyin', last_name: 'Tenant', email: null, email_verified_at: null, profile_id: null },
    ],
    resident_houses: [
      { resident_id: 'res-tenant', resident_role: 'tenant', is_active: true, is_primary: true, move_in_date: '2025-01-01' },
      { resident_id: 'res-amy', resident_role: 'tenant', is_active: true, is_primary: true, move_in_date: '2025-01-01' },
    ],
    role_assignment_rules: [
      { id: 'rule-1', resident_role: 'tenant', app_role_id: TRUSTEE, is_allowed: false, created_by: 'original-author' },
    ],
  };
}

beforeEach(() => seed());

describe('getAssignableRoles (#1316)', () => {
  it('gives a caller with only system.assign_roles the active roles', async () => {
    const result = await getAssignableRoles();

    expect(result.success).toBe(true);
    expect(result.data?.map((r) => r.name)).toEqual(['secretary', 'trustee']);
    expect(result.data?.[1]).toMatchObject({ id: TRUSTEE, display_name: 'Trustee', requires_resident: true, category: 'exco' });
    expect(authorizeAnyPermission).toHaveBeenCalledWith([ASSIGN, MANAGE]);
  });

  it('also serves a caller with only system.manage_roles', async () => {
    state.held = [MANAGE];
    expect((await getAssignableRoles()).data?.length).toBe(2);
  });

  it('refuses a caller with neither, with the reason', async () => {
    state.held = [];
    expect(await getAssignableRoles()).toEqual({ success: false, error: 'Unauthorized: missing permission' });
  });
});

describe('approveAccount (#1316)', () => {
  it('links the resident, then gives a resident-only role and title, and activates', async () => {
    const result = await approveAccount('pending-pat', SECRETARY, 'res-free');
    expect(result).toEqual({ success: true });

    seed();
    // No "tenant" rule covers res-free, which has no residency.
    const withTitle = await approveAccount('pending-pat', TRUSTEE, 'res-free', TRUSTEE_TITLE);

    expect(withTitle).toEqual({ success: true });
    expect(profileRow('pending-pat')).toMatchObject({
      resident_id: 'res-free',
      role_id: TRUSTEE,
      title_id: TRUSTEE_TITLE,
      approval_status: 'active',
      approved_by: 'caller',
    });
    expect(residentRow('res-free').profile_id).toBe('pending-pat');
    // The link is written before the role, so the resident-only role has its resident.
    const profileWrites = writesTo('profiles').map((w) => Object.keys(w.values as Row));
    expect(profileWrites[0]).toEqual(['resident_id']);
    expect(profileWrites[1]).toContain('role_id');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'APPROVE',
        entityDisplay: 'Pat Pending (Lead Trustee)',
        newValues: expect.objectContaining({ role_id: TRUSTEE, title_id: TRUSTEE_TITLE, resident_id: 'res-free' }),
      })
    );
  });

  it('refuses a resident-only role with no resident, before writing anything', async () => {
    const result = await approveAccount('pending-pat', TRUSTEE);

    expect(result.success).toBe(false);
    expect(result.error).toContain('can only be held by a resident');
    expect(state.writes).toEqual([]);
  });

  it('refuses a rejected sign-up with a clear message and writes nothing', async () => {
    const result = await approveAccount('rejected-rex', SECRETARY);

    expect(result).toEqual({
      success: false,
      error: 'This sign-up was rejected, so it cannot be approved. The person must sign up again.',
    });
    expect(state.writes).toEqual([]);
  });

  it('applies "Who can hold each role" to the resident being linked, with the rule\'s reason', async () => {
    const result = await approveAccount('pending-pat', TRUSTEE, 'res-tenant');

    expect(result.success).toBe(false);
    expect(result.error).toBe(
      'A resident whose type is Renter cannot hold the Trustee role. This is set under "Who can hold each role".'
    );
    expect(state.writes).toEqual([]);
    expect(profileRow('pending-pat').resident_id).toBeNull();
  });

  it('refuses a resident already linked to another account', async () => {
    const result = await approveAccount('pending-pat', SECRETARY, 'res-taken');

    expect(result).toEqual({ success: false, error: 'That resident is already linked to a different account.' });
    expect(state.writes).toEqual([]);
  });

  it('undoes the resident link when the role write fails', async () => {
    state.failRoleWrite = true;

    const result = await approveAccount('pending-pat', TRUSTEE, 'res-free');

    expect(result.success).toBe(false);
    expect(profileRow('pending-pat')).toMatchObject({ resident_id: null, role_id: null, approval_status: 'pending' });
    expect(residentRow('res-free').profile_id).toBeNull();
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('assignRoleToProfile (#1316)', () => {
  it('refuses an account that is not active and says to approve the sign-up first', async () => {
    const result = await assignRoleToProfile('pending-pat', SECRETARY);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Approve the sign-up under Pending sign-ups first');
    expect(state.writes).toEqual([]);
  });

  it('refuses a role that "Who can hold each role" disallows, with the rule\'s reason', async () => {
    const result = await assignRoleToProfile('active-amy', TRUSTEE);

    expect(result).toEqual({
      success: false,
      error: 'A resident whose type is Renter cannot hold the Trustee role. This is set under "Who can hold each role".',
    });
    expect(state.writes).toEqual([]);
  });

  it('allows the role once the rule allows it', async () => {
    state.tables.role_assignment_rules[0].is_allowed = true;

    expect((await assignRoleToProfile('active-amy', TRUSTEE)).success).toBe(true);
    expect(profileRow('active-amy').role_id).toBe(TRUSTEE);
  });

  it('counts only active holders against a title\'s seats', async () => {
    state.tables.role_assignment_rules = [];
    state.tables.profiles.push({ id: 'sus', email: 's@x.test', full_name: 'Sue Suspended', approval_status: 'suspended', resident_id: 'r', role_id: TRUSTEE, title_id: TRUSTEE_TITLE });

    expect((await assignRoleToProfile('active-amy', TRUSTEE, TRUSTEE_TITLE)).success).toBe(true);

    seed();
    state.tables.role_assignment_rules = [];
    state.tables.profiles.push({ id: 'act', email: 'a@x.test', full_name: 'Ade Active', approval_status: 'active', resident_id: 'r', role_id: TRUSTEE, title_id: TRUSTEE_TITLE });

    const full = await assignRoleToProfile('active-amy', TRUSTEE, TRUSTEE_TITLE);
    expect(full.error).toBe('Lead Trustee is already held by Ade Active. Move them to another title first.');
  });
});

describe('rejectAccount (#1316)', () => {
  it('clears the title along with the role', async () => {
    const result = await rejectAccount('pending-tia', 'Not a resident here');

    expect(result).toEqual({ success: true });
    expect(profileRow('pending-tia')).toMatchObject({ approval_status: 'rejected', role_id: null, title_id: null });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ oldValues: expect.objectContaining({ title_id: 'title-x' }) })
    );
  });
});

describe('checkRoleAssignmentAllowed (#1316)', () => {
  it('checks permission before reading anything', async () => {
    state.held = [];
    const result = await checkRoleAssignmentAllowed('active-amy', TRUSTEE);

    expect(result).toEqual({ success: false, allowed: false, reason: 'Unauthorized: missing permission' });
  });

  it('returns the rule\'s reason to a permitted caller', async () => {
    const result = await checkRoleAssignmentAllowed('active-amy', TRUSTEE);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('cannot hold the Trustee role');
  });
});

describe('batchUpdateRoleAssignmentRules input checks (#1316)', () => {
  beforeEach(() => {
    state.held = [MANAGE];
  });

  it.each([
    ['an unknown resident type', [{ residentRole: 'landlord', appRoleId: SECRETARY, isAllowed: true }], 'Unknown resident type in the rules'],
    ['a role id that is not a uuid', [{ residentRole: 'tenant', appRoleId: 'r-sec', isAllowed: true }], 'Invalid role in the rules'],
    [
      'the same rule twice',
      [
        { residentRole: 'tenant', appRoleId: SECRETARY, isAllowed: true },
        { residentRole: 'tenant', appRoleId: SECRETARY, isAllowed: false },
      ],
      'The same rule appears more than once',
    ],
  ])('refuses %s and writes nothing', async (_label, updates, error) => {
    expect(await batchUpdateRoleAssignmentRules(updates as never)).toEqual({ success: false, error });
    expect(state.writes).toEqual([]);
  });

  it('keeps created_by on an existing rule and audits the old value', async () => {
    const result = await batchUpdateRoleAssignmentRules([
      { residentRole: 'tenant', appRoleId: TRUSTEE, isAllowed: true },
      { residentRole: 'tenant', appRoleId: SECRETARY, isAllowed: false },
    ]);

    expect(result).toEqual({ success: true });
    const rules = state.tables.role_assignment_rules;
    expect(rules.find((r) => r.app_role_id === TRUSTEE)).toMatchObject({ is_allowed: true, created_by: 'original-author' });
    expect(rules.find((r) => r.app_role_id === SECRETARY)).toMatchObject({ is_allowed: false, created_by: 'caller' });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: {
          rules: [
            { residentRole: 'tenant', appRoleId: TRUSTEE, isAllowed: false },
            { residentRole: 'tenant', appRoleId: SECRETARY, isAllowed: null },
          ],
        },
      })
    );
  });
});

describe('full-name search (#1316)', () => {
  it('matches "John Smith" against first and last name together', async () => {
    await searchResidentsForRoleAssignment('John Smith');

    const filter = state.orFilters.find((f) => f.table === 'residents')!.filter;
    expect(filter).toContain(
      'and(or(first_name.ilike."%John%",last_name.ilike."%John%"),or(first_name.ilike."%Smith%",last_name.ilike."%Smith%"))'
    );
  });

  it('matches every word of an account\'s full name', async () => {
    await searchProfilesForRoleAssignment('John Smith');

    const filter = state.orFilters.find((f) => f.table === 'profiles')!.filter;
    expect(filter).toContain('and(or(full_name.ilike."%John%"),or(full_name.ilike."%Smith%"))');
  });

  it('keeps a one-word search as it was', async () => {
    await searchResidentsForRoleAssignment('John');

    const filter = state.orFilters.find((f) => f.table === 'residents')!.filter;
    expect(filter).not.toContain('and(');
  });

  it('reports the linked account\'s status for a resident, found from either side', async () => {
    state.tables.resident_houses = [];
    state.tables.residents.push({ id: 'res-back', first_name: 'Bola', last_name: 'Back', email: null, profile_id: null });
    state.tables.profiles.push({ id: 'p-back', email: 'b@x.test', full_name: 'Bola Back', approval_status: 'pending', resident_id: 'res-back', role_id: null, title_id: null });

    const result = await searchResidentsForRoleAssignment('Bola');

    // The fake ignores .or(), so every resident comes back; check the linked one.
    const back = result.data?.find((r) => r.id === 'res-back');
    expect(back).toMatchObject({ profile_id: 'p-back', approval_status: 'pending' });
    expect(result.data?.find((r) => r.id === 'res-free')).toMatchObject({ profile_id: null, approval_status: null });
  });
});
