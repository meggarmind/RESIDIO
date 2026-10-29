import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #1318: the Roles tab's server actions. Each action runs against an
 * in-memory fake of the two Supabase clients, and the tests assert on the rows
 * left in the "database" and the writes that reached it, not on return values alone.
 */

type Row = Record<string, unknown>;
type Write = { table: string; op: string; values?: Row | Row[] };

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as Write[],
  /** "table:op" pairs that fail with a database error, e.g. "role_permissions:upsert". */
  fail: [] as string[],
  /** Error code an app_roles insert or update fails with. */
  roleWriteErrorCode: null as string | null,
  /** Rows each role_permissions page read returned, to prove the read is paged. */
  pageSizes: [] as number[],
  auth: {
    authorized: true,
    userId: 'caller',
    roleName: 'super_admin' as string | null,
    roleId: 'r-sa' as string | null,
    permissions: [] as string[],
    error: null as string | null,
  },
}));

function fakeFrom(table: string) {
  const tests: Array<(row: Row) => boolean> = [];
  let op: 'select' | 'insert' | 'upsert' | 'update' | 'delete' = 'select';
  let values: Row | Row[] | undefined;
  let head = false;
  let range: [number, number] | null = null;

  const failing = () => state.fail.includes(`${table}:${op}`);
  const matching = () => (state.tables[table] ?? []).filter((row) => tests.every((t) => t(row)));

  const run = (): { data: Row[] | null; error: { message: string; code?: string } | null; count?: number } => {
    if (failing()) return { data: null, error: { message: `${table} ${op} failed` } };
    if (table === 'app_roles' && (op === 'insert' || op === 'update') && state.roleWriteErrorCode) {
      return { data: null, error: { code: state.roleWriteErrorCode, message: 'duplicate key' } };
    }
    if (op === 'insert' || op === 'upsert') {
      const rows = (Array.isArray(values) ? values : [values as Row]).map((v, i) => ({ id: `new-${table}-${i}`, ...v }));
      state.writes.push({ table, op, values });
      state.tables[table] = [...(state.tables[table] ?? []), ...rows];
      return { data: rows, error: null };
    }
    const rows = matching();
    if (op === 'update') {
      state.writes.push({ table, op, values });
      rows.forEach((r) => Object.assign(r, values));
      return { data: rows, error: null };
    }
    if (op === 'delete') {
      state.writes.push({ table, op });
      state.tables[table] = (state.tables[table] ?? []).filter((r) => !rows.includes(r));
      return { data: rows, error: null };
    }
    if (head) return { data: null, count: rows.length, error: null };
    const out = rows.map((r) =>
      table === 'admin_titles'
        ? { ...r, app_roles: (state.tables.app_roles ?? []).find((x) => x.id === r.role_id) ?? null }
        : { ...r }
    );
    if (range) {
      const page = out.slice(range[0], range[1] + 1);
      if (table === 'role_permissions') state.pageSizes.push(page.length);
      return { data: page, error: null };
    }
    // An unpaged read is capped like PostgREST's max_rows, so a missing .range() loop shows.
    return { data: out.slice(0, DEFAULT_PAGE_SIZE), error: null };
  };

  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), builder),
    insert: (v: Row | Row[]) => ((op = 'insert'), (values = v), builder),
    upsert: (v: Row | Row[]) => ((op = 'upsert'), (values = v), builder),
    update: (v: Row) => ((op = 'update'), (values = v), builder),
    delete: () => ((op = 'delete'), builder),
    eq: (c: string, v: unknown) => (tests.push((r) => r[c] === v), builder),
    in: (c: string, vs: unknown[]) => (tests.push((r) => vs.includes(r[c])), builder),
    not: (c: string) => (tests.push((r) => r[c] != null), builder),
    order: () => builder,
    range: (from: number, to: number) => ((range = [from, to]), builder),
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
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: async () => state.auth,
  authorizeAnyPermission: async () => state.auth,
}));
const logAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));

