import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #503: the siblings of the #475 actions. Each action is driven against an
 * in-memory fake of the Supabase clients with a caller lacking the permission
 * (refused, and no write reached the "database") and a legitimate caller (still
 * works). The account guards (#826) read the caller's permissions from
 * role_permissions: super_admin holds system.assign_roles and
 * system.assign_board_roles, chairman holds system.assign_roles only.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; op: string; values?: Row | Row[] }>,
  /** Tables whose SELECTs fail with a database error. */
  failReads: [] as string[],
  auth: {
    authorized: true,
    userId: 'caller',
    roleName: 'treasurer' as string | null,
    roleId: '00000000-0000-4000-8000-0000000000a4' as string | null,
    permissions: [] as string[],
    error: null as string | null,
  },
  fetchNewEmails: vi.fn(),
  parseAllPendingEmails: vi.fn(),
  matchEmailTransactions: vi.fn(),
}));

function fakeFrom(table: string) {
  const filters: Array<[string, (v: unknown) => boolean]> = [];
  let op: 'select' | 'update' | 'insert' | 'delete' | 'upsert' = 'select';
  let values: Row | Row[] | undefined;

  const matching = () =>
    (state.tables[table] ?? []).filter((row) => filters.every(([col, test]) => test(row[col])));

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
      state.writes.push({ table, op, values });
      rows.forEach((row) => Object.assign(row, values));
      return rows;
    }
    if (op === 'insert' || op === 'upsert') {
      const inserted = Array.isArray(values) ? values : [values as Row];
      state.writes.push({ table, op, values });
      state.tables[table] = [...(state.tables[table] ?? []), ...inserted.map((v, i) => ({ id: `new-${i}`, ...v }))];
      return state.tables[table].slice(-inserted.length);
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
    upsert: (v: Row | Row[]) => ((op = 'upsert'), (values = v), builder),
    delete: () => ((op = 'delete'), builder),
    eq: (col: string, val: unknown) => (filters.push([col, (x) => x === val]), builder),
    in: (col: string, vals: unknown[]) => (filters.push([col, (x) => vals.includes(x)]), builder),
    neq: () => builder,
    is: () => builder,
    order: () => builder,
    limit: () => builder,
    single: async () => {
      if (op === 'select' && state.failReads.includes(table)) return { data: null, error: { message: 'db down' } };
      const rows = execute();
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } };
    },
    maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      op === 'select' && state.failReads.includes(table)
        ? resolve({ data: null, error: { message: 'db down' } })
        : resolve({ data: execute(), error: null }),
  };
  return builder;
}

const fakeClient = { from: fakeFrom };

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
vi.mock('@/actions/email-imports/fetch-emails', () => ({ fetchNewEmails: state.fetchNewEmails }));
vi.mock('@/lib/email-imports/parse-email', () => ({ parseAllPendingEmails: state.parseAllPendingEmails }));
vi.mock('@/lib/email-imports/process-email-matching', () => ({
  matchEmailTransactions: state.matchEmailTransactions,
}));

import { removeRoleFromProfile } from '@/actions/roles/assign-role';
import { CANNOT_CHANGE_ACCOUNT_ERROR } from '@/lib/auth/account-guards';
import { createRole, createRoleWithPermissions, updateRole, updateRolePermissions } from '@/actions/roles/index';
import { updateRoleAssignmentRule, batchUpdateRoleAssignmentRules } from '@/actions/roles/assignment-rules';
import { toggleImpersonationEnabled } from '@/actions/impersonation/approval';

const TARGET = '22222222-2222-4222-8222-222222222222';

