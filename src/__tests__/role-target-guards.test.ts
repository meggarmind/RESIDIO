import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issues #475 and #826: who may grant which role, and who may change whom. These
 * tests drive each action against an in-memory fake of the two Supabase clients
 * and assert on the writes that reached the "database" rather than on return
 * values alone.
 *
 * The guards read the caller's permissions from role_permissions, so each role's
 * grants are seeded below: super_admin holds system.assign_roles and
 * system.assign_board_roles, chairman holds system.assign_roles only, and the
 * other roles hold neither unless a test grants it. The mocked
 * authorizePermission() result is never consulted by the guards.
 */

type Row = Record<string, unknown>;
type Write = { table: string; op: string; values?: Row };

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  /** Profile ids whose maybeSingle() read fails with a database error. */
  failProfileReads: [] as string[],
  /** When true, reads of role_permissions fail with a database error. */
  failPermissionReads: false,
  writes: [] as Array<{ table: string; op: string; values?: Row }>,
  auth: {
    authorized: true,
    userId: 'caller',
    roleName: 'treasurer' as string | null,
    roleId: 'r-treasurer' as string | null,
    permissions: [] as string[],
    error: null as string | null,
  },
}));

function fakeFrom(table: string) {
  const filters: Array<[string, unknown]> = [];
  const inFilters: Array<[string, unknown[]]> = [];
  let op: 'select' | 'update' | 'insert' | 'delete' = 'select';
  let values: Row | Row[] | undefined;

  const matching = () =>
    (state.tables[table] ?? []).filter(
      (row) =>
        filters.every(([col, val]) => row[col] === val) &&
        inFilters.every(([col, vals]) => vals.includes(row[col]))
    );

  const withEmbeds = (rows: Row[]): Row[] =>
    rows.map((row) => {
      if (table === 'profiles') {
        return { ...row, app_roles: (state.tables.app_roles ?? []).find((r) => r.id === row.role_id) ?? null };
      }
      if (table === 'role_permissions') {
        return {
          ...row,
          permission: (state.tables.app_permissions ?? []).find((p) => p.id === row.permission_id) ?? null,
        };
      }
      return row;
    });

  const execute = (): Row[] => {
    const rows = matching();
    if (op === 'update') {
      state.writes.push({ table, op, values: values as Row });
      rows.forEach((row) => Object.assign(row, values));
      return rows;
    }
    if (op === 'insert') {
      const inserted = Array.isArray(values) ? values : [values as Row];
      inserted.forEach((v) => state.writes.push({ table, op, values: v }));
      state.tables[table] = [...(state.tables[table] ?? []), ...inserted];
      return inserted;
    }
    if (op === 'delete') {
      state.writes.push({ table, op });
      state.tables[table] = (state.tables[table] ?? []).filter((row) => !rows.includes(row));
      return rows;
    }
    return withEmbeds(rows);
  };

  const builder: Record<string, unknown> = {
    select: () => builder,
    update: (v: Row) => ((op = 'update'), (values = v), builder),
    insert: (v: Row | Row[]) => ((op = 'insert'), (values = v), builder),
    // updateRolePermissions adds grants with upsert ... ignoreDuplicates (#1318); none conflict here.
    upsert: (v: Row | Row[]) => ((op = 'insert'), (values = v), builder),
    delete: () => ((op = 'delete'), builder),
    eq: (col: string, val: unknown) => (filters.push([col, val]), builder),
    // .in() is applied to deletes only, where updateRolePermissions names the grants it removes (#1318).
    in: (col: string, vals: unknown[]) => (op === 'delete' && inFilters.push([col, vals]), builder),
    // Filters this suite never depends on are accepted and ignored.
    neq: () => builder,
    is: () => builder,
    gt: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => {
      const rows = execute();
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } };
    },
    maybeSingle: async () => {
      const id = filters.find(([col]) => col === 'id')?.[1] as string | undefined;
      if (table === 'profiles' && id && state.failProfileReads.includes(id)) {
        return { data: null, error: { message: 'db down' } };
      }
      return { data: execute()[0] ?? null, error: null };
    },
    then: (resolve: (v: unknown) => unknown) =>
      table === 'role_permissions' && op === 'select' && state.failPermissionReads
        ? resolve({ data: null, error: { message: 'db down' } })
        : resolve({ data: execute(), error: null }),
  };
  return builder;
}