import {
  createRole,
  deleteRole,
  getRolesWithPermissions,
  updateRole,
  updateRolePermissions,
} from '@/actions/roles/index';
import { createAdminTitle, deleteAdminTitle, getAdminTitles, updateAdminTitle } from '@/actions/roles/titles';
import { DEFAULT_PAGE_SIZE } from '@/lib/supabase/fetch-all-rows';

const SA = '00000000-0000-4000-8000-000000000001';
const CHAIR = '00000000-0000-4000-8000-000000000002';
const AUDITOR = '00000000-0000-4000-8000-000000000003';
const TREASURER = '00000000-0000-4000-8000-000000000004';
const INSPECTOR = '00000000-0000-4000-8000-000000000005';

function seed() {
  state.writes = [];
  state.fail = [];
  state.roleWriteErrorCode = null;
  state.pageSizes = [];
  state.auth = { authorized: true, userId: 'caller', roleName: 'super_admin', roleId: SA, permissions: [], error: null };
  logAudit.mockClear();
  state.tables = {
    app_roles: [
      { id: SA, name: 'super_admin', display_name: 'Super Admin', is_system_role: true, is_active: true },
      { id: CHAIR, name: 'chairman', display_name: 'Chairman', is_system_role: true, is_active: true },
      { id: AUDITOR, name: 'auditor', display_name: 'Auditor', is_system_role: false, is_active: true },
      { id: TREASURER, name: 'treasurer', display_name: 'Treasurer', is_system_role: false, is_active: true },
      { id: INSPECTOR, name: 'inspector', display_name: 'Inspector', is_system_role: false, is_active: false },
    ],
    app_permissions: [
      { id: 'p-view', name: 'x.view', display_name: 'View', is_active: true, category: 'x' },
      { id: 'p-edit', name: 'x.edit', display_name: 'Edit', is_active: true, category: 'x' },
      { id: 'p-new', name: 'x.new', display_name: 'New', is_active: true, category: 'x' },
      { id: 'p-old', name: 'x.old', display_name: 'Old', is_active: false, category: 'x' },
    ],
    role_permissions: [
      { id: 'rp1', role_id: AUDITOR, permission_id: 'p-view' },
      { id: 'rp2', role_id: AUDITOR, permission_id: 'p-edit' },
      { id: 'rp3', role_id: AUDITOR, permission_id: 'p-old' },
    ],
    admin_titles: [
      { id: 't-chair', role_id: CHAIR, name: 'Chairman', is_principal: true, seats: 1, sort_order: 0 },
      { id: 't-vice', role_id: CHAIR, name: 'Vice Chairman', is_principal: false, seats: 1, sort_order: 1 },
      { id: 't-lead', role_id: AUDITOR, name: 'Lead Auditor', is_principal: false, seats: 2, sort_order: 0 },
      { id: 't-junior', role_id: AUDITOR, name: 'Junior Auditor', is_principal: false, seats: null, sort_order: 1 },
    ],
    profiles: [{ id: 'caller', role_id: SA, title_id: null, approval_status: 'active' }],
    role_assignment_rules: [],
  };
}

const grantsOf = (roleId: string) =>
  state.tables.role_permissions
    .filter((r) => r.role_id === roleId)
    .map((r) => r.permission_id)
    .sort();
const writesTo = (table: string) => state.writes.filter((w) => w.table === table);
const asCaller = (roleName: string, roleId: string) => {
  state.auth = { ...state.auth, roleName, roleId };
};

beforeEach(seed);

