import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1317: account linking. Drives the real actions and the real target guard
 * against an in-memory fake of the Supabase clients. The fake returns embedded
 * relations the way PostgREST does for a many-to-one foreign key: as a single
 * object, not an array.
 */

type Row = Record<string, unknown>;

const state = vi.hoisted(() => ({
  tables: {} as Record<string, Row[]>,
  writes: [] as Array<{ table: string; op: string; values: Row }>,
  /** Auth users are served in pages of `pageSize`, to prove every page is read. */
  authUsers: [] as Array<Record<string, unknown>>,
  pageSize: 2,
  callerClientCalls: 0,
  auth: { authorized: true, userId: 'caller', error: null as string | null },
}));

function fakeFrom(table: string) {
  const filters: Array<[string, unknown]> = [];
  let op: 'select' | 'update' | 'insert' = 'select';
  let values: Row = {};
  const rowsNow = () => (state.tables[table] ?? []).filter((r) => filters.every(([c, v]) => r[c] === v));
  const embed = (r: Row): Row => {
    if (table === 'profiles') {
      return {
        ...r,
        app_roles: (state.tables.app_roles ?? []).find((x) => x.id === r.role_id) ?? null,
        residents: (state.tables.residents ?? []).find((x) => x.id === r.resident_id) ?? null,
      };
    }
    if (table === 'role_permissions') {
      return { ...r, permission: (state.tables.app_permissions ?? []).find((x) => x.id === r.permission_id) ?? null };
    }
    return r;
  };
  const run = (): Row[] => {
    const rows = rowsNow();
    if (op === 'update') {
      state.writes.push({ table, op, values });
      rows.forEach((r) => Object.assign(r, values));
      return rows;
    }
    if (op === 'insert') {
      state.writes.push({ table, op, values });
      (state.tables[table] ??= []).push({ ...values });
      return [values];
    }
    return rows.map(embed);
  };
  const b: Record<string, unknown> = {
    select: () => b,
    update: (v: Row) => ((op = 'update'), (values = v), b),
    insert: (v: Row) => ((op = 'insert'), (values = v), b),
    eq: (c: string, v: unknown) => (filters.push([c, v]), b),
    in: () => b,
    not: () => b,
    single: async () => {
      const r = run();
      return r[0] ? { data: r[0], error: null } : { data: null, error: { message: 'no rows' } };
    },
    maybeSingle: async () => ({ data: run()[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) => resolve({ data: run(), error: null }),
  };
  return b;
}

const adminClient = {
  from: fakeFrom,
  auth: {
    admin: {
      getUserById: async (id: string) => ({
        data: { user: state.authUsers.find((u) => u.id === id) ?? null },
        error: null,
      }),
      listUsers: async ({ page = 1, perPage = 50 }: { page?: number; perPage?: number } = {}) => {
        const size = Math.min(perPage, state.pageSize);
        return { data: { users: state.authUsers.slice((page - 1) * size, page * size) }, error: null };
      },
    },
  },
};

// Under RLS the caller's own client reads no other user's profile or resident row.
const callerClient = {
  from: () => {
    state.callerClientCalls++;
    const empty: Record<string, unknown> = {
      select: () => empty,
      eq: () => empty,
      in: () => empty,
      not: () => empty,
      update: () => empty,
      single: async () => ({ data: null, error: { message: 'rls' } }),
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null }),
    };
    return empty;
  },
};

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: () => adminClient,
  createServerSupabaseClient: async () => callerClient,
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: async () => state.auth }));
const logAudit = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('@/lib/audit/logger', () => ({ logAudit }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  getOrphanedAuthAccounts,
  linkAuthAccountToResident,
  searchAuthAccountsByEmail,
} from '@/actions/auth/link-account';
import { setPortalAccessOverride } from '@/actions/settings/resident-portal';
import { CANNOT_CHANGE_ACCOUNT_ERROR } from '@/lib/auth/account-guards';

const ADA = '11111111-1111-4111-8111-111111111111';
const BOB = '33333333-3333-4333-8333-333333333333';
const ACCOUNT = '22222222-2222-4222-8222-222222222222';
const CHAIRMAN_ACCOUNT = '44444444-4444-4444-8444-444444444444';

const ASSIGN = 'system.assign_roles';
const BOARD = 'system.assign_board_roles';

function seed(callerGrants: string[] = [ASSIGN]) {
  state.writes = [];
  state.callerClientCalls = 0;
  state.pageSize = 2;
  state.auth = { authorized: true, userId: 'caller', error: null };
  state.authUsers = [
    { id: 'u1', email: 'one@x.test', created_at: '2026-01-01T00:00:00Z' },
    { id: 'u2', email: 'two@x.test', created_at: '2026-01-02T00:00:00Z' },
    { id: 'u3', email: 'three@x.test', created_at: '2026-01-03T00:00:00Z' },
    { id: 'u4', email: 'four@x.test', created_at: '2026-01-04T00:00:00Z' },
    { id: ACCOUNT, email: 'acct@x.test', created_at: '2026-01-05T00:00:00Z' },
    { id: CHAIRMAN_ACCOUNT, email: 'chair@x.test', created_at: '2026-01-06T00:00:00Z' },
  ];
  state.tables = {
    app_roles: [
      { id: 'r-ch', name: 'chairman' },
      { id: 'r-caller', name: 'caller_role' },
    ],
    app_permissions: [
      { id: 'p-assign', name: ASSIGN, is_active: true },
      { id: 'p-board', name: BOARD, is_active: true },
    ],
    role_permissions: callerGrants.map((g) => ({ role_id: 'r-caller', permission_id: g === BOARD ? 'p-board' : 'p-assign' })),
    profiles: [
      { id: 'caller', role_id: 'r-caller', approval_status: 'active', resident_id: null },
      { id: ACCOUNT, email: 'acct@x.test', role_id: null, approval_status: 'pending', resident_id: BOB, portal_access_override: null },
      { id: CHAIRMAN_ACCOUNT, email: 'chair@x.test', role_id: 'r-ch', approval_status: 'active', resident_id: null, portal_access_override: null },
    ],
    residents: [
      { id: ADA, first_name: 'Ada', last_name: 'Obi', email: 'ada@x.test', profile_id: null },
      { id: BOB, first_name: 'Bob', last_name: 'Eze', email: 'bob@x.test', profile_id: ACCOUNT },
    ],
  };
}

const profile = (id: string) => state.tables.profiles.find((p) => p.id === id)!;
const resident = (id: string) => state.tables.residents.find((r) => r.id === id)!;

beforeEach(() => {
  seed();
  logAudit.mockClear();
});

describe('searchAuthAccountsByEmail', () => {
  it('finds an account that is not on the first page of auth users and resolves the linked resident name', async () => {
    const result = await searchAuthAccountsByEmail('acct@x');
    expect(result.error).toBeUndefined();
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0]).toMatchObject({
      id: ACCOUNT,
      linked_resident_id: BOB,
      linked_resident_name: 'Bob Eze',
    });
  });

  it('reads other users profiles through the service role, not the caller client', async () => {
    await searchAuthAccountsByEmail('acct@x');
    expect(state.callerClientCalls).toBe(0);
  });
});

