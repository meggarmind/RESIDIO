import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #1316 (QA follow-up): approveAccount's guards, run with the REAL
 * account guards (assertCanManageTarget, assertCanGrantRoles) over a fake
 * client, and the assignment-rule checks failing closed. Every test asserts on
 * the rows, not only on the returned error.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; values: unknown }>,
  held: [] as string[],
  /** Tables whose reads fail. */
  failReads: [] as string[],
  /** Fail the profiles update that sets role_id (the approval's final write). */
  failRoleWrite: false,
  /** Runs once after the first read of a profiles row by id: a concurrent change. */
  afterProfileRead: null as null | (() => void),
}));

function fakeFrom(table: string) {
  const filters: Array<(row: Row) => boolean> = [];
  let op: 'select' | 'update' = 'select';
  let values: Row = {};

  const view = (r: Row): Row => {
    if (table === 'profiles') {
      const role = (state.tables.app_roles ?? []).find((x) => x.id === r.role_id);
      return { ...r, app_roles: role ? { name: role.name } : null };
    }
    if (table === 'role_permissions') {
      const perm = (state.tables.app_permissions ?? []).find((p) => p.id === r.permission_id);
      return { ...r, permission: perm ? { name: perm.name, is_active: perm.is_active } : null };
    }
    return { ...r };
  };

  const run = () => {
    if (op === 'select' && state.failReads.includes(table)) {
      return { data: null, error: { message: `read of ${table} failed` } };
    }
    const rows = (state.tables[table] ?? []).filter((row) => filters.every((f) => f(row)));
    if (op === 'update') {
      if (table === 'profiles' && state.failRoleWrite && 'role_id' in values) {
        return { data: null, error: { code: 'XX000', message: 'boom' } };
      }
      state.writes.push({ table, values });
      rows.forEach((r) => Object.assign(r, values));
      return { data: rows.map(view), error: null };
    }
    const data = rows.map(view);
    if (table === 'profiles' && state.afterProfileRead) {
      const hook = state.afterProfileRead;
      state.afterProfileRead = null;
      hook();
    }
    return { data, error: null };
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    update: (v: Row) => ((op = 'update'), (values = v), builder),
    eq: (c: string, v: unknown) => (filters.push((r) => r[c] === v), builder),
    neq: (c: string, v: unknown) => (filters.push((r) => r[c] !== v), builder),
    in: (c: string, vs: unknown[]) => (filters.push((r) => vs.includes(r[c])), builder),
    is: (c: string, v: unknown) => (filters.push((r) => (r[c] ?? null) === v), builder),
    not: (c: string, operator: string, v: unknown) => {
      if (operator === 'is') filters.push((r) => (r[c] ?? null) !== v);
      if (operator === 'in') {
        const list = String(v).replace(/^\(|\)$/g, '').split(',');
        filters.push((r) => !list.includes(String(r[c])));
      }
      return builder;
    },
    or: () => builder,
    order: () => builder,
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
    roleName: null,
    roleId: null,
    permissions: state.held,
    error: ok ? null : 'Unauthorized',
  });
  return {
    authorizePermission: async (p: string) => result(state.held.includes(p)),
    authorizeAnyPermission: async (ps: string[]) => result(ps.some((p) => state.held.includes(p))),
  };
});
const logAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/auth/super-admin-invariant', () => ({
  isLastActiveSuperAdmin: async () => false,
  LAST_SUPER_ADMIN_ERROR: 'last super admin',
}));
// account-guards is deliberately NOT mocked.

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { CANNOT_CHANGE_ACCOUNT_ERROR, CANNOT_GRANT_ROLE_ERROR } from '@/lib/auth/account-guards';
import { approveAccount } from '@/actions/auth/account-approval';
import { assignRoleToProfile, searchResidentsForRoleAssignment } from '@/actions/roles/assign-role';

const ASSIGN = PERMISSIONS.SYSTEM_ASSIGN_ROLES;
const BOARD = PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES;

const R_CALLER = 'role-caller';
const SECRETARY = '22222222-2222-4222-8222-222222222222';
const CHAIRMAN = '44444444-4444-4444-8444-444444444444';
const VERIFIED_ROLE = '55555555-5555-4555-8555-555555555555';
const SEC_TITLE = 'title-sec';
const CHAIR_TITLE = 'title-chair';

