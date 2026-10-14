import { describe, expect, it, vi } from 'vitest';
import { resolveAccess, type AccessClient, type AccessRow } from '../access';

function fakeClient(opts: {
  user?: { id: string } | null;
  rows?: AccessRow[] | null;
  rpcError?: { message: string } | null;
  rpcThrows?: Error;
  getUserThrows?: Error;
}) {
  const rpc = vi.fn(async () => {
    if (opts.rpcThrows) throw opts.rpcThrows;
    return { data: opts.rows ?? null, error: opts.rpcError ?? null };
  });
  const getUser = vi.fn(async () => {
    if (opts.getUserThrows) throw opts.getUserThrows;
    return { data: { user: opts.user === undefined ? { id: 'u1' } : opts.user } };
  });
  const client: AccessClient = { auth: { getUser }, rpc: rpc as unknown as AccessClient['rpc'] };
  return { client, rpc, getUser };
}

const row = (p: string | null): AccessRow => ({
  role_id: 'r1',
  role_name: 'admin',
  permission_name: p,
});

describe('resolveAccess', () => {
  it('resolves role and permissions from rows', async () => {
    const { client } = fakeClient({ rows: [row('a.view'), row('b.view')] });
    expect(await resolveAccess(client)).toEqual({
      status: 'resolved',
      userId: 'u1',
      roleId: 'r1',
      roleName: 'admin',
      permissions: ['a.view', 'b.view'],
    });
  });

  it('resolves a role whose only row has a NULL permission to []', async () => {
    const { client } = fakeClient({ rows: [row(null)] });
    expect(await resolveAccess(client)).toMatchObject({
      status: 'resolved',
      roleName: 'admin',
      permissions: [],
    });
  });

  it('de-duplicates permissions, preserving order', async () => {
    const { client } = fakeClient({ rows: [row('b'), row('a'), row('b')] });
    expect(await resolveAccess(client)).toMatchObject({ permissions: ['b', 'a'] });
  });

  it('returns no-access with the userId for zero rows', async () => {
    const { client } = fakeClient({ rows: [] });
    expect(await resolveAccess(client)).toEqual({ status: 'no-access', userId: 'u1' });
  });

  it('returns no-access with null userId and skips the rpc when there is no user', async () => {
    const { client, rpc } = fakeClient({ user: null });
    expect(await resolveAccess(client)).toEqual({ status: 'no-access', userId: null });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('skips getUser when options.userId is given', async () => {
    const { client, getUser } = fakeClient({ rows: [row('a')] });
    const result = await resolveAccess(client, { userId: 'given' });
    expect(getUser).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'resolved', userId: 'given' });
  });

  it('returns lookup-failed on an rpc error', async () => {
    const { client } = fakeClient({ rpcError: { message: 'boom' } });
    expect(await resolveAccess(client)).toEqual({
      status: 'lookup-failed',
      userId: 'u1',
      error: 'boom',
    });
  });

  it('returns lookup-failed when the rpc throws', async () => {
    const { client } = fakeClient({ rpcThrows: new Error('net') });
    expect(await resolveAccess(client)).toEqual({
      status: 'lookup-failed',
      userId: 'u1',
      error: 'net',
    });
  });

  it('returns lookup-failed when getUser throws', async () => {
    const { client } = fakeClient({ getUserThrows: new Error('auth down') });
    expect(await resolveAccess(client)).toEqual({
      status: 'lookup-failed',
      userId: null,
      error: 'auth down',
    });
  });
});