describe('updateRolePermissions: add first, then remove', () => {
  it('leaves the old grants intact when the insert fails, and deletes nothing', async () => {
    state.fail = ['role_permissions:upsert'];

    const result = await updateRolePermissions(AUDITOR, ['p-new']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not saved/);
    expect(writesTo('role_permissions').filter((w) => w.op === 'delete')).toEqual([]);
    expect(grantsOf(AUDITOR)).toEqual(['p-edit', 'p-old', 'p-view']);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('inserts only the added grants and deletes only the removed ones', async () => {
    const result = await updateRolePermissions(AUDITOR, ['p-view', 'p-new']);

    expect(result).toEqual({ success: true });
    const upserts = writesTo('role_permissions').filter((w) => w.op === 'upsert');
    expect(upserts).toHaveLength(1);
    expect((upserts[0].values as Row[]).map((v) => v.permission_id)).toEqual(['p-new']);
    // p-edit removed; p-view kept; p-old is inactive, so the picker never offered it and it stays.
    expect(grantsOf(AUDITOR)).toEqual(['p-new', 'p-old', 'p-view']);
  });

  it('keeps a grant to an inactive permission when the role is saved without it', async () => {
    expect((await updateRolePermissions(AUDITOR, [])).success).toBe(true);
    expect(grantsOf(AUDITOR)).toEqual(['p-old']);
  });

  it('refuses before writing when it cannot tell which permissions are inactive', async () => {
    state.fail = ['app_permissions:select'];
    expect((await updateRolePermissions(AUDITOR, ['p-view'])).success).toBe(false);
    expect(writesTo('role_permissions')).toEqual([]);
    expect(grantsOf(AUDITOR)).toEqual(['p-edit', 'p-old', 'p-view']);
  });

  it('refuses before writing when the current grants cannot be read', async () => {
    state.fail = ['role_permissions:select'];
    expect((await updateRolePermissions(AUDITOR, ['p-new'])).success).toBe(false);
    expect(writesTo('role_permissions')).toEqual([]);
  });

  it('reports a failed removal after a saved addition, and never drops below what was asked', async () => {
    state.fail = ['role_permissions:delete'];

    const result = await updateRolePermissions(AUDITOR, ['p-view', 'p-new']);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/added permissions were saved/);
    expect(grantsOf(AUDITOR)).toEqual(['p-edit', 'p-new', 'p-old', 'p-view']);
    // The insert that did happen is audited.
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'role_permissions' }));
  });

  it('writes and audits nothing when nothing changed', async () => {
    expect(await updateRolePermissions(AUDITOR, ['p-view', 'p-edit'])).toEqual({ success: true });
    expect(state.writes).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('getRolesWithPermissions', () => {
  it('pages role_permissions and counts only active permissions', async () => {
    // More grants than a page holds (two roles share 600 permissions), while the
    // permission list itself stays under one page.
    const BULK = 600;
    state.tables.app_permissions.push(
      ...Array.from({ length: BULK }, (_, i) => ({ id: `bulk-${i}`, name: `b.${i}`, is_active: true }))
    );
    for (const roleId of [TREASURER, INSPECTOR]) {
      state.tables.role_permissions.push(
        ...Array.from({ length: BULK }, (_, i) => ({ id: `rp-${roleId}-${i}`, role_id: roleId, permission_id: `bulk-${i}` }))
      );
    }

    const result = await getRolesWithPermissions();

    expect(result.success).toBe(true);
    expect(state.pageSizes.length).toBeGreaterThan(1);
    const roles = new Map(result.data!.map((r) => [r.id, r]));
    expect(roles.get(TREASURER)!.permissions).toHaveLength(600);
    expect(roles.get(INSPECTOR)!.permissions).toHaveLength(600);
    // p-old is inactive: not counted, and not offered by the picker either.
    expect(roles.get(AUDITOR)!.permissions.map((p) => p.id).sort()).toEqual(['p-edit', 'p-view']);
  });

  it('returns the reason instead of an empty list when the grants cannot be read', async () => {
    state.fail = ['role_permissions:select'];
    const result = await getRolesWithPermissions();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });
});

describe('deleteRole and titles', () => {
  it('refuses while anyone holds a title under the role, whatever their status, and deletes nothing', async () => {
    state.tables.profiles.push({ id: 'p1', role_id: null, title_id: 't-lead', approval_status: 'pending' });

    const result = await deleteRole(AUDITOR);

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/hold a title/);
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('deletes a role whose titles nobody holds, and records the titles in the audit', async () => {
    const result = await deleteRole(AUDITOR);

    expect(result).toEqual({ success: true });
    expect(state.tables.app_roles.find((r) => r.id === AUDITOR)).toBeUndefined();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DELETE',
        entityType: 'app_roles',
        oldValues: expect.objectContaining({
          admin_titles: [
            expect.objectContaining({ id: 't-lead', name: 'Lead Auditor' }),
            expect.objectContaining({ id: 't-junior', name: 'Junior Auditor' }),
          ],
        }),
      })
    );
  });
});

