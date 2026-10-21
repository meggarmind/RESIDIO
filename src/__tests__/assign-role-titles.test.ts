import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #827: assigning a role together with a title, and managing titles.
 * Drives the actions against an in-memory fake of the two Supabase clients and
 * asserts on the rows written and the audit entry, not on return values alone.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; op: string; values: Row }>,
  /** Postgres error code the next insert/update on admin_titles fails with. */
  titleWriteErrorCode: null as string | null,
  auth: { authorized: true, userId: 'caller', roleName: 'super_admin', roleId: 'r-sa', permissions: [] as string[], error: null as string | null },
}));

function fakeFrom(table: string) {
  const eqs: Array<[string, unknown]> = [];
  const neqs: Array<[string, unknown]> = [];
  const notNull: string[] = [];
  let op: 'select' | 'update' | 'insert' = 'select';
  let values: Row = {};
  let head = false;

  const matching = () =>
    (state.tables[table] ?? []).filter(
      (row) =>
        eqs.every(([c, v]) => row[c] === v) &&
        neqs.every(([c, v]) => row[c] !== v) &&
        notNull.every((c) => row[c] != null)
    );

  const run = () => {
    if (op === 'update') {
      if (table === 'admin_titles' && state.titleWriteErrorCode) {
        return { data: null, error: { code: state.titleWriteErrorCode, message: 'violation' } };
      }
      state.writes.push({ table, op, values });
      const rows = matching();
      rows.forEach((r) => Object.assign(r, values));
      return { data: rows, error: null };
    }
    if (op === 'insert') {
      if (table === 'admin_titles' && state.titleWriteErrorCode) {
        return { data: null, error: { code: state.titleWriteErrorCode, message: 'violation' } };
      }
      state.writes.push({ table, op, values });
      const row = { id: `new-${state.writes.length}`, sort_order: 0, ...values };
      state.tables[table] = [...(state.tables[table] ?? []), row];
      return { data: [row], error: null };
    }
    const rows = matching().map((r) =>
      table === 'admin_titles'
        ? { ...r, app_roles: (state.tables.app_roles ?? []).find((x) => x.id === r.role_id) ?? null }
        : { ...r } // a copy, as PostgREST returns: later writes must not rewrite what was read
    );
    return head ? { data: null, count: rows.length, error: null } : { data: rows, error: null };
  };

  const builder: Record<string, unknown> = {
    select: (_cols?: string, opts?: { head?: boolean }) => ((head = Boolean(opts?.head)), builder),
    update: (v: Row) => ((op = 'update'), (values = v), builder),
    insert: (v: Row) => ((op = 'insert'), (values = v), builder),
    eq: (c: string, v: unknown) => (eqs.push([c, v]), builder),
    neq: (c: string, v: unknown) => (neqs.push([c, v]), builder),
    not: (c: string) => (notNull.push(c), builder),
    in: () => builder,
    is: () => builder,
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
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: async () => state.auth,
  authorizeAnyPermission: async () => state.auth,
}));
const logAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('@/lib/auth/account-guards', () => ({
  assertCanManageTarget: async () => ({ ok: true, targetRoleName: null, targetApprovalStatus: 'active' }),
  assertCanGrantRoles: async () => ({ ok: true }),
}));
vi.mock('@/lib/auth/super-admin-invariant', () => ({
  isLastActiveSuperAdmin: async () => false,
  LAST_SUPER_ADMIN_ERROR: 'last super admin',
}));

import { assignRoleToProfile } from '@/actions/roles/assign-role';
import { createAdminTitle, getAdminTitles, updateAdminTitle } from '@/actions/roles/titles';

const CHAIRMAN = '11111111-1111-4111-8111-111111111111';
const SECRETARY = '22222222-2222-4222-8222-222222222222';
const VICE = 'title-vice';
const CHAIR_TITLE = 'title-chair';
const SECRETARY_TITLE = 'title-secretary';

const profileRow = (id: string) => state.tables.profiles.find((p) => p.id === id)!;

