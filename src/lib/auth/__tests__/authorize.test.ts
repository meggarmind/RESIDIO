import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Permission } from '../action-roles';

const state = vi.hoisted(() => ({
  user: { id: 'u1' } as { id: string } | null,
  rows: [] as unknown[] | null,
  rpcError: null as { message: string } | null,
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    auth: { getUser: async () => ({ data: { user: state.user } }) },
    rpc: async () => ({ data: state.rows, error: state.rpcError }),
  }),
}));

import {
  authorizePermission,
  authorizeAnyPermission,
  getCurrentUserPermissions,
} from '../authorize';

const P = (s: string) => s as Permission;
const rows = (...perms: (string | null)[]) =>
  perms.map((p) => ({ role_id: 'r1', role_name: 'admin', permission_name: p }));

beforeEach(() => {
  vi.restoreAllMocks();
  state.user = { id: 'u1' };
  state.rows = rows('a.view', 'b.view');
  state.rpcError = null;
});

describe('authorizePermission', () => {
  it('returns the unauthenticated result with no user', async () => {
    state.user = null;
    expect(await authorizePermission(P('a.view'))).toEqual({
      authorized: false,
      userId: null,
      roleName: null,
      roleId: null,
      permissions: [],
      error: 'Unauthorized: Not authenticated',
    });
  });

  it('authorizes with the full result shape', async () => {
    expect(await authorizePermission(P('a.view'))).toEqual({
      authorized: true,
      userId: 'u1',
      roleName: 'admin',
      roleId: 'r1',
      permissions: ['a.view', 'b.view'],
      error: null,
    });
  });

  it('denies a missing permission, keeping role info and the exact string', async () => {
    expect(await authorizePermission(P('c.edit'))).toEqual({
      authorized: false,
      userId: 'u1',
      roleName: 'admin',
      roleId: 'r1',
      permissions: ['a.view', 'b.view'],
      error: "Unauthorized: Missing permission 'c.edit'",
    });
  });

  it('denies a user with no access (zero rows) with the same string', async () => {
    state.rows = [];
    expect(await authorizePermission(P('a.view'))).toEqual({
      authorized: false,
      userId: 'u1',
      roleName: null,
      roleId: null,
      permissions: [],
      error: "Unauthorized: Missing permission 'a.view'",
    });
  });

  it('fails closed on lookup failure with the same string and logs it', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    state.rpcError = { message: 'boom' };
    expect(await authorizePermission(P('a.view'))).toEqual({
      authorized: false,
      userId: 'u1',
      roleName: null,
      roleId: null,
      permissions: [],
      error: "Unauthorized: Missing permission 'a.view'",
    });
    expect(spy).toHaveBeenCalledWith('[Authorize] access lookup failed', {
      userId: 'u1',
      error: 'boom',
    });
  });
});

describe('authorizeAnyPermission', () => {
  it('returns the unauthenticated result with no user', async () => {
    state.user = null;
    expect((await authorizeAnyPermission([P('a.view')])).error).toBe(
      'Unauthorized: Not authenticated'
    );
  });

  it('authorizes when any one permission is held', async () => {
    expect(await authorizeAnyPermission([P('x.y'), P('b.view')])).toEqual({
      authorized: true,
      userId: 'u1',
      roleName: 'admin',
      roleId: 'r1',
      permissions: ['a.view', 'b.view'],
      error: null,
    });
  });

  it('denies when none is held, with the exact string', async () => {
    const r = await authorizeAnyPermission([P('x.y'), P('z.w')]);
    expect(r.authorized).toBe(false);
    expect(r.roleName).toBe('admin');
    expect(r.error).toBe('Unauthorized: Missing required permissions. Need one of: x.y, z.w');
  });

  it('denies an empty requirement list', async () => {
    expect((await authorizeAnyPermission([])).authorized).toBe(false);
  });

  it('fails closed on lookup failure with the same string', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    state.rpcError = { message: 'boom' };
    const r = await authorizeAnyPermission([P('a.view')]);
    expect(r).toMatchObject({ authorized: false, roleName: null, roleId: null, permissions: [] });
    expect(r.error).toBe('Unauthorized: Missing required permissions. Need one of: a.view');
  });
});

describe('getCurrentUserPermissions', () => {
  it('returns null userId and no permissions with no user', async () => {
    state.user = null;
    expect(await getCurrentUserPermissions()).toEqual({ userId: null, permissions: [] });
  });

  it('returns the id and permissions', async () => {
    expect(await getCurrentUserPermissions()).toEqual({
      userId: 'u1',
      permissions: ['a.view', 'b.view'],
    });
  });

  it('returns an empty permission set for no-access', async () => {
    state.rows = [];
    expect(await getCurrentUserPermissions()).toEqual({ userId: 'u1', permissions: [] });
  });
});
