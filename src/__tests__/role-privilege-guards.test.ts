import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #503: the siblings of the #475 actions. Each action is driven against an
 * in-memory fake of the Supabase clients with a lower-ranked caller (refused, and
 * no write reached the "database") and a legitimate caller (still works).
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; op: string; values?: Row | Row[] }>,
  auth: {
    authorized: true,
    userId: 'caller',
    roleName: 'treasurer' as string | null,
    roleId: 'r-treasurer' as string | null,
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
    rows.map((row) =>
      table === 'profiles'
        ? { ...row, app_roles: (state.tables.app_roles ?? []).find((r) => r.id === row.role_id) ?? null }
        : row
    );

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
      const rows = execute();
      return rows[0] ? { data: rows[0], error: null } : { data: null, error: { message: 'no rows' } };
    },
    maybeSingle: async () => ({ data: execute()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: execute(), error: null }),
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
vi.mock('@/actions/email-imports/parse-email', () => ({ parseAllPendingEmails: state.parseAllPendingEmails }));
vi.mock('@/actions/email-imports/process-email-import', () => ({
  matchEmailTransactions: state.matchEmailTransactions,
}));

import { removeRoleFromProfile } from '@/actions/roles/assign-role';
import { createRole, createRoleWithPermissions } from '@/actions/roles/index';
import { updateRoleAssignmentRule, batchUpdateRoleAssignmentRules } from '@/actions/roles/assignment-rules';
import { toggleImpersonationEnabled } from '@/actions/impersonation/approval';
import { checkPaymentEmails } from '@/actions/email-imports/check-payment';

const TARGET = '22222222-2222-4222-8222-222222222222';

const ROLES: Record<string, Row> = {
  super_admin: { id: 'r-sa', name: 'super_admin', display_name: 'Super Admin', is_active: true, is_system_role: true },
  chairman: { id: 'r-ch', name: 'chairman', display_name: 'Chairman', is_active: true, is_system_role: true },
  secretary: { id: 'r-sec', name: 'secretary', display_name: 'Secretary', is_active: true, is_system_role: true },
  resident: { id: 'r-res', name: 'resident', display_name: 'Resident', is_active: true, is_system_role: true },
  treasurer: { id: 'r-treasurer', name: 'treasurer', display_name: 'Treasurer', is_active: true, is_system_role: false },
};

const PERMS: Row[] = [
  { id: 'p-view', name: 'x.view' },
  { id: 'p-edit', name: 'x.edit' },
  { id: 'p-admin', name: 'x.admin' },
];

function seed(caller: keyof typeof ROLES, target: keyof typeof ROLES | null = 'secretary', callerPerms: string[] = []) {
  state.writes = [];
  state.tables = {
    app_roles: Object.values(ROLES).map((r) => ({ ...r })),
    app_permissions: PERMS.map((p) => ({ ...p })),
    role_permissions: [],
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
  it('refuses a lower-ranked caller removing a chairman role, and writes nothing', async () => {
    seed('treasurer', 'chairman');
    const result = await removeRoleFromProfile(TARGET);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/outranks/);
    expect(writesTo('profiles')).toEqual([]);
    expect(profileOf(TARGET).role_id).toBe('r-ch');
  });

  it('still refuses removing super_admin, even for a super_admin', async () => {
    seed('super_admin', 'super_admin');
    const result = await removeRoleFromProfile(TARGET);
    expect(result).toEqual({ success: false, error: 'Cannot remove the Super Administrator role' });
    expect(writesTo('profiles')).toEqual([]);
  });

  it('still lets a chairman remove an ordinary role (drops to resident)', async () => {
    seed('chairman', 'secretary');
    expect(await removeRoleFromProfile(TARGET)).toEqual({ success: true });
    expect(profileOf(TARGET).role_id).toBe('r-res');
  });

  it('still lets a super_admin remove a chairman role', async () => {
    seed('super_admin', 'chairman');
    expect((await removeRoleFromProfile(TARGET)).success).toBe(true);
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
  it.each(['chairman', 'super_admin'] as const)(
    'refuses a non-super_admin allowing a rule that assigns %s, and writes nothing',
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

describe('checkPaymentEmails', () => {
  it('refuses an unauthorised caller before any step of the pipeline runs', async () => {
    state.auth = { ...state.auth, authorized: false, error: 'Unauthorized: no permission' };
    const result = await checkPaymentEmails();
    expect(result.success).toBe(false);
    expect(state.fetchNewEmails).not.toHaveBeenCalled();
    expect(state.parseAllPendingEmails).not.toHaveBeenCalled();
    expect(state.matchEmailTransactions).not.toHaveBeenCalled();
  });

  it('runs the whole pipeline for an authorised caller', async () => {
    const result = await checkPaymentEmails();
    expect(result.success).toBe(true);
    expect(state.parseAllPendingEmails).toHaveBeenCalledWith('imp-1');
    expect(state.matchEmailTransactions).toHaveBeenCalledWith('imp-1');
  });
});