const fakeClient = {
  from: fakeFrom,
  auth: {
    admin: {
      getUserById: async (id: string) => ({ data: { user: { id, email: `${id}@example.test` } }, error: null }),
    },
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => fakeClient,
  createServerSupabaseClient: async () => fakeClient,
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: async () => state.auth }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('@/lib/auth/super-admin-invariant', () => ({
  isLastActiveSuperAdmin: async () => false,
  LAST_SUPER_ADMIN_ERROR: 'last super admin',
}));
vi.mock('@/actions/roles/assignment-rules', () => ({
  checkRoleAssignmentAllowed: async () => ({ allowed: true }),
}));

import { assignRoleToProfile, removeRoleFromProfile } from '@/actions/roles/assign-role';
import { assignRoleToUser, updateRole, updateRolePermissions } from '@/actions/roles/index';
import { rejectAccount } from '@/actions/auth/account-approval';
import { linkAuthAccountToResident, unlinkAuthAccount } from '@/actions/auth/link-account';
import { resetUserTwoFactor } from '@/actions/two-factor/disable';
import {
  assertCanGrantRoles,
  assertCanManageTarget,
  permissionToGrant,
  permissionToManage,
  CALLER_NOT_VERIFIED_ERROR,
  CANNOT_CHANGE_ACCOUNT_ERROR,
  CANNOT_GRANT_ROLE_ERROR,
} from '@/lib/auth/account-guards';

const RESIDENT_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_AUTH_ID = '22222222-2222-4222-8222-222222222222';

const ASSIGN = 'system.assign_roles';
const BOARD = 'system.assign_board_roles';

const ROLES: Record<string, Row> = {
  super_admin: { id: 'r-sa', name: 'super_admin', display_name: 'Super Admin', is_active: true, is_system_role: true },
  chairman: { id: 'r-ch', name: 'chairman', display_name: 'Chairman', is_active: true, is_system_role: true },
  trustee: { id: 'r-tr', name: 'trustee', display_name: 'Trustee', is_active: true, is_system_role: true },
  secretary: { id: 'r-sec', name: 'secretary', display_name: 'Secretary', is_active: true, is_system_role: true },
  treasurer: { id: 'r-treasurer', name: 'treasurer', display_name: 'Treasurer', is_active: true, is_system_role: false },
  // A role *named* super_admin that is not flagged as a system role, so the name
  // check is exercised on its own rather than hidden behind is_system_role.
  unflagged_super_admin: { id: 'r-sa-unflagged', name: 'super_admin', display_name: 'Super Admin', is_active: true, is_system_role: false },
  auditor: { id: 'r-auditor', name: 'auditor', display_name: 'Auditor', is_active: true, is_system_role: false },
};

/** Each role's permission grants, as role_permissions holds them. */
const GRANTS: Record<string, string[]> = {
  super_admin: [ASSIGN, BOARD],
  chairman: [ASSIGN],
};

type Scenario = {
  caller: keyof typeof ROLES;
  target?: keyof typeof ROLES | null;
  targetStatus?: string;
  /** Replaces the caller role's grants, e.g. a secretary given system.assign_roles. */
  callerGrants?: string[];
  callerStatus?: string;
};

/** Seeds the fake database and points the mocked authorizePermission at the caller. */
function seed({ caller, target = 'secretary', targetStatus = 'active', callerGrants, callerStatus = 'active' }: Scenario) {
  state.writes = [];
  state.failProfileReads = [];
  state.failPermissionReads = false;
  const grants: Record<string, string[]> = { ...GRANTS, ...(callerGrants ? { [caller]: callerGrants } : {}) };
  state.tables = {
    app_roles: Object.values(ROLES).map((r) => ({ ...r })),
    app_permissions: [
      { id: 'p-assign', name: ASSIGN, is_active: true },
      { id: 'p-board', name: BOARD, is_active: true },
      { id: 'p1', name: 'x.view', is_active: true },
    ],
    role_permissions: [
      { role_id: 'r-auditor', permission_id: 'p1' },
      ...Object.entries(grants).flatMap(([role, names]) =>
        names.map((name) => ({ role_id: ROLES[role].id, permission_id: name === BOARD ? 'p-board' : 'p-assign' }))
      ),
    ],
    profiles: [
      { id: 'caller', email: 'caller@example.test', full_name: 'Caller', role_id: ROLES[caller].id, approval_status: callerStatus, resident_id: null },
      {
        id: TARGET_AUTH_ID,
        email: 'target@example.test',
        full_name: 'Target',
        role_id: target ? ROLES[target].id : null,
        approval_status: targetStatus,
        resident_id: null,
        two_factor_enabled: true,
        two_factor_method: 'authenticator',
      },
    ],
    residents: [{ id: RESIDENT_ID, first_name: 'Ada', last_name: 'Obi', email: 'ada@example.test', profile_id: null }],
    two_factor_backup_codes: [],
    two_factor_tokens: [],
    two_factor_audit_log: [],
  };
  state.auth = {
    authorized: true,
    userId: 'caller',
    roleName: caller as string,
    roleId: ROLES[caller].id as string,
    permissions: [],
    error: null,
  };
}

const writesTo = (table: string): Write[] => state.writes.filter((w) => w.table === table);
const profileOf = (id: string) => state.tables.profiles.find((p) => p.id === id)!;

beforeEach(() => {
  seed({ caller: 'chairman' });
});

describe('permissionToGrant and permissionToManage', () => {
  it('needs assign_board_roles to grant super_admin, chairman or trustee, and assign_roles for anything else', () => {
    expect(permissionToGrant('super_admin')).toBe(BOARD);
    expect(permissionToGrant('chairman')).toBe(BOARD);
    expect(permissionToGrant('trustee')).toBe(BOARD);
    expect(permissionToGrant('secretary')).toBe(ASSIGN);
    expect(permissionToGrant('a-custom-role')).toBe(ASSIGN);
  });

  it('needs assign_board_roles to change a super_admin or chairman account, and assign_roles for any other, a trustee included', () => {
    expect(permissionToManage('super_admin')).toBe(BOARD);
    expect(permissionToManage('chairman')).toBe(BOARD);
    expect(permissionToManage('trustee')).toBe(ASSIGN);
    expect(permissionToManage('secretary')).toBe(ASSIGN);
    expect(permissionToManage(null)).toBe(ASSIGN);
  });
});

describe('assignRoleToProfile', () => {
  it.each(['chairman', 'super_admin'] as const)(
    'refuses a chairman assigning a role to a %s account, and writes nothing',
    async (target) => {
      seed({ caller: 'chairman', target });
      const result = await assignRoleToProfile(TARGET_AUTH_ID, ROLES.secretary.id as string);
      expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
      expect(writesTo('profiles')).toEqual([]);
      expect(profileOf(TARGET_AUTH_ID).role_id).toBe(ROLES[target].id);
    }
  );

  it('refuses a secretary given system.assign_roles changing a chairman, but lets them change an ordinary account', async () => {
    seed({ caller: 'secretary', target: 'chairman', callerGrants: [ASSIGN] });
    expect(await assignRoleToProfile(TARGET_AUTH_ID, ROLES.auditor.id as string)).toEqual({
      success: false,
      error: CANNOT_CHANGE_ACCOUNT_ERROR,
    });
    expect(writesTo('profiles')).toEqual([]);

    seed({ caller: 'secretary', target: 'treasurer', callerGrants: [ASSIGN] });
    expect(await assignRoleToProfile(TARGET_AUTH_ID, ROLES.auditor.id as string)).toMatchObject({ success: true });
  });

  it('refuses a caller with neither permission changing even an ordinary account', async () => {
    seed({ caller: 'treasurer', target: 'secretary' });
    const result = await assignRoleToProfile(TARGET_AUTH_ID, ROLES.auditor.id as string);
    expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
    expect(writesTo('profiles')).toEqual([]);
  });

  it('still lets a chairman reassign an ordinary account', async () => {
    seed({ caller: 'chairman', target: 'secretary' });
    const result = await assignRoleToProfile(TARGET_AUTH_ID, ROLES.auditor.id as string);
    expect(result).toMatchObject({ success: true });
    expect(profileOf(TARGET_AUTH_ID).role_id).toBe('r-auditor');
  });

  it('lets a chairman demote a trustee', async () => {
    seed({ caller: 'chairman', target: 'trustee' });
    expect(await assignRoleToProfile(TARGET_AUTH_ID, ROLES.secretary.id as string)).toMatchObject({ success: true });
    expect(profileOf(TARGET_AUTH_ID).role_id).toBe('r-sec');
  });

  it.each(['super_admin', 'chairman', 'trustee'] as const)(
    'refuses a chairman granting %s, and writes nothing',
    async (role) => {
      seed({ caller: 'chairman', target: 'secretary' });
      const result = await assignRoleToProfile(TARGET_AUTH_ID, ROLES[role].id as string);
      expect(result).toEqual({ success: false, error: CANNOT_GRANT_ROLE_ERROR });
      expect(writesTo('profiles')).toEqual([]);
    }
  );

  it.each(['super_admin', 'chairman', 'trustee'] as const)('lets a super_admin grant %s', async (role) => {
    seed({ caller: 'super_admin', target: 'secretary' });
    expect(await assignRoleToProfile(TARGET_AUTH_ID, ROLES[role].id as string)).toMatchObject({ success: true });
  });

  it('lets a super_admin change a chairman', async () => {
    seed({ caller: 'super_admin', target: 'chairman' });
    const result = await assignRoleToProfile(TARGET_AUTH_ID, ROLES.auditor.id as string);
    expect(result.success).toBe(true);
  });
});

describe('self-escalation', () => {
  /** Points the target at the caller's own profile. */
  const self = 'caller';

  it.each(['super_admin', 'chairman', 'trustee'] as const)(
    'refuses a secretary holding system.assign_roles granting themselves %s',
    async (role) => {
      seed({ caller: 'secretary', callerGrants: [ASSIGN] });
      expect((await assignRoleToProfile(self, ROLES[role].id as string)).success).toBe(false);
      expect((await assignRoleToUser(self, ROLES[role].id as string)).success).toBe(false);
      expect(writesTo('profiles')).toEqual([]);
      expect(profileOf(self).role_id).toBe('r-sec');
    }
  );

  it.each(['super_admin', 'trustee', 'secretary'] as const)(
    'refuses a chairman changing their own account to %s (it holds chairman)',
    async (role) => {
      seed({ caller: 'chairman' });
      const result = await assignRoleToProfile(self, ROLES[role].id as string);
      expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
      expect(writesTo('profiles')).toEqual([]);
      expect(profileOf(self).role_id).toBe('r-ch');
    }
  );
});

describe('assignRoleToUser', () => {
  it.each(['chairman', 'super_admin'] as const)(
    'refuses a chairman targeting a %s account, and writes nothing',
    async (target) => {
      seed({ caller: 'chairman', target });
      const result = await assignRoleToUser(TARGET_AUTH_ID, ROLES.secretary.id as string);
      expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
      expect(writesTo('profiles')).toEqual([]);
    }
  );

  it('carries the grant guard: a chairman cannot grant super_admin, chairman or trustee', async () => {
    seed({ caller: 'chairman', target: 'secretary' });
    for (const role of ['super_admin', 'chairman', 'trustee'] as const) {
      const result = await assignRoleToUser(TARGET_AUTH_ID, ROLES[role].id as string);
      expect(result).toEqual({ success: false, error: CANNOT_GRANT_ROLE_ERROR });
    }
    expect(writesTo('profiles')).toEqual([]);
  });

  it('refuses a role that does not exist rather than writing a dangling role_id', async () => {
    seed({ caller: 'chairman', target: 'secretary' });
    const result = await assignRoleToUser(TARGET_AUTH_ID, 'r-missing');
    expect(result).toEqual({ success: false, error: 'Role not found' });
    expect(writesTo('profiles')).toEqual([]);
  });

  it('still lets a chairman manage an ordinary user and a trustee', async () => {
    for (const target of ['secretary', 'trustee'] as const) {
      seed({ caller: 'chairman', target });
      const result = await assignRoleToUser(TARGET_AUTH_ID, ROLES.auditor.id as string);
      expect(result.success).toBe(true);
      expect(profileOf(TARGET_AUTH_ID).role_id).toBe('r-auditor');
    }
  });
});

describe('removeRoleFromProfile', () => {
  it('lets a chairman remove a trustee role', async () => {
    seed({ caller: 'chairman', target: 'trustee' });
    expect(await removeRoleFromProfile(TARGET_AUTH_ID)).toEqual({ success: true });
    expect(profileOf(TARGET_AUTH_ID).role_id).toBeNull();
  });

  it('refuses a secretary holding system.assign_roles removing the chairman role', async () => {
    seed({ caller: 'secretary', target: 'chairman', callerGrants: [ASSIGN] });
    expect(await removeRoleFromProfile(TARGET_AUTH_ID)).toEqual({
      success: false,
      error: CANNOT_CHANGE_ACCOUNT_ERROR,
    });
    expect(writesTo('profiles')).toEqual([]);
  });
});

describe('rejectAccount', () => {
  it.each(['chairman', 'super_admin'] as const)(
    'refuses a chairman rejecting a %s account, and writes nothing',
    async (target) => {
      seed({ caller: 'chairman', target, targetStatus: 'pending' });
      const result = await rejectAccount(TARGET_AUTH_ID, 'no');
      expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
      expect(writesTo('profiles')).toEqual([]);
    }
  );

  it.each(['active', 'rejected', 'suspended'])(
    'refuses a target whose status is %s -- only pending accounts can be rejected',
    async (status) => {
      seed({ caller: 'chairman', target: 'secretary', targetStatus: status });
      const result = await rejectAccount(TARGET_AUTH_ID, 'no');
      expect(result).toEqual({ success: false, error: 'Only pending accounts can be rejected' });
      expect(writesTo('profiles')).toEqual([]);
      expect(profileOf(TARGET_AUTH_ID).role_id).toBe('r-sec');
    }
  );

  it('rejects a pending account (the legitimate flow), including a role-less one', async () => {
    seed({ caller: 'chairman', target: null, targetStatus: 'pending' });
    const result = await rejectAccount(TARGET_AUTH_ID, 'not a resident');
    expect(result.success).toBe(true);
    expect(profileOf(TARGET_AUTH_ID).approval_status).toBe('rejected');
  });

  it('lets a super_admin reject a pending account', async () => {
    seed({ caller: 'super_admin', target: 'chairman', targetStatus: 'pending' });
    expect((await rejectAccount(TARGET_AUTH_ID, 'no')).success).toBe(true);
  });
});

describe('linkAuthAccountToResident', () => {
  it.each(['chairman', 'super_admin'] as const)(
    'refuses a chairman linking a %s account, and writes nothing',
    async (target) => {
      seed({ caller: 'chairman', target, targetStatus: 'active' });
      const result = await linkAuthAccountToResident(TARGET_AUTH_ID, RESIDENT_ID);
      expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
      expect(writesTo('profiles')).toEqual([]);
      expect(writesTo('residents')).toEqual([]);
    }
  );

  it.each(['rejected', 'suspended'])('refuses to reactivate a %s account', async (status) => {
    seed({ caller: 'chairman', target: null, targetStatus: status });
    const result = await linkAuthAccountToResident(TARGET_AUTH_ID, RESIDENT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toContain(status);
    expect(writesTo('profiles')).toEqual([]);
    expect(profileOf(TARGET_AUTH_ID).approval_status).toBe(status);
  });

  it('links a pending, role-less account and approves it, leaving it role-less (the legitimate flow)', async () => {
    seed({ caller: 'chairman', target: null, targetStatus: 'pending' });
    const result = await linkAuthAccountToResident(TARGET_AUTH_ID, RESIDENT_ID);
    expect(result.success).toBe(true);
    expect(profileOf(TARGET_AUTH_ID).approval_status).toBe('active');
    // The 'resident' role was retired by #825: a plain resident holds no role.
    expect(profileOf(TARGET_AUTH_ID).role_id).toBeNull();
  });

  it('lets a chairman link a trustee account', async () => {
    seed({ caller: 'chairman', target: 'trustee', targetStatus: 'active' });
    expect((await linkAuthAccountToResident(TARGET_AUTH_ID, RESIDENT_ID)).success).toBe(true);
  });
});

describe('unlinkAuthAccount', () => {
  it('refuses a chairman unlinking a chairman account, and writes nothing', async () => {
    seed({ caller: 'chairman', target: 'chairman' });
    profileOf(TARGET_AUTH_ID).resident_id = RESIDENT_ID;
    expect(await unlinkAuthAccount(TARGET_AUTH_ID)).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
    expect(writesTo('profiles')).toEqual([]);
    expect(profileOf(TARGET_AUTH_ID).resident_id).toBe(RESIDENT_ID);
  });

  it('lets a chairman unlink an ordinary account', async () => {
    seed({ caller: 'chairman', target: 'secretary' });
    profileOf(TARGET_AUTH_ID).resident_id = RESIDENT_ID;
    expect(await unlinkAuthAccount(TARGET_AUTH_ID)).toEqual({ success: true });
    expect(profileOf(TARGET_AUTH_ID).resident_id).toBeNull();
  });
});

describe('resetUserTwoFactor', () => {
  it.each(['chairman', 'super_admin'] as const)(
    'refuses a chairman resetting a %s, and writes nothing',
    async (target) => {
      seed({ caller: 'chairman', target });
      const result = await resetUserTwoFactor(TARGET_AUTH_ID, 'lost phone');
      expect(result).toEqual({ success: false, message: CANNOT_CHANGE_ACCOUNT_ERROR });
      expect(state.writes).toEqual([]);
      expect(profileOf(TARGET_AUTH_ID).two_factor_enabled).toBe(true);
    }
  );

  it('lets a chairman reset an ordinary user and a trustee, and a super_admin reset a chairman', async () => {
    for (const target of ['secretary', 'trustee'] as const) {
      seed({ caller: 'chairman', target });
      expect((await resetUserTwoFactor(TARGET_AUTH_ID, 'lost phone')).success).toBe(true);
      expect(profileOf(TARGET_AUTH_ID).two_factor_enabled).toBe(false);
    }

    seed({ caller: 'super_admin', target: 'chairman' });
    expect((await resetUserTwoFactor(TARGET_AUTH_ID, 'lost phone')).success).toBe(true);
  });
});

describe('updateRole', () => {
  it.each(['super_admin', 'chairman', 'secretary'] as const)(
    'refuses a non-super_admin editing the %s role, and writes nothing',
    async (role) => {
      seed({ caller: 'chairman' });
      const result = await updateRole(ROLES[role].id as string, { display_name: 'Renamed' });
      expect(result.success).toBe(false);
      expect(writesTo('app_roles')).toEqual([]);
    }
  );

  it('still lets a non-super_admin edit a custom role', async () => {
    seed({ caller: 'chairman' });
    const result = await updateRole(ROLES.auditor.id as string, { display_name: 'Renamed' });
    expect(result.success).toBe(true);
  });

  it('lets a super_admin edit a system role', async () => {
    seed({ caller: 'super_admin' });
    const result = await updateRole(ROLES.chairman.id as string, { display_name: 'Renamed' });
    expect(result.success).toBe(true);
  });
});

describe('updateRolePermissions', () => {
  it.each(['super_admin', 'chairman', 'secretary'] as const)(
    'refuses a non-super_admin editing the %s role permissions, and writes nothing',
    async (role) => {
      seed({ caller: 'chairman' });
      const result = await updateRolePermissions(ROLES[role].id as string, ['p2']);
      expect(result.success).toBe(false);
      expect(writesTo('role_permissions')).toEqual([]);
    }
  );

  it("refuses editing the caller's own role's permissions", async () => {
    seed({ caller: 'treasurer' });
    const result = await updateRolePermissions(ROLES.treasurer.id as string, ['p2']);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/own role/);
    expect(writesTo('role_permissions')).toEqual([]);
  });

  it("lets a non-super_admin edit another custom role's permissions", async () => {
    seed({ caller: 'treasurer' });
    // #503: a caller may add only permissions they hold themselves.
    state.tables.app_permissions = [{ id: 'p2', name: 'x.view' }];
    state.auth.permissions = ['x.view'];
    const result = await updateRolePermissions(ROLES.auditor.id as string, ['p2']);
    expect(result.success).toBe(true);
    expect(
      state.tables.role_permissions.filter((r) => r.role_id === 'r-auditor').map((r) => r.permission_id)
    ).toEqual(['p2']);
  });

  it("lets a super_admin edit a system role and their own role's permissions", async () => {
    seed({ caller: 'super_admin' });
    expect((await updateRolePermissions(ROLES.chairman.id as string, ['p2'])).success).toBe(true);
    expect((await updateRolePermissions(ROLES.super_admin.id as string, ['p3'])).success).toBe(true);
  });
});

describe('lookup failures and unapproved callers refuse', () => {
  it('refuses when the caller profile cannot be found', async () => {
    seed({ caller: 'super_admin' });
    state.tables.profiles = state.tables.profiles.filter((p) => p.id !== 'caller');
    expect(await assertCanManageTarget('caller', TARGET_AUTH_ID)).toEqual({
      ok: false,
      error: CALLER_NOT_VERIFIED_ERROR,
    });
    expect(await assertCanGrantRoles('caller', ['secretary'])).toEqual({ ok: false, error: CALLER_NOT_VERIFIED_ERROR });
  });

  it('refuses when the caller lookup errors', async () => {
    seed({ caller: 'super_admin' });
    state.failProfileReads = ['caller'];
    expect(await assertCanManageTarget('caller', TARGET_AUTH_ID)).toEqual({
      ok: false,
      error: CALLER_NOT_VERIFIED_ERROR,
    });
    expect(await assertCanGrantRoles('caller', ['secretary'])).toEqual({ ok: false, error: CALLER_NOT_VERIFIED_ERROR });
  });

  it("refuses when the caller's permissions cannot be read, and writes nothing", async () => {
    seed({ caller: 'super_admin', target: 'secretary' });
    state.failPermissionReads = true;
    expect(await assertCanManageTarget('caller', TARGET_AUTH_ID)).toEqual({
      ok: false,
      error: CALLER_NOT_VERIFIED_ERROR,
    });
    expect(await assertCanGrantRoles('caller', ['secretary'])).toEqual({ ok: false, error: CALLER_NOT_VERIFIED_ERROR });
    expect((await assignRoleToProfile(TARGET_AUTH_ID, ROLES.auditor.id as string)).success).toBe(false);
    expect(writesTo('profiles')).toEqual([]);
  });

  it.each(['pending', 'suspended', 'rejected'])('gives a %s caller no permissions', async (status) => {
    seed({ caller: 'super_admin', target: 'secretary', callerStatus: status });
    expect(await assertCanManageTarget('caller', TARGET_AUTH_ID)).toEqual({
      ok: false,
      error: CANNOT_CHANGE_ACCOUNT_ERROR,
    });
    expect(await assertCanGrantRoles('caller', ['secretary'])).toEqual({ ok: false, error: CANNOT_GRANT_ROLE_ERROR });
  });

  it('ignores an inactive permission', async () => {
    seed({ caller: 'super_admin', target: 'chairman' });
    state.tables.app_permissions.find((p) => p.name === BOARD)!.is_active = false;
    expect(await assertCanManageTarget('caller', TARGET_AUTH_ID)).toEqual({
      ok: false,
      error: CANNOT_CHANGE_ACCOUNT_ERROR,
    });
    expect(await assertCanGrantRoles('caller', ['chairman'])).toEqual({ ok: false, error: CANNOT_GRANT_ROLE_ERROR });
  });

  it('refuses with "Account not found" when the target does not exist', async () => {
    seed({ caller: 'super_admin' });
    expect(await assertCanManageTarget('caller', 'missing')).toEqual({
      ok: false,
      error: 'Account not found',
    });
  });

  it('refuses with a distinct error when the target lookup errors', async () => {
    seed({ caller: 'super_admin' });
    state.failProfileReads = [TARGET_AUTH_ID];
    expect(await assertCanManageTarget('caller', TARGET_AUTH_ID)).toEqual({
      ok: false,
      error: 'Could not verify the account',
    });
  });

  it('stops a role assignment on a missing target or a failed lookup, with no write', async () => {
    seed({ caller: 'super_admin' });
    state.tables.profiles = state.tables.profiles.filter((p) => p.id !== TARGET_AUTH_ID);
    expect((await assignRoleToUser(TARGET_AUTH_ID, ROLES.auditor.id as string)).success).toBe(false);

    seed({ caller: 'super_admin' });
    state.failProfileReads = [TARGET_AUTH_ID];
    expect((await assignRoleToUser(TARGET_AUTH_ID, ROLES.auditor.id as string)).success).toBe(false);
    expect(writesTo('profiles')).toEqual([]);
  });
});

describe('linkAuthAccountToResident -- the one place "not found" is tolerated', () => {
  it('provisions a profile when none exists (accounts predating handle_new_user)', async () => {
    seed({ caller: 'chairman' });
    state.tables.profiles = state.tables.profiles.filter((p) => p.id !== TARGET_AUTH_ID);
    const result = await linkAuthAccountToResident(TARGET_AUTH_ID, RESIDENT_ID);
    expect(result.success).toBe(true);
    expect(writesTo('profiles').map((w) => w.op)).toEqual(['insert']);
  });

  it('does NOT tolerate a failed target lookup', async () => {
    seed({ caller: 'super_admin', target: 'chairman' });
    state.failProfileReads = [TARGET_AUTH_ID];
    const result = await linkAuthAccountToResident(TARGET_AUTH_ID, RESIDENT_ID);
    expect(result.success).toBe(false);
    expect(writesTo('profiles')).toEqual([]);
  });

  it('does NOT tolerate a failed caller permission lookup', async () => {
    seed({ caller: 'super_admin', target: null, targetStatus: 'pending' });
    state.failPermissionReads = true;
    const result = await linkAuthAccountToResident(TARGET_AUTH_ID, RESIDENT_ID);
    expect(result).toEqual({ success: false, error: CALLER_NOT_VERIFIED_ERROR });
    expect(writesTo('profiles')).toEqual([]);
  });
});

describe('role edits when the role is missing, or merely named super_admin', () => {
  it('refuses updateRole and updateRolePermissions for a role that does not exist', async () => {
    seed({ caller: 'chairman' });
    expect((await updateRole('r-missing', { display_name: 'x' })).success).toBe(false);
    expect((await updateRolePermissions('r-missing', ['p2'])).success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('refuses a non-super_admin editing a role named super_admin even when it is not flagged system', async () => {
    seed({ caller: 'chairman' });
    const id = ROLES.unflagged_super_admin.id as string;
    expect((await updateRole(id, { display_name: 'x' })).success).toBe(false);
    expect((await updateRolePermissions(id, ['p2'])).success).toBe(false);
    expect(writesTo('app_roles')).toEqual([]);
    expect(writesTo('role_permissions')).toEqual([]);
  });
});
