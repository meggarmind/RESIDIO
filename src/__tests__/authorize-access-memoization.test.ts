// #215 Finding 2: access resolution is memoized per request. Outside a React
// server render, `cache()` is a passthrough, so this test replaces it with a
// stub that memoizes per "request" (reset by `newRequest()`). Removing the
// `cache()` wrapper in authorize.ts makes the rpc count 2 and the test fail.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const requestMemo = new Map<unknown, unknown>();
function newRequest() {
  requestMemo.clear();
}

vi.mock('react', () => ({
  cache: <T extends (...args: never[]) => unknown>(fn: T) =>
    ((...args: never[]) => {
      if (!requestMemo.has(fn)) requestMemo.set(fn, fn(...args));
      return requestMemo.get(fn);
    }) as T,
}));

const getUser = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser }, rpc }),
}));

const { authorizePermission, authorizeAnyPermission, getCurrentUserPermissions } = await import(
  '@/lib/auth/authorize'
);

const rows = [
  { role_id: 'r1', role_name: 'admin', permission_name: 'residents.view' },
  { role_id: 'r1', role_name: 'admin', permission_name: 'billing.view' },
];

beforeEach(() => {
  newRequest();
  getUser.mockReset().mockResolvedValue({ data: { user: { id: 'u1' } } });
  rpc.mockReset().mockResolvedValue({ data: rows, error: null });
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('authorize access memoization (#215)', () => {
  it('runs one get_my_access lookup for several authorize calls in a request', async () => {
    const a = await authorizePermission('residents.view' as never);
    const b = await authorizeAnyPermission(['billing.view', 'x.y'] as never);
    const c = await getCurrentUserPermissions();
    expect(a.authorized).toBe(true);
    expect(b.authorized).toBe(true);
    expect(c.permissions).toEqual(['residents.view', 'billing.view']);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_my_access');
  });

  it('does not share a result across requests', async () => {
    await authorizePermission('residents.view' as never);
    newRequest();
    await authorizePermission('residents.view' as never);
    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it('still refuses a permission the user lacks', async () => {
    const r = await authorizePermission('system.admin' as never);
    expect(r.authorized).toBe(false);
    expect(r.error).toContain("Missing permission 'system.admin'");
  });

  it('still refuses when there is no access row', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const r = await authorizePermission('residents.view' as never);
    expect(r.authorized).toBe(false);
    expect(r.userId).toBe('u1');
  });

  it('still refuses when unauthenticated', async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    const r = await authorizePermission('residents.view' as never);
    expect(r.authorized).toBe(false);
    expect(r.error).toBe('Unauthorized: Not authenticated');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('fails closed on lookup-failed, and the failure is memoized too', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'boom' } });
    const a = await authorizePermission('residents.view' as never);
    const b = await authorizeAnyPermission(['residents.view'] as never);
    expect(a.authorized).toBe(false);
    expect(b.authorized).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