describe('deleteAdminTitle', () => {
  it('refuses a title someone holds, and deletes nothing', async () => {
    state.tables.profiles.push({ id: 'p1', role_id: AUDITOR, title_id: 't-lead', approval_status: 'active' });

    const result = await deleteAdminTitle('t-lead');

    expect(result).toEqual({ success: false, error: '1 person holds this title. Remove it from them first.' });
    expect(writesTo('admin_titles')).toEqual([]);
  });

  it('lists holders of every status, labelling the ones that are not active', async () => {
    state.tables.profiles.push(
      { id: 'p1', full_name: 'Ada', role_id: AUDITOR, title_id: 't-lead', approval_status: 'active' },
      { id: 'p2', full_name: 'Bayo', role_id: AUDITOR, title_id: 't-lead', approval_status: 'suspended' }
    );

    const result = await getAdminTitles();

    expect(result.data?.find((t) => t.id === 't-lead')?.holders).toEqual([
      { profile_id: 'p1', name: 'Ada' },
      { profile_id: 'p2', name: 'Bayo (suspended)' },
    ]);
  });

  it('pages the holder read, so holders past max_rows are not dropped', async () => {
    state.tables.profiles.push(
      ...Array.from({ length: DEFAULT_PAGE_SIZE + 1 }, (_, i) => ({
        id: `h${i}`,
        full_name: `H${i}`,
        role_id: AUDITOR,
        title_id: 't-junior',
        approval_status: 'active',
      }))
    );

    const result = await getAdminTitles();

    expect(result.data?.find((t) => t.id === 't-junior')?.holders).toHaveLength(DEFAULT_PAGE_SIZE + 1);
  });

  it('refuses the principal title', async () => {
    expect((await deleteAdminTitle('t-chair')).success).toBe(false);
    expect(writesTo('admin_titles')).toEqual([]);
  });

  it('counts a holder of any status, as the seat rule in the database does', async () => {
    state.tables.profiles.push({ id: 'p1', role_id: AUDITOR, title_id: 't-lead', approval_status: 'pending' });

    expect((await deleteAdminTitle('t-lead')).success).toBe(false);
    expect(writesTo('admin_titles')).toEqual([]);
  });

  it('deletes a title nobody holds, and audits it', async () => {
    expect(await deleteAdminTitle('t-lead')).toEqual({ success: true });
    expect(state.tables.admin_titles.find((t) => t.id === 't-lead')).toBeUndefined();
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'DELETE', entityType: 'admin_titles', entityId: 't-lead' })
    );
  });

  it('writes nothing without system.manage_roles', async () => {
    state.auth = { ...state.auth, authorized: false, error: 'Unauthorized' };
    expect((await deleteAdminTitle('t-junior')).success).toBe(false);
    expect(state.writes).toEqual([]);
  });
});