describe('getOrphanedAuthAccounts', () => {
  it('lists unlinked accounts from every page and carries their approval status', async () => {
    const { accounts, error } = await getOrphanedAuthAccounts();
    expect(error).toBeUndefined();
    // ACCOUNT is linked to Bob, so it is not orphaned; the other five are.
    expect(accounts.map((a) => a.id).sort()).toEqual(['u1', 'u2', 'u3', 'u4', CHAIRMAN_ACCOUNT].sort());
    expect(accounts.find((a) => a.id === CHAIRMAN_ACCOUNT)?.approval_status).toBe('active');
    expect(accounts.find((a) => a.id === 'u1')?.approval_status).toBeNull();
  });
});

describe('linkAuthAccountToResident', () => {
  it('reports the previous resident by name and refuses a relink without forceRelink', async () => {
    const result = await linkAuthAccountToResident(ACCOUNT, ADA);
    expect(result.success).toBe(false);
    expect(result.previousResidentId).toBe(BOB);
    expect(result.previousResidentName).toBe('Bob Eze');
    expect(result.error).toContain('Bob Eze');
    expect(state.writes).toEqual([]);
  });

  it('on a forced relink clears the previous resident profile_id and audits old and new resident', async () => {
    const result = await linkAuthAccountToResident(ACCOUNT, ADA, true);
    expect(result).toMatchObject({ success: true, previousResidentId: BOB, previousResidentName: 'Bob Eze' });
    expect(profile(ACCOUNT).resident_id).toBe(ADA);
    expect(resident(BOB).profile_id).toBeNull();
    expect(resident(ADA).profile_id).toBe(ACCOUNT);
    expect(logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        oldValues: { resident_id: BOB, resident_name: 'Bob Eze' },
        newValues: { resident_id: ADA, resident_name: 'Ada Obi' },
      })
    );
  });

  it('sees a resident already linked to another account even though the caller client cannot', async () => {
    state.tables.profiles.push({ id: 'other', role_id: null, approval_status: 'active', resident_id: ADA });
    profile(ACCOUNT).resident_id = null;
    const result = await linkAuthAccountToResident(ACCOUNT, ADA);
    expect(result.success).toBe(false);
    expect(result.error).toContain('already linked to a different account');
    expect(profile(ACCOUNT).resident_id).toBeNull();
  });

  it('refuses a chairman target without system.assign_board_roles', async () => {
    const result = await linkAuthAccountToResident(CHAIRMAN_ACCOUNT, ADA);
    expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
  });
});

describe('setPortalAccessOverride target guard', () => {
  it('refuses a chairman target when the caller lacks system.assign_board_roles, and writes nothing', async () => {
    const result = await setPortalAccessOverride(CHAIRMAN_ACCOUNT, 'enabled');
    expect(result).toEqual({ success: false, error: CANNOT_CHANGE_ACCOUNT_ERROR });
    expect(state.writes).toEqual([]);
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('allows a chairman target when the caller holds system.assign_board_roles', async () => {
    seed([ASSIGN, BOARD]);
    const result = await setPortalAccessOverride(CHAIRMAN_ACCOUNT, 'enabled');
    expect(result).toEqual({ success: true, error: null });
    expect(profile(CHAIRMAN_ACCOUNT).portal_access_override).toBe('enabled');
  });

  it('still lets an assign_roles caller change an ordinary account', async () => {
    const result = await setPortalAccessOverride(ACCOUNT, 'disabled');
    expect(result.success).toBe(true);
  });
});