function seed(profiles: Row[] = []) {
  state.writes = [];
  state.titleWriteErrorCode = null;
  state.auth = { authorized: true, userId: 'caller', roleName: 'super_admin', roleId: 'r-sa', permissions: [], error: null };
  logAudit.mockClear();
  state.tables = {
    app_roles: [
      { id: CHAIRMAN, name: 'chairman', display_name: 'Chairman', is_active: true, requires_resident: true },
      { id: SECRETARY, name: 'secretary', display_name: 'Secretary', is_active: true, requires_resident: false },
    ],
    admin_titles: [
      { id: CHAIR_TITLE, role_id: CHAIRMAN, name: 'Chairman', is_principal: true, seats: 1, sort_order: 0 },
      { id: VICE, role_id: CHAIRMAN, name: 'Vice Chairman', is_principal: false, seats: 1, sort_order: 1 },
      { id: SECRETARY_TITLE, role_id: SECRETARY, name: 'Secretary', is_principal: true, seats: 1, sort_order: 0 },
    ],
    profiles: [
      { id: 'jane', email: 'jane@example.test', full_name: 'Jane Doe', role_id: null, title_id: null, resident_id: 'res-jane' },
      { id: 'noresident', email: 'nr@example.test', full_name: 'No Resident', role_id: null, title_id: null, resident_id: null },
      ...profiles,
    ],
  };
}