const RES_FREE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1';
const RES_BACKLINKED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2';
const RES_PROFILE_LINKED = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';

const profileRow = (id: string) => state.tables.profiles.find((p) => p.id === id)!;
const residentRow = (id: string) => state.tables.residents.find((r) => r.id === id)!;

/** The caller's role holds `permissions`. */
function seed(permissions: string[] = [ASSIGN]) {
  state.writes = [];
  state.held = [...permissions];
  state.failReads = [];
  state.failRoleWrite = false;
  state.afterProfileRead = null;
  logAudit.mockClear();
  state.tables = {
    app_permissions: permissions.map((name, i) => ({ id: `perm-${i}`, name, is_active: true })),
    role_permissions: permissions.map((_, i) => ({ role_id: R_CALLER, permission_id: `perm-${i}` })),
    app_roles: [
      { id: R_CALLER, name: 'caller_role', display_name: 'Caller', is_active: true, requires_resident: false, requires_contact_verification: false },
      { id: SECRETARY, name: 'secretary', display_name: 'Secretary', is_active: true, requires_resident: false, requires_contact_verification: false },
      { id: CHAIRMAN, name: 'chairman', display_name: 'Chairman', is_active: true, requires_resident: false, requires_contact_verification: false },
      { id: VERIFIED_ROLE, name: 'treasurer', display_name: 'Treasurer', is_active: true, requires_resident: false, requires_contact_verification: true },
    ],
    admin_titles: [
      { id: SEC_TITLE, role_id: SECRETARY, name: 'Secretary', seats: 1 },
      { id: CHAIR_TITLE, role_id: CHAIRMAN, name: 'Chairman', seats: 1 },
    ],
    profiles: [
      { id: 'caller', email: 'c@x.test', full_name: 'Caller', approval_status: 'active', role_id: R_CALLER, resident_id: null, title_id: null },
      { id: 'pending-pat', email: 'pat@x.test', full_name: 'Pat Pending', approval_status: 'pending', role_id: null, resident_id: null, title_id: null },
      { id: 'pending-chair', email: 'ch@x.test', full_name: 'Pending Chair', approval_status: 'pending', role_id: CHAIRMAN, resident_id: null, title_id: null },
      { id: 'suspended-sam', email: 'sam@x.test', full_name: 'Sam Suspended', approval_status: 'suspended', role_id: null, resident_id: null, title_id: null },
      { id: 'other', email: 'o@x.test', full_name: 'Other Holder', approval_status: 'active', role_id: SECRETARY, resident_id: RES_BACKLINKED, title_id: SEC_TITLE },
    ],
    residents: [
      { id: RES_FREE, first_name: 'Fola', last_name: 'Free', email: 'f@x.test', email_verified_at: null, profile_id: null },
      { id: RES_BACKLINKED, first_name: 'Bola', last_name: 'Back', email: null, email_verified_at: null, profile_id: null },
      { id: RES_PROFILE_LINKED, first_name: 'Lara', last_name: 'Linked', email: null, email_verified_at: null, profile_id: 'pending-pat' },
    ],
    resident_houses: [
      { resident_id: RES_FREE, resident_role: 'tenant', is_active: true },
    ],
    role_assignment_rules: [],
  };
}

beforeEach(() => seed());

