// @vitest-environment jsdom
//
// Issue #256: the sibling defect to #113. When the `profiles` table read in
// src/lib/auth/auth-provider.tsx fails, fetchProfile() falls back to a profile
// synthesised from Supabase auth user_metadata. That fallback has
// role_id: null / permissions: [] by construction, and it was being written
// straight to the 5-minute sessionStorage cache -- so one transient profiles
// read error locked the user out of their own permissions on every
// navigation and reload until the TTL expired.
//
// #113's own regression test (rbac-fetch-failure-cache.test.ts) passes with
// this bug present, by design: it pins the *RBAC* call site only. These tests
// drive the real AuthProvider through the profiles-error path end to end, so
// they fail if either the fallback-site guard or its propagation to the
// second cache write is removed.

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

// vi.mock factories are hoisted above these bindings, so the client is handed
// out through a mutable holder that each test sets before rendering.
let supabaseClient: unknown;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => supabaseClient,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

vi.mock('@/actions/auth/get-server-session', () => ({
  getServerSession: async () => ({ session: null, error: null }),
}));

vi.mock('@/lib/offline/admin-read-cache', () => ({
  clearAdminReadCache: async () => {},
}));

const toastError = vi.fn();
vi.mock('sonner', () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

// Imported after the mocks so the provider picks them up.
const { AuthProvider, useAuth } = await import('@/lib/auth/auth-provider');

/**
 * Minimal Supabase browser-client stand-in shaped like the exact call chains
 * fetchProfile() uses. `profilesFail` flips the profiles read into the error
 * branch that builds the fallback profile.
 */
function makeSupabase({ profilesFail }: { profilesFail: boolean }) {
  return {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      getSession: async () => ({ data: { session: { user: AUTH_USER } } }),
      getUser: async () => ({ data: { user: AUTH_USER } }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () =>
                profilesFail
                  ? { data: null, error: { message: 'transient profiles read failure' } }
                  : { data: PROFILE_ROW, error: null },
            }),
          }),
        };
      }
      if (table === 'app_roles') {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({
                data: { id: 'role-1', name: 'super_admin', display_name: 'Super Admin' },
                error: null,
              }),
            }),
          }),
        };
      }
      // role_permissions -- awaited directly off .eq(), no .single()
      return {
        select: () => ({
          eq: async () => ({
            data: [{ permission: { name: 'residents.view' } }],
            error: null,
          }),
        }),
      };
    },
  };
}

function Consumer() {
  const { profile } = useAuth();
  return (
    <div>
      <span data-testid="name">{profile?.full_name ?? ''}</span>
      <span data-testid="perms">{(profile?.permissions ?? []).join(',')}</span>
    </div>
  );
}

function readCachedProfile() {
  const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
  return raw === null ? null : JSON.parse(raw).profile;
}

describe('profiles-table fetch failure must not poison the profile cache (#256)', () => {
  beforeEach(() => {
    sessionStorage.clear();
    toastError.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('CONTROL: a healthy profile fetch IS written to the session cache', async () => {
    // Without this control, "nothing was cached" below could pass for the
    // wrong reason -- e.g. the provider never reaching fetchProfile at all.
    supabaseClient = makeSupabase({ profilesFail: false });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('perms').textContent).toBe('residents.view');
    });

    const cached = readCachedProfile();
    expect(cached).not.toBeNull();
    expect(cached.permissions).toEqual(['residents.view']);
    expect(cached.role_name).toBe('super_admin');
    // A healthy fetch is the common case -- every page load, for every user.
    // It must stay silent; a toast here would be the #256 fix annoying every
    // user instead of only the ones hitting a real failure.
    expect(toastError).not.toHaveBeenCalled();
  });

  it('does NOT cache the zero-permission fallback profile when the profiles read fails', async () => {
    supabaseClient = makeSupabase({ profilesFail: true });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    // The fallback profile is rendered (see the next test); wait on that so
    // the assertion below runs after every cache write the path performs --
    // both the fallback call site and the shared commit further down.
    await waitFor(() => {
      expect(screen.getByTestId('name').textContent).toBe('Admin User');
    });
    // fetchProfile continues past the fallback branch into the shared profile
    // commit. Give that trailing microtask work a chance to run so a cache
    // write there is observed rather than raced past.
    await waitFor(() => {
      expect(screen.getByTestId('perms').textContent).toBe('');
    });

    expect(sessionStorage.getItem(PROFILE_CACHE_KEY)).toBeNull();
  });

  it('still renders the degraded fallback profile -- suppressing the cache must not blank the app', async () => {
    // The fix suppresses the sessionStorage write only. setProfile() must keep
    // happening, or a transient profiles error turns a degraded session into
    // an empty one.
    supabaseClient = makeSupabase({ profilesFail: true });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('name').textContent).toBe('Admin User');
    });
    expect(screen.getByTestId('perms').textContent).toBe('');
  });

  it('raises a visible, honest toast on this path, distinct from the #113 RBAC toast', async () => {
    // #256 part 2: the profiles-table failure used to die in a console.warn
    // no administrator would ever see. It must now surface the same way
    // #113 surfaces an RBAC failure -- a dismissible toast with a retry
    // action -- with its own copy so an admin can tell which of the two
    // independent failure paths they hit.
    supabaseClient = makeSupabase({ profilesFail: true });

    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('name').textContent).toBe('Admin User');
    });

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledTimes(1);
    });
    const [title, options] = toastError.mock.calls[0] as [string, { description: string }];
    expect(title).toBe('Could not load your profile');
    // Must stay honest: visibility is degraded, but server-side
    // authorizePermission() re-checks independently, so real access has not
    // changed. Also must not reuse the #113 RBAC copy verbatim -- that would
    // mislead an admin about which fetch actually failed.
    expect(options.description).toMatch(/access has not changed/i);
    expect(options.description).not.toBe(
      'Some controls may be hidden until this is retried. Your access has not changed.'
    );
  });
});
