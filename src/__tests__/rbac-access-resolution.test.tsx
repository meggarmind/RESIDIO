// @vitest-environment jsdom
//
// #536: AuthProvider resolves the signed-in user's role and permissions
// through the Access module (get_my_access RPC) instead of reading
// app_roles + role_permissions directly. These tests drive the real provider
// and pin how each Access outcome maps onto the profile, the 5-minute cache
// (#113) and the "Could not load your permissions" toast.

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROFILE_CACHE_KEY = 'residio_profile_cache';

const AUTH_USER = {
  id: 'user-1',
  email: 'admin@residio.test',
  user_metadata: { full_name: 'Admin User' },
};

const PROFILE_ROW = {
  id: 'user-1',
  email: 'admin@residio.test',
  full_name: 'Admin User',
  role_id: 'role-1',
  resident_id: null,
};

type RpcResult = { data: unknown; error: { message: string } | null };

let supabaseClient: unknown;
const getUser = vi.fn(async () => ({ data: { user: AUTH_USER } }));

vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseClient }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/actions/auth/get-server-session', () => ({
  getServerSession: async () => ({ session: null, error: null }),
}));
vi.mock('@/lib/offline/admin-read-cache', () => ({ clearAdminReadCache: async () => {} }));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

const { AuthProvider, useAuth } = await import('@/lib/auth/auth-provider');

function makeSupabase({
  rpc,
  displayName = { data: { display_name: 'Super Admin' }, error: null },
}: {
  rpc: () => Promise<RpcResult>;
  displayName?: { data: unknown; error: unknown };
}) {
  return {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { user: AUTH_USER } } }),
      getUser,
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({ single: async () => ({ data: PROFILE_ROW, error: null }) }),
          }),
        };
      }
      if (table === 'app_roles') {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => displayName }) }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc,
  };
}

const rows = (...perms: Array<string | null>) => ({
  data: perms.map((permission_name) => ({
    role_id: 'role-1',
    role_name: 'super_admin',
    permission_name,
  })),
  error: null,
});

function Consumer() {
  const { profile } = useAuth();
  return (
    <div>
      <span data-testid="name">{profile?.full_name ?? ''}</span>
      <span data-testid="perms">{(profile?.permissions ?? []).join(',')}</span>
      <span data-testid="role">{profile?.role_name ?? 'null'}</span>
      <span data-testid="display">{profile?.role_display_name ?? 'null'}</span>
    </div>
  );
}

function mount(client: unknown) {
  supabaseClient = client;
  render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

const cached = () => {
  const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
  return raw === null ? null : JSON.parse(raw).profile;
};

describe('AuthProvider resolves permissions through the Access module (#536)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    toastError.mockClear();
    getUser.mockClear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('resolved: populates role and permissions, caches normally, stays silent', async () => {
    mount(makeSupabase({ rpc: async () => rows('residents.view', 'residents.create') }));

    await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('residents.view,residents.create'));
    expect(screen.getByTestId('role').textContent).toBe('super_admin');
    expect(cached()?.permissions).toEqual(['residents.view', 'residents.create']);
    expect(toastError).not.toHaveBeenCalled();
  });

  it('passes the known userId to resolveAccess, so permission resolution makes no extra getUser() call', async () => {
    // On this happy path the provider itself never calls auth.getUser()
    // (only the getSession-timeout and profiles-error paths do), so any call
    // here would come from resolveAccess() looking the user up again.
    mount(makeSupabase({ rpc: async () => rows('residents.view') }));

    await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('residents.view'));
    expect(getUser).not.toHaveBeenCalled();
  });

  it('an empty-string role display name is normalised to null', async () => {
    mount(
      makeSupabase({
        rpc: async () => rows('residents.view'),
        displayName: { data: { display_name: '' }, error: null },
      })
    );

    await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('residents.view'));
    expect(screen.getByTestId('display').textContent).toBe('null');
    expect(cached()?.role_display_name).toBeNull();
  });

  it('role display name comes from the app_roles lookup, role name from the Access result', async () => {
    mount(
      makeSupabase({
        rpc: async () => rows('residents.view'),
        displayName: { data: { display_name: 'Estate Chairman' }, error: null },
      })
    );

    await waitFor(() => expect(screen.getByTestId('display').textContent).toBe('Estate Chairman'));
    expect(screen.getByTestId('role').textContent).toBe('super_admin');
  });

  it('a role with zero permissions resolves with [] and still caches normally', async () => {
    mount(makeSupabase({ rpc: async () => rows(null) }));

    await waitFor(() => expect(screen.getByTestId('role').textContent).toBe('super_admin'));
    expect(screen.getByTestId('perms').textContent).toBe('');
    expect(cached()).not.toBeNull();
    expect(cached().permissions).toEqual([]);
    expect(toastError).not.toHaveBeenCalled();
  });

  // #1341: a role with zero rows is what get_my_access() returns before the second sign-in
  // step (#1029). It renders as an empty profile with no toast, but is never cached.
  it('no-access (zero rows) with a role: empty profile, no toast, NOT cached', async () => {
    mount(makeSupabase({ rpc: async () => ({ data: [], error: null }) }));

    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Admin User'));
    expect(screen.getByTestId('perms').textContent).toBe('');
    expect(screen.getByTestId('role').textContent).toBe('null');
    expect(screen.getByTestId('display').textContent).toBe('null');
    expect(cached()).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('lookup-failed (rpc error): degraded profile is NOT cached and the permissions toast is raised', async () => {
    mount(makeSupabase({ rpc: async () => ({ data: null, error: { message: 'rpc exploded' } }) }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    const [title, options] = toastError.mock.calls[0] as [string, { description: string }];
    expect(title).toBe('Could not load your permissions');
    expect(options.description).toMatch(/access has not changed/i);
    expect(screen.getByTestId('perms').textContent).toBe('');
    expect(screen.getByTestId('role').textContent).toBe('null');
    expect(screen.getByTestId('display').textContent).toBe('null');
    expect(cached()).toBeNull();
  });

  it('a thrown rpc error is a failure, not no-access: not cached, toast raised', async () => {
    mount(
      makeSupabase({
        rpc: async () => {
          throw new Error('network down');
        },
      })
    );

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe('Could not load your permissions');
    expect(cached()).toBeNull();
  });

  it('a hung lookup hits the 15s timeout: not cached, toast raised', async () => {
    // Fire the 15s race timeout immediately instead of waiting for it.
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms?: number, ...rest: unknown[]) =>
      realSetTimeout(fn, ms === 15000 ? 0 : ms, ...rest)) as typeof setTimeout);

    mount(makeSupabase({ rpc: () => new Promise<RpcResult>(() => {}) }));

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(toastError.mock.calls[0][0]).toBe('Could not load your permissions');
    expect(screen.getByTestId('perms').textContent).toBe('');
    expect(cached()).toBeNull();
  });

  it('a display-name lookup error alone is not a failure: permissions kept, cached, no toast', async () => {
    mount(
      makeSupabase({
        rpc: async () => rows('residents.view'),
        displayName: { data: null, error: { message: 'display lookup failed' } },
      })
    );

    await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('residents.view'));
    expect(screen.getByTestId('display').textContent).toBe('null');
    expect(screen.getByTestId('role').textContent).toBe('super_admin');
    expect(cached()?.permissions).toEqual(['residents.view']);
    expect(toastError).not.toHaveBeenCalled();
  });
});