describe('approveAccount with the real account guards (#1316)', () => {
  it('refuses a board role to a caller who holds only system.assign_roles', async () => {
    const result = await approveAccount('pending-pat', CHAIRMAN);

    expect(result).toEqual({ success: false, error: CANNOT_GRANT_ROLE_ERROR });
    expect(state.writes).toEqual([]);
    expect(profileRow('pending-pat').approval_status).toBe('pending');
  });

  it('lets a caller with system.assign_board_roles approve the same board role', async () => {
    seed([ASSIGN, BOARD]);
    expect(await approveAccount('pending-pat', CHAIRMAN)).toEqual({ success: true });
    expect(profileRow('pending-pat')).toMatchObject({ role_id: CHAIRMAN, approval_status: 'active' });
  });

  it('refuses to change an account that holds a board role, without system.assign_board_roles', async () => {
    const result = await approveAccount('pending-chair', SECRETARY);

    expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
    expect(state.writes).toEqual([]);
    expect(profileRow('pending-chair')).toMatchObject({ role_id: CHAIRMAN, approval_status: 'pending' });
  });

  it('refuses a suspended account', async () => {
    const result = await approveAccount('suspended-sam', SECRETARY);

    expect(result).toEqual({ success: false, error: 'This account is suspended, so it cannot be approved here.' });
    expect(state.writes).toEqual([]);
  });

  it('refuses a title that belongs to another role', async () => {
    seed([ASSIGN, BOARD]);
    const result = await approveAccount('pending-pat', SECRETARY, null, CHAIR_TITLE);

    expect(result).toEqual({ success: false, error: 'That title does not belong to this role' });
    expect(state.writes).toEqual([]);
  });

  it('refuses a full title and names the holder', async () => {
    const result = await approveAccount('pending-pat', SECRETARY, null, SEC_TITLE);

    expect(result).toEqual({
      success: false,
      error: 'Secretary is already held by Other Holder. Move them to another title first.',
    });
    expect(state.writes).toEqual([]);
  });

  it('writes nothing to an account whose status changed after it was read', async () => {
    // Another administrator rejects the sign-up while this approval runs.
    state.afterProfileRead = () => {
      profileRow('pending-pat').approval_status = 'rejected';
    };

    const result = await approveAccount('pending-pat', SECRETARY);

    expect(result.success).toBe(false);
    expect(profileRow('pending-pat')).toMatchObject({ approval_status: 'rejected', role_id: null });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('keeps a residents.profile_id link that existed before a failed approval', async () => {
    state.failRoleWrite = true;

    const result = await approveAccount('pending-pat', SECRETARY, RES_PROFILE_LINKED);

    expect(result.success).toBe(false);
    expect(profileRow('pending-pat').resident_id).toBeNull();
    expect(residentRow(RES_PROFILE_LINKED).profile_id).toBe('pending-pat');
  });

  it('still undoes a residents.profile_id link that the failed approval wrote', async () => {
    state.failRoleWrite = true;

    await approveAccount('pending-pat', SECRETARY, RES_FREE);

    expect(residentRow(RES_FREE).profile_id).toBeNull();
    expect(profileRow('pending-pat').resident_id).toBeNull();
  });
});

describe('assignment rules fail closed (#1316)', () => {
  it('refuses when the residency cannot be read', async () => {
    state.failReads = ['resident_houses'];

    const result = await approveAccount('pending-pat', SECRETARY, RES_FREE);

    expect(result).toEqual({ success: false, error: 'Could not check who can hold this role' });
    expect(state.writes).toEqual([]);
  });

  it('refuses a role that needs a verified email when the resident\'s is not verified', async () => {
    const result = await approveAccount('pending-pat', VERIFIED_ROLE, RES_FREE);

    expect(result).toEqual({
      success: false,
      error: 'The Treasurer role needs a verified email address. This resident\'s email address is not verified yet.',
    });
    expect(state.writes).toEqual([]);
  });

  it('applies the same checks on assign', async () => {
    profileRow('pending-pat').approval_status = 'active';
    profileRow('pending-pat').resident_id = RES_FREE;

    expect((await assignRoleToProfile('pending-pat', VERIFIED_ROLE)).error).toContain('needs a verified email address');
    state.failReads = ['resident_houses'];
    expect((await assignRoleToProfile('pending-pat', SECRETARY)).error).toBe('Could not check who can hold this role');
    expect(state.writes).toEqual([]);
  });
});

describe('searchResidentsForRoleAssignment unlinkedOnly (#1316)', () => {
  it('leaves out residents linked from either side', async () => {
    const all = await searchResidentsForRoleAssignment('a');
    expect(all.data).toEqual([]); // under two characters: no search

    const every = await searchResidentsForRoleAssignment('ola');
    expect(every.data?.map((r) => r.id).sort()).toEqual([RES_FREE, RES_BACKLINKED, RES_PROFILE_LINKED].sort());

    const unlinked = await searchResidentsForRoleAssignment('ola', { unlinkedOnly: true });
    expect(unlinked.data?.map((r) => r.id)).toEqual([RES_FREE]);
  });

  it('fails rather than returning linked residents when the links cannot be read', async () => {
    state.failReads = ['profiles'];
    expect(await searchResidentsForRoleAssignment('ola', { unlinkedOnly: true })).toEqual({
      error: 'Failed to search residents',
    });
  });
});