const ROLES: Record<string, Row> = {
  super_admin: { id: '00000000-0000-4000-8000-0000000000a1', name: 'super_admin', display_name: 'Super Admin', is_active: true, is_system_role: true },
  chairman: { id: '00000000-0000-4000-8000-0000000000a2', name: 'chairman', display_name: 'Chairman', is_active: true, is_system_role: true },
  secretary: { id: '00000000-0000-4000-8000-0000000000a3', name: 'secretary', display_name: 'Secretary', is_active: true, is_system_role: true },
  treasurer: { id: '00000000-0000-4000-8000-0000000000a4', name: 'treasurer', display_name: 'Treasurer', is_active: true, is_system_role: false },
  auditor: { id: '00000000-0000-4000-8000-0000000000a5', name: 'auditor', display_name: 'Auditor', is_active: true, is_system_role: false },
  trustee: { id: '00000000-0000-4000-8000-0000000000a6', name: 'trustee', display_name: 'Trustee', is_active: true, is_system_role: true },
};

const PERMS: Row[] = [
  { id: 'p-view', name: 'x.view', is_active: true },
  { id: 'p-edit', name: 'x.edit', is_active: true },
  { id: 'p-admin', name: 'x.admin', is_active: true },
  { id: 'p-assign', name: 'system.assign_roles', is_active: true },
  { id: 'p-board', name: 'system.assign_board_roles', is_active: true },
];

function seed(caller: keyof typeof ROLES, target: keyof typeof ROLES | null = 'secretary', callerPerms: string[] = []) {
  state.writes = [];
  state.failReads = [];
  state.tables = {
    app_roles: Object.values(ROLES).map((r) => ({ ...r })),
    app_permissions: PERMS.map((p) => ({ ...p })),
    // the custom auditor role already holds x.admin, which no non-super_admin caller below does
    role_permissions: [
      { role_id: '00000000-0000-4000-8000-0000000000a5', permission_id: 'p-admin' },
      { role_id: '00000000-0000-4000-8000-0000000000a1', permission_id: 'p-assign' },
      { role_id: '00000000-0000-4000-8000-0000000000a1', permission_id: 'p-board' },
      { role_id: '00000000-0000-4000-8000-0000000000a2', permission_id: 'p-assign' },
    ],
    role_assignment_rules: [],
    profiles: [
      { id: 'caller', email: 'c@example.test', full_name: 'Caller', role_id: ROLES[caller].id, approval_status: 'active' },
      {
        id: TARGET,
        email: 't@example.test',
        full_name: 'Target',
        role_id: target ? ROLES[target].id : null,
        resident_id: 'res-1',
        approval_status: 'active',
        impersonation_enabled: false,
      },
    ],
  };
  state.auth = {
    authorized: true,
    userId: 'caller',
    roleName: caller as string,
    roleId: ROLES[caller].id as string,
    permissions: callerPerms,
    error: null,
  };
}

const writesTo = (table: string) => state.writes.filter((w) => w.table === table);
const profileOf = (id: string) => state.tables.profiles.find((p) => p.id === id)!;

beforeEach(() => {
  seed('treasurer');
  state.fetchNewEmails.mockReset().mockResolvedValue({ success: true, importId: 'imp-1', emailsFetched: 1 });
  state.parseAllPendingEmails.mockReset().mockResolvedValue({ messagesParsed: 1 });
  state.matchEmailTransactions.mockReset().mockResolvedValue({ matched: 1 });
});

describe('removeRoleFromProfile', () => {
  it.each(['treasurer', 'chairman'] as const)('refuses a %s removing a chairman role, and writes nothing', async (caller) => {
    seed(caller, 'chairman');
    const result = await removeRoleFromProfile(TARGET);
    expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
    expect(writesTo('profiles')).toEqual([]);
    expect(profileOf(TARGET).role_id).toBe('00000000-0000-4000-8000-0000000000a2');
  });

  it('still refuses removing super_admin, even for a super_admin', async () => {
    seed('super_admin', 'super_admin');
    const result = await removeRoleFromProfile(TARGET);
    expect(result).toEqual({ success: false, error: 'Cannot remove the Super Administrator role' });
    expect(writesTo('profiles')).toEqual([]);
  });

  it('still lets a chairman remove an ordinary role (a resident-linked account drops to no role, still active)', async () => {
    seed('chairman', 'secretary');
    expect(await removeRoleFromProfile(TARGET)).toEqual({ success: true });
    expect(profileOf(TARGET).role_id).toBeNull();
    expect(profileOf(TARGET).approval_status).toBe('active');
  });

  it('still lets a super_admin remove a chairman role', async () => {
    seed('super_admin', 'chairman');
    expect((await removeRoleFromProfile(TARGET)).success).toBe(true);
  });

  it('refuses when the caller permissions cannot be read, and writes nothing', async () => {
    seed('super_admin', 'secretary');
    state.failReads = ['role_permissions'];
    expect((await removeRoleFromProfile(TARGET)).success).toBe(false);
    expect(writesTo('profiles')).toEqual([]);
  });
});