describe('assignRoleToProfile with a title (#827)', () => {
  beforeEach(() => seed());

  it('saves the role and title together and audits "Jane Doe (Vice Chairman)"', async () => {
    const result = await assignRoleToProfile('jane', CHAIRMAN, VICE);

    expect(result).toEqual({
      success: true,
      data: {
        profile_id: 'jane',
        role_id: CHAIRMAN,
        role_name: 'chairman',
        role_display_name: 'Chairman',
        title_id: VICE,
        title_name: 'Vice Chairman',
      },
    });
    expect(profileRow('jane')).toMatchObject({ role_id: CHAIRMAN, title_id: VICE });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ASSIGN',
        entityDisplay: 'Jane Doe (Vice Chairman)',
        newValues: expect.objectContaining({ title_id: VICE, title_name: 'Vice Chairman' }),
      })
    );
  });

  it('clears the old title when assigned without one', async () => {
    seed([{ id: 'pat', email: 'pat@example.test', full_name: 'Pat', role_id: CHAIRMAN, title_id: VICE, resident_id: 'res-pat' }]);

    const result = await assignRoleToProfile('pat', SECRETARY, null);

    expect(result.success).toBe(true);
    expect(profileRow('pat')).toMatchObject({ role_id: SECRETARY, title_id: null });
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityDisplay: 'Pat', oldValues: expect.objectContaining({ title_id: VICE }) })
    );
  });

  it('refuses a title that belongs to another role and writes nothing', async () => {
    const result = await assignRoleToProfile('jane', CHAIRMAN, SECRETARY_TITLE);

    expect(result).toEqual({ success: false, error: 'That title does not belong to this role' });
    expect(state.writes).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('refuses a title that does not exist', async () => {
    const result = await assignRoleToProfile('jane', CHAIRMAN, 'no-such-title');

    expect(result.success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('refuses a full title, names the holder, and writes nothing', async () => {
    seed([{ id: 'sam', email: 'sam@example.test', full_name: 'Sam Holder', role_id: CHAIRMAN, title_id: VICE, resident_id: 'res-sam' }]);

    const result = await assignRoleToProfile('jane', CHAIRMAN, VICE);

    expect(result).toEqual({
      success: false,
      error: 'Vice Chairman is already held by Sam Holder. Move them to another title first.',
    });
    expect(state.writes).toEqual([]);
    expect(profileRow('jane').title_id).toBeNull();
  });

  it('does not count the person\'s own seat against them', async () => {
    seed([{ id: 'sam', email: 'sam@example.test', full_name: 'Sam Holder', role_id: CHAIRMAN, title_id: VICE, resident_id: 'res-sam' }]);

    const result = await assignRoleToProfile('sam', CHAIRMAN, VICE);

    expect(result.success).toBe(true);
  });

  it('allows any number of holders when the title has no seat limit', async () => {
    seed([{ id: 'sam', email: 'sam@example.test', full_name: 'Sam', role_id: CHAIRMAN, title_id: VICE, resident_id: 'res-sam' }]);
    state.tables.admin_titles.find((t) => t.id === VICE)!.seats = null;

    expect((await assignRoleToProfile('jane', CHAIRMAN, VICE)).success).toBe(true);
  });

  it('refuses a resident-only role for an account with no resident record', async () => {
    const result = await assignRoleToProfile('noresident', CHAIRMAN, CHAIR_TITLE);

    expect(result.success).toBe(false);
    expect(result.error).toContain('can only be held by a resident');
    expect(state.writes).toEqual([]);
  });

  it('still lets an account with no resident record hold a role that does not need one', async () => {
    const result = await assignRoleToProfile('noresident', SECRETARY, SECRETARY_TITLE);

    expect(result.success).toBe(true);
  });
});

describe('title management (#827)', () => {
  beforeEach(() => seed());

  it('adds a title, audits it, and never makes it principal', async () => {
    const result = await createAdminTitle({ role_id: SECRETARY, name: '  Deputy Secretary ', seats: 2 });

    expect(result.success).toBe(true);
    expect(state.writes).toEqual([
      { table: 'admin_titles', op: 'insert', values: { role_id: SECRETARY, name: 'Deputy Secretary', seats: 2, is_principal: false } },
    ]);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'admin_titles', entityDisplay: 'Deputy Secretary (Secretary)' })
    );
  });

  it('refuses a duplicate title name with a readable message', async () => {
    state.titleWriteErrorCode = '23505';

    const result = await createAdminTitle({ role_id: SECRETARY, name: 'Secretary', seats: 1 });

    expect(result).toEqual({ success: false, error: 'Secretary already has a title called "Secretary"' });
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([0, -1, 1.5])('refuses %s seats before touching the database', async (seats) => {
    const result = await createAdminTitle({ role_id: SECRETARY, name: 'Deputy', seats });

    expect(result.success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('refuses an empty name', async () => {
    expect((await createAdminTitle({ role_id: SECRETARY, name: '   ', seats: 1 })).success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('renames a title and audits only what changed', async () => {
    const result = await updateAdminTitle(VICE, { name: 'Deputy Chairman', seats: 1 });

    expect(result.success).toBe(true);
    expect(state.tables.admin_titles.find((t) => t.id === VICE)?.name).toBe('Deputy Chairman');
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'UPDATE',
        entityDisplay: 'Deputy Chairman (Chairman)',
        oldValues: { name: 'Vice Chairman' },
        newValues: { name: 'Deputy Chairman' },
      })
    );
  });

  it('refuses to cut seats below the number of people holding the title', async () => {
    seed([
      { id: 'a', email: 'a@example.test', full_name: 'A', role_id: CHAIRMAN, title_id: VICE, resident_id: 'r-a' },
      { id: 'b', email: 'b@example.test', full_name: 'B', role_id: CHAIRMAN, title_id: VICE, resident_id: 'r-b' },
    ]);

    const result = await updateAdminTitle(VICE, { name: 'Vice Chairman', seats: 1 });

    expect(result.success).toBe(false);
    expect(result.error).toContain('2 people hold this title');
    expect(state.writes).toEqual([]);
  });

  it('writes nothing when the caller lacks system.manage_roles', async () => {
    state.auth = { ...state.auth, authorized: false, error: 'Unauthorized' };

    expect((await createAdminTitle({ role_id: SECRETARY, name: 'Deputy', seats: 1 })).success).toBe(false);
    expect((await updateAdminTitle(VICE, { name: 'X', seats: 1 })).success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('lists titles with their holders', async () => {
    seed([{ id: 'sam', email: 'sam@example.test', full_name: 'Sam Holder', role_id: CHAIRMAN, title_id: VICE, resident_id: 'r' }]);

    const result = await getAdminTitles();

    const vice = result.data?.find((t) => t.id === VICE);
    expect(vice?.holders).toEqual([{ profile_id: 'sam', name: 'Sam Holder' }]);
    expect(result.data?.find((t) => t.id === CHAIR_TITLE)?.holders).toEqual([]);
  });
});