describe('title rank guard', () => {
  it('refuses a non-super admin adding, editing or deleting a title of a system role', async () => {
    asCaller('treasurer', TREASURER);

    expect((await createAdminTitle({ role_id: CHAIR, name: 'Deputy', seats: 1 })).error).toBe(
      'Only Super Administrator can change the titles of system roles'
    );
    expect((await updateAdminTitle('t-vice', { name: 'Deputy', seats: 1 })).success).toBe(false);
    expect((await deleteAdminTitle('t-vice')).success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it("refuses a non-super admin changing the titles of their own role", async () => {
    asCaller('auditor', AUDITOR);

    expect((await createAdminTitle({ role_id: AUDITOR, name: 'Deputy', seats: 1 })).error).toBe(
      'You cannot change the titles of your own role'
    );
    expect((await updateAdminTitle('t-lead', { name: 'Head', seats: 2 })).success).toBe(false);
    expect((await deleteAdminTitle('t-junior')).success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('lets a non-super admin change the titles of another custom role', async () => {
    asCaller('treasurer', TREASURER);

    expect((await createAdminTitle({ role_id: AUDITOR, name: 'Deputy', seats: 1 })).success).toBe(true);
    expect((await updateAdminTitle('t-lead', { name: 'Head Auditor', seats: 2 })).success).toBe(true);
    expect((await deleteAdminTitle('t-junior')).success).toBe(true);
  });

  it('lets a super admin change the titles of a system role', async () => {
    expect((await updateAdminTitle('t-vice', { name: 'Deputy Chairman', seats: 1 })).success).toBe(true);
  });
});

describe('moving a title to another role', () => {
  it('moves a title nobody holds, to an inactive role too, and audits the move', async () => {
    const result = await updateAdminTitle('t-junior', { name: 'Junior Auditor', seats: null, role_id: INSPECTOR });

    expect(result.success).toBe(true);
    expect(state.tables.admin_titles.find((t) => t.id === 't-junior')?.role_id).toBe(INSPECTOR);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ oldValues: { role_id: AUDITOR }, newValues: { role_id: INSPECTOR } })
    );
  });

  it('refuses while anyone holds the title, whatever their status', async () => {
    state.tables.profiles.push({ id: 'p1', role_id: AUDITOR, title_id: 't-junior', approval_status: 'suspended' });

    const result = await updateAdminTitle('t-junior', { name: 'Junior Auditor', seats: null, role_id: INSPECTOR });

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/before moving it/);
    expect(writesTo('admin_titles')).toEqual([]);
  });

  it('refuses a non-super admin moving a title onto a system role', async () => {
    asCaller('treasurer', TREASURER);

    const result = await updateAdminTitle('t-junior', { name: 'Junior Auditor', seats: null, role_id: CHAIR });

    expect(result.success).toBe(false);
    expect(writesTo('admin_titles')).toEqual([]);
  });

  it('refuses moving a principal title', async () => {
    const result = await updateAdminTitle('t-chair', { name: 'Chairman', seats: 1, role_id: AUDITOR });
    expect(result.success).toBe(false);
    expect(writesTo('admin_titles')).toEqual([]);
  });
});

describe('title seats', () => {
  it.each([0, 100, 2.5])('refuses %s seats before touching the database', async (seats) => {
    expect((await createAdminTitle({ role_id: AUDITOR, name: 'Deputy', seats })).success).toBe(false);
    expect((await updateAdminTitle('t-lead', { name: 'Lead Auditor', seats })).success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('accepts 99 seats and unlimited', async () => {
    expect((await createAdminTitle({ role_id: AUDITOR, name: 'Deputy', seats: 99 })).success).toBe(true);
    expect((await updateAdminTitle('t-lead', { name: 'Lead Auditor', seats: null })).success).toBe(true);
  });
});

describe('role form fields on the server', () => {
  it('refuses a blank display name on create and update, and writes nothing', async () => {
    expect((await createRole({ name: 'bursar', display_name: '   ' })).error).toBe('Display name is required');
    expect((await updateRole(AUDITOR, { display_name: '' })).error).toBe('Display name is required');
    expect(writesTo('app_roles')).toEqual([]);
  });

  it('stores the trimmed display name and requires_resident', async () => {
    const result = await createRole({ name: 'bursar', display_name: '  Bursar ', requires_resident: true });

    expect(result.success).toBe(true);
    expect(writesTo('app_roles')[0].values).toEqual(
      expect.objectContaining({ display_name: 'Bursar', requires_resident: true })
    );
  });

  it('accepts requires_resident on a custom role update, and refuses a non-boolean', async () => {
    expect((await updateRole(AUDITOR, { requires_resident: true })).success).toBe(true);
    expect(writesTo('app_roles')[0].values).toEqual({ requires_resident: true });
    expect((await updateRole(AUDITOR, { requires_resident: 'yes' } as never)).success).toBe(false);
  });

  it('turns a unique violation into a readable message', async () => {
    state.roleWriteErrorCode = '23505';
    expect((await createRole({ name: 'bursar', display_name: 'Bursar' })).error).toBe(
      'A role with that name already exists'
    );
    expect((await updateRole(AUDITOR, { display_name: 'Auditor' })).error).toBe(
      'A role with that name already exists'
    );
  });
});