describe('createRole', () => {
  const input = { name: 'auditor', display_name: 'Auditor' };

  it('ignores a client-supplied is_system_role', async () => {
    seed('chairman');
    const result = await createRole({ ...input, is_system_role: true });
    expect(result.success).toBe(true);
    expect((writesTo('app_roles')[0].values as Row).is_system_role).toBe(false);
  });

  it.each(['super_admin', 'chairman', ' Chairman ', 'SUPER_ADMIN', 'ChAiRmAn'])(
    'refuses the reserved name %j and writes nothing',
    async (name) => {
      seed('super_admin');
      const result = await createRole({ name, display_name: 'x' });
      expect(result.success).toBe(false);
      expect(writesTo('app_roles')).toEqual([]);
    }
  );

  it('refuses a blank name', async () => {
    seed('chairman');
    expect((await createRole({ name: '   ', display_name: 'x' })).success).toBe(false);
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('writes the trimmed name and does not pass unknown client fields through', async () => {
    seed('chairman');
    await createRole({ ...input, name: '  auditor ', id: 'forged' } as never);
    const written = writesTo('app_roles')[0].values as Row;
    expect(written.name).toBe('auditor');
    expect(written.id).toBeUndefined();
  });
});

describe('createRoleWithPermissions', () => {
  const input = { name: 'auditor', display_name: 'Auditor' };

  it('refuses a non-super_admin attaching a permission they do not hold, and creates no role', async () => {
    seed('chairman', 'secretary', ['system.manage_roles', 'x.view']);
    const result = await createRoleWithPermissions(input, ['p-view', 'p-admin']);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/do not hold/);
    expect(writesTo('app_roles')).toEqual([]);
    expect(writesTo('role_permissions')).toEqual([]);
  });

  it('refuses a permission id that resolves to nothing', async () => {
    seed('chairman', 'secretary', ['x.view']);
    const result = await createRoleWithPermissions(input, ['p-view', 'p-missing']);
    expect(result.success).toBe(false);
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('lets a non-super_admin attach permissions they hold', async () => {
    seed('chairman', 'secretary', ['x.view', 'x.edit']);
    const result = await createRoleWithPermissions(input, ['p-view', 'p-edit']);
    expect(result.success).toBe(true);
    expect(writesTo('role_permissions')).toHaveLength(2);
  });

  it('lets a super_admin attach any permission', async () => {
    seed('super_admin', 'secretary', []);
    const result = await createRoleWithPermissions(input, ['p-view', 'p-admin']);
    expect(result.success).toBe(true);
  });

  it('lets anyone create a role with no permissions', async () => {
    seed('chairman', 'secretary', []);
    expect((await createRoleWithPermissions(input, [])).success).toBe(true);
  });

  it('refuses a reserved name even for a super_admin', async () => {
    seed('super_admin');
    const result = await createRoleWithPermissions({ name: 'Chairman', display_name: 'x' }, []);
    expect(result.success).toBe(false);
    expect(writesTo('app_roles')).toEqual([]);
  });
});

describe('role assignment rules', () => {
  it.each(['chairman', 'super_admin', 'trustee'] as const)(
    'refuses a chairman allowing a rule that assigns %s, and writes nothing',
    async (role) => {
      seed('chairman');
      const single = await updateRoleAssignmentRule('tenant' as never, ROLES[role].id as string, true);
      const batch = await batchUpdateRoleAssignmentRules([
        { residentRole: 'tenant' as never, appRoleId: ROLES.secretary.id as string, isAllowed: true },
        { residentRole: 'tenant' as never, appRoleId: ROLES[role].id as string, isAllowed: true },
      ]);
      expect(single.success).toBe(false);
      expect(batch.success).toBe(false);
      expect(writesTo('role_assignment_rules')).toEqual([]);
    }
  );

  it('refuses a rule naming a role that does not exist', async () => {
    seed('chairman');
    expect((await updateRoleAssignmentRule('tenant' as never, 'r-missing', true)).success).toBe(false);
    expect(writesTo('role_assignment_rules')).toEqual([]);
  });

  it('still lets a chairman allow an ordinary role, and disallow a top role', async () => {
    seed('chairman');
    expect((await updateRoleAssignmentRule('tenant' as never, ROLES.secretary.id as string, true)).success).toBe(true);
    expect((await updateRoleAssignmentRule('tenant' as never, ROLES.chairman.id as string, false)).success).toBe(true);
    expect(
      (
        await batchUpdateRoleAssignmentRules([
          { residentRole: 'tenant' as never, appRoleId: ROLES.chairman.id as string, isAllowed: false },
          { residentRole: 'tenant' as never, appRoleId: ROLES.treasurer.id as string, isAllowed: true },
        ])
      ).success
    ).toBe(true);
  });

  it('lets a super_admin allow a chairman rule', async () => {
    seed('super_admin');
    expect((await updateRoleAssignmentRule('tenant' as never, ROLES.chairman.id as string, true)).success).toBe(true);
    expect(
      (
        await batchUpdateRoleAssignmentRules([
          { residentRole: 'tenant' as never, appRoleId: ROLES.chairman.id as string, isAllowed: true },
        ])
      ).success
    ).toBe(true);
  });
});

describe('toggleImpersonationEnabled', () => {
  it.each(['chairman', 'treasurer'] as const)('refuses a %s holding the permission, and writes nothing', async (caller) => {
    seed(caller, 'secretary');
    const result = await toggleImpersonationEnabled(TARGET, true);
    expect(result.success).toBe(false);
    expect(writesTo('profiles')).toEqual([]);
    expect(profileOf(TARGET).impersonation_enabled).toBe(false);
  });

  it('lets a super_admin toggle it', async () => {
    seed('super_admin', 'secretary');
    expect((await toggleImpersonationEnabled(TARGET, true)).success).toBe(true);
    expect(profileOf(TARGET).impersonation_enabled).toBe(true);
  });
});

describe('createRole category', () => {
  const base = { name: 'auditor', display_name: 'Auditor' };

  it('refuses an unknown category and writes nothing', async () => {
    seed('chairman');
    expect((await createRole({ ...base, category: 'wizard' as never })).success).toBe(false);
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('keeps a legitimate category and never writes the dropped level column (#826)', async () => {
    seed('chairman');
    const result = await createRole({ ...base, category: 'exco', level: 3 } as never);
    expect(result.success).toBe(true);
    expect((writesTo('app_roles')[0].values as Row).category).toBe('exco');
    expect(writesTo('app_roles')[0].values).not.toHaveProperty('level');
  });
});

describe('updateRolePermissions escalation', () => {
  const auditor = ROLES.auditor.id as string;

  it('refuses a non-super_admin adding a permission they do not hold, and changes nothing', async () => {
    seed('treasurer', 'secretary', ['x.view']);
    const result = await updateRolePermissions(auditor, ['p-admin', 'p-edit']);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/do not hold/);
    expect(writesTo('role_permissions')).toEqual([]);
  });

  it('refuses a permission id that resolves to nothing', async () => {
    seed('treasurer', 'secretary', ['x.view']);
    expect((await updateRolePermissions(auditor, ['p-missing'])).success).toBe(false);
    expect(writesTo('role_permissions')).toEqual([]);
  });

  it('lets a non-super_admin add permissions they hold', async () => {
    seed('treasurer', 'secretary', ['x.view', 'x.edit', 'x.admin']);
    expect((await updateRolePermissions(auditor, ['p-view', 'p-edit'])).success).toBe(true);
  });

  it('lets a non-super_admin keep or remove a permission they do not hold', async () => {
    seed('treasurer', 'secretary', ['x.view']);
    // p-admin is already on the role (kept), p-view is new but held
    expect((await updateRolePermissions(auditor, ['p-admin', 'p-view'])).success).toBe(true);
    seed('treasurer', 'secretary', []);
    // removing everything adds nothing
    expect((await updateRolePermissions(auditor, [])).success).toBe(true);
  });

  it('lets a super_admin add any permission', async () => {
    seed('super_admin', 'secretary', []);
    expect((await updateRolePermissions(auditor, ['p-admin', 'p-edit'])).success).toBe(true);
  });

  it('closes the create-empty-then-edit route around createRoleWithPermissions', async () => {
    seed('chairman', 'secretary', ['x.view']);
    const created = await createRoleWithPermissions({ name: 'sneaky', display_name: 'Sneaky' }, []);
    expect(created.success).toBe(true);
    const newRoleId = (state.tables.app_roles.find((r) => r.name === 'sneaky') as Row).id as string;
    expect((await updateRolePermissions(newRoleId, ['p-admin'])).success).toBe(false);
    expect(writesTo('role_permissions')).toEqual([]);
  });
});

describe('role name guard (shared by createRole, createRoleWithPermissions, updateRole)', () => {
  const reservedVariants = [
    'super_admin',
    'Chairman',
    'ｃｈａｉｒｍａｎ', // fullwidth, folds to chairman under NFKC
    'chair​man', // zero-width space
    'super⁠_admin', // word joiner
    '﻿chairman', // BOM
    'chair\u0007man', // control character
    ' admin ',
    'financial_secretary',
    'financial_officer',
    'vice_chairman',
    'Secretary',
    'resident', // retired by #825, reserved by the static list
  ];

  it.each(reservedVariants)('createRole refuses %j and writes nothing', async (name) => {
    seed('super_admin');
    const result = await createRole({ name, display_name: 'x' });
    expect(result).toEqual({ success: false, error: 'That role name is reserved' });
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('createRoleWithPermissions refuses a look-alike name and creates nothing', async () => {
    seed('super_admin');
    const result = await createRoleWithPermissions({ name: 'chair​man', display_name: 'x' }, ['p-view']);
    expect(result).toEqual({ success: false, error: 'That role name is reserved' });
    expect(writesTo('app_roles')).toEqual([]);
    expect(writesTo('role_permissions')).toEqual([]);
  });

  it('reads system role names from the database, so a newly seeded system role is protected', async () => {
    seed('chairman');
    state.tables.app_roles.push({ id: 'r-new', name: 'Bursar', display_name: 'Bursar', is_active: true, is_system_role: true });
    expect((await createRole({ name: 'bursar', display_name: 'x' })).error).toBe('That role name is reserved');
  });

  it('refuses when the system role names cannot be read', async () => {
    seed('chairman');
    state.failReads = ['app_roles'];
    const result = await createRole({ name: 'auditor', display_name: 'x' });
    expect(result).toEqual({ success: false, error: 'Could not verify the role name' });
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('stores the cleaned name and still accepts an ordinary one', async () => {
    seed('chairman');
    const result = await createRole({ name: ' audi​tor ', display_name: 'Auditor' });
    expect(result.success).toBe(true);
    expect((writesTo('app_roles')[0].values as Row).name).toBe('auditor');
  });
});

describe('updateRole on a custom role', () => {
  const auditor = ROLES.auditor.id as string;

  it('never writes is_system_role or fields outside the whitelist', async () => {
    seed('chairman');
    const result = await updateRole(auditor, {
      display_name: 'Renamed',
      is_system_role: true,
      id: 'forged',
      created_by: 'forged',
      level: 0,
    } as never);
    expect(result.success).toBe(true);
    expect(writesTo('app_roles')[0].values).toEqual({ display_name: 'Renamed' });
  });

  it('refuses an unknown category and writes nothing', async () => {
    seed('chairman');
    expect((await updateRole(auditor, { category: 'wizard' as never })).success).toBe(false);
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('keeps the legitimate values the form sends', async () => {
    seed('chairman');
    const body = { display_name: 'X', description: null, category: 'staff' as const, is_active: false };
    expect((await updateRole(auditor, body)).success).toBe(true);
    expect(writesTo('app_roles')[0].values).toEqual(body);
  });

  it('refuses a rename to a reserved or blank name, and writes nothing', async () => {
    seed('chairman');
    for (const name of ['chair​man', 'secretary', '   ']) {
      expect((await updateRole(auditor, { name } as never)).success).toBe(false);
    }
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('allows a rename to a free name, stored cleaned', async () => {
    seed('chairman');
    expect((await updateRole(auditor, { name: ' inspector ' } as never)).success).toBe(true);
    expect((writesTo('app_roles')[0].values as Row).name).toBe('inspector');
  });

  it('refuses a non-super_admin editing the role they hold, and writes nothing', async () => {
    seed('treasurer');
    const result = await updateRole(ROLES.treasurer.id as string, { display_name: 'Mine' });
    expect(result).toEqual({ success: false, error: 'You cannot edit your own role' });
    expect(writesTo('app_roles')).toEqual([]);
  });
});

describe('error text and no-write guarantees for refusals', () => {
  it('a refused batch writes nothing, even for the legitimate rows in it', async () => {
    seed('chairman');
    const result = await batchUpdateRoleAssignmentRules([
      { residentRole: 'tenant' as never, appRoleId: ROLES.secretary.id as string, isAllowed: true },
      { residentRole: 'tenant' as never, appRoleId: ROLES.treasurer.id as string, isAllowed: true },
      { residentRole: 'tenant' as never, appRoleId: ROLES.chairman.id as string, isAllowed: true },
    ]);
    expect(result).toEqual({
      success: false,
      error: 'You cannot allow a rule to assign a role that you could not assign yourself',
    });
    expect(state.writes).toEqual([]);
    expect(state.tables.role_assignment_rules).toEqual([]);
  });

  it('a failed role lookup in the rule check refuses with its exact message', async () => {
    seed('chairman');
    state.failReads = ['app_roles'];
    expect(await updateRoleAssignmentRule('tenant' as never, ROLES.secretary.id as string, true)).toEqual({
      success: false,
      error: 'Could not verify the roles in this rule',
    });
    expect(
      await batchUpdateRoleAssignmentRules([
        { residentRole: 'tenant' as never, appRoleId: ROLES.secretary.id as string, isAllowed: true },
      ])
    ).toEqual({ success: false, error: 'Could not verify the roles in this rule' });
    expect(writesTo('role_assignment_rules')).toEqual([]);
  });

  it('an unknown role in a rule is refused with "Role not found"', async () => {
    seed('chairman');
    expect(await updateRoleAssignmentRule('tenant' as never, 'r-missing', true)).toEqual({
      success: false,
      error: 'Role not found',
    });
  });

  it('a failed permission lookup refuses createRoleWithPermissions with its exact message', async () => {
    seed('chairman', 'secretary', ['x.view']);
    state.failReads = ['app_permissions'];
    expect(await createRoleWithPermissions({ name: 'auditor', display_name: 'A' }, ['p-view'])).toEqual({
      success: false,
      error: 'Could not verify the requested permissions',
    });
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('an unknown permission id is refused with the grant message, not accepted', async () => {
    seed('chairman', 'secretary', ['x.view']);
    expect(await createRoleWithPermissions({ name: 'auditor', display_name: 'A' }, ['p-missing'])).toEqual({
      success: false,
      error: 'Only Super Administrator can grant permissions you do not hold yourself',
    });
  });
});
