// @vitest-environment jsdom
//
// #1341: after the 2FA screen an admin saw only the Dashboard menu item until
// a refresh. AuthProvider loaded the profile on /auth/verify-2fa, before the
// second step was done, when get_my_access() returns no rows; it cached that
// empty snapshot and never reloaded it after the client-side redirect.
// These tests drive the real provider: no profile load on the 2FA screen, and
// refreshProfile() reports whether access actually loaded.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const PROFILE_CACHE_KEY = 'residio_profile_cache';

const AUTH_USER = { id: 'user-1', email: 'admin@residio.test', user_metadata: {} };

const PROFILE_ROW = {
  id: 'user-1',
  email: 'admin@residio.test',
  full_name: 'Admin User',
  role_id: 'role-1',
  resident_id: null,
};

type RpcResult = { data: unknown; error: { message: string } | null };

let supabaseClient: unknown;
let pathname = '/dashboard';

vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseClient }));
vi.mock('next/navigation', () => ({ usePathname: () => pathname }));
vi.mock('@/actions/auth/get-server-session', () => ({
  getServerSession: async () => ({ session: null, error: null }),
}));
vi.mock('@/lib/offline/admin-read-cache', () => ({ clearAdminReadCache: async () => {} }));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

const { AuthProvider, useAuth } = await import('@/lib/auth/auth-provider');

const rows = (...perms: string[]): RpcResult => ({
  data: perms.map((permission_name) => ({ role_id: 'role-1', role_name: 'chairman', permission_name })),
  error: null,
});
const NO_ROWS: RpcResult = { data: [], error: null };

function makeSupabase(rpc: () => Promise<RpcResult>) {
  const from = vi.fn((table: string) => {
    if (table === 'profiles') {
      return {
        select: () => ({ eq: () => ({ single: async () => ({ data: PROFILE_ROW, error: null }) }) }),
      };
    }
    if (table === 'app_roles') {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { display_name: 'Chairman' }, error: null }) }),
        }),
      };
    }
    throw new Error(`unexpected table ${table}`);
  });
  return {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { user: AUTH_USER } } }),
      getUser: async () => ({ data: { user: AUTH_USER } }),
    },
    from,
    rpc: vi.fn(rpc),
  };
}

let refresh: (() => Promise<boolean>) | null = null;

function Consumer() {
  const { profile, refreshProfile } = useAuth();
  useEffect(() => {
    refresh = refreshProfile;
  }, [refreshProfile]);
  return <span data-testid="perms">{(profile?.permissions ?? []).join(',')}</span>;
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

describe('AuthProvider around the 2FA step (#1341)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    toastError.mockClear();
    refresh = null;
    pathname = '/dashboard';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('does not load the profile on /auth/verify-2fa, so no pre-2FA snapshot is made or cached', async () => {
    pathname = '/auth/verify-2fa';
    const client = makeSupabase(async () => NO_ROWS);
    mount(client);

    // Give any bootstrap a chance to run before asserting it did nothing.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(client.from).not.toHaveBeenCalled();
    expect(client.rpc).not.toHaveBeenCalled();
    expect(cached()).toBeNull();
  });

  it('CONTROL: does load the profile on an app route', async () => {
    const client = makeSupabase(async () => rows('residents.view'));
    mount(client);

    await waitFor(() => expect(screen.getByTestId('perms').textContent).toBe('residents.view'));
    expect(client.from).toHaveBeenCalledWith('profiles');
  });

  it('refreshProfile() resolves true and loads the full access once the rows are readable', async () => {
    pathname = '/auth/verify-2fa';
    mount(makeSupabase(async () => rows('residents.view', 'billing.view')));
    await waitFor(() => expect(refresh).not.toBeNull());

    let loaded: boolean | undefined;
    await act(async () => {
      loaded = await refresh!();
    });

    expect(loaded).toBe(true);
    expect(screen.getByTestId('perms').textContent).toBe('residents.view,billing.view');
    expect(cached()?.permissions).toEqual(['residents.view', 'billing.view']);
  });

  it('refreshProfile() resolves false when the role has no access rows, and caches nothing', async () => {
    pathname = '/auth/verify-2fa';
    mount(makeSupabase(async () => NO_ROWS));
    await waitFor(() => expect(refresh).not.toBeNull());

    let loaded: boolean | undefined;
    await act(async () => {
      loaded = await refresh!();
    });

    expect(loaded).toBe(false);
    expect(cached()).toBeNull();
  });

  it('refreshProfile() resolves false on a failed lookup, without the toast (the form shows its own error)', async () => {
    pathname = '/auth/verify-2fa';
    mount(makeSupabase(async () => ({ data: null, error: { message: 'rpc exploded' } })));
    await waitFor(() => expect(refresh).not.toBeNull());

    let loaded: boolean | undefined;
    await act(async () => {
      loaded = await refresh!();
    });

    expect(loaded).toBe(false);
    expect(cached()).toBeNull();
    expect(toastError).not.toHaveBeenCalled();
  });
});
