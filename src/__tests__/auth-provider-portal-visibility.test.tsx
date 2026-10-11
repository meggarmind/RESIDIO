// @vitest-environment jsdom
//
// #423: AuthProvider derives the portal link booleans from three inputs
// (general switch, per-account override, resident_id / impersonation
// permission). These tests pin the starting state, stale-response handling,
// account switching, and the provider-level wiring of each input.

import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

type Result = { data: unknown; error: unknown };
type UserConfig = {
  residentId: string | null;
  override: Result | Promise<Result>;
  permissions: string[];
};

let users: Record<string, UserConfig>;
let general: unknown;
let authListener: ((event: string, session: unknown) => Promise<void>) | null;
let supabaseClient: unknown;

const authUser = (id: string) => ({ id, email: `${id}@residio.test`, user_metadata: {} });

vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseClient }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/actions/auth/get-server-session', () => ({
  getServerSession: async () => ({ session: null, error: null }),
}));
vi.mock('@/lib/offline/admin-read-cache', () => ({ clearAdminReadCache: async () => {} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { AuthProvider, useAuth } = await import('@/lib/auth/auth-provider');

function makeSupabase(initialUserId: string) {
  return {
    auth: {
      onAuthStateChange: (cb: NonNullable<typeof authListener>) => {
        authListener = cb;
        return { data: { subscription: { unsubscribe: () => {} } } };
      },
      getSession: async () => ({ data: { session: { user: authUser(initialUserId) } } }),
      getUser: async () => ({ data: { user: authUser(initialUserId) } }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: () => ({
            eq: (_col: string, id: string) => ({
              single: async () => ({
                data: {
                  id,
                  email: `${id}@residio.test`,
                  full_name: id,
                  role_id: `role-${id}`,
                  resident_id: users[id].residentId,
                },
                error: null,
              }),
              maybeSingle: () => users[id].override,
            }),
          }),
        };
      }
      if (table === 'app_roles') {
        return {
          select: () => ({
            eq: (_c: string, roleId: string) => ({
              single: async () => ({
                data: { id: roleId, name: 'super_admin', display_name: 'Super Admin' },
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'system_settings') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { value: await general }, error: null }),
            }),
          }),
        };
      }
      // role_permissions
      return {
        select: () => ({
          eq: async (_c: string, roleId: string) => ({
            data: users[roleId.replace('role-', '')].permissions.map((name) => ({ permission: { name } })),
            error: null,
          }),
        }),
      };
    },
  };
}

function Consumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="pid">{auth.profile?.id ?? ''}</span>
      <span data-testid="override">{String(auth.portalAccessOverride)}</span>
      <span data-testid="general">{String(auth.residentPortalEnabled)}</span>
      <span data-testid="self">{String(auth.canSeeSelfPortalLinks)}</span>
      <span data-testid="imp">{String(auth.canSeeImpersonationLink)}</span>
    </div>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;
const IMPERSONATE = 'impersonation.start_session';
const ok = (value: string | null): Result => ({ data: { portal_access_override: value }, error: null });

function mount(initialUserId = 'A') {
  supabaseClient = makeSupabase(initialUserId);
  return render(
    <AuthProvider>
      <Consumer />
    </AuthProvider>
  );
}

beforeEach(() => {
  sessionStorage.clear();
  authListener = null;
  general = true;
  users = {};
});
afterEach(() => cleanup());

describe('AuthProvider portal visibility inputs (#423)', () => {
  it('starts hidden: both link booleans are false before the fetches resolve', async () => {
    const generalGate = deferred<unknown>();
    const overrideGate = deferred<Result>();
    general = generalGate.promise;
    users = { A: { residentId: 'res-1', override: overrideGate.promise, permissions: [IMPERSONATE] } };
    mount();
    // Before the profile even loads.
    expect(text('general')).toBe('false');
    expect(text('self')).toBe('false');
    await waitFor(() => expect(text('pid')).toBe('A'));
    // Profile loaded, fetches still pending.
    expect(text('general')).toBe('false');
    expect(text('self')).toBe('false');
    expect(text('imp')).toBe('false');

    await act(async () => {
      generalGate.resolve(true);
      overrideGate.resolve(ok(null));
    });
    await waitFor(() => expect(text('self')).toBe('true'));
    expect(text('imp')).toBe('true');
  });

  it('ignores a stale response for the previous account after a switch', async () => {
    const gateA = deferred<Result>();
    users = {
      A: { residentId: 'res-1', override: gateA.promise, permissions: [] },
      B: { residentId: 'res-2', override: ok('disabled'), permissions: [] },
    };
    mount();
    await waitFor(() => expect(text('pid')).toBe('A'));
    await act(async () => {
      await authListener!('SIGNED_IN', { user: authUser('B') });
    });
    await waitFor(() => expect(text('pid')).toBe('B'));
    await waitFor(() => expect(text('override')).toBe('disabled'));
    // A's fetch finally resolves with 'enabled'; it must not overwrite B.
    await act(async () => {
      gateA.resolve(ok('enabled'));
    });
    expect(text('override')).toBe('disabled');
    expect(text('self')).toBe('false');
  });

  it('gives both false when the general switch is on but the override is disabled', async () => {
    users = { A: { residentId: 'res-1', override: ok('disabled'), permissions: [IMPERSONATE] } };
    mount();
    await waitFor(() => expect(text('override')).toBe('disabled'));
    expect(text('general')).toBe('true');
    expect(text('self')).toBe('false');
    expect(text('imp')).toBe('false');
  });

  it('hides self-portal links for a profile with no resident_id even when visible', async () => {
    users = { A: { residentId: null, override: ok(null), permissions: [IMPERSONATE] } };
    mount();
    await waitFor(() => expect(text('general')).toBe('true'));
    expect(text('self')).toBe('false');
    expect(text('imp')).toBe('true');
  });

  it('hides the impersonation link without the permission even when visible', async () => {
    users = { A: { residentId: 'res-1', override: ok(null), permissions: [] } };
    mount();
    await waitFor(() => expect(text('general')).toBe('true'));
    expect(text('self')).toBe('true');
    expect(text('imp')).toBe('false');
  });

  it('shows the new account values, never the previous ones, while its fetch is pending', async () => {
    const gateB = deferred<Result>();
    users = {
      A: { residentId: 'res-1', override: ok('enabled'), permissions: [] },
      B: { residentId: 'res-2', override: gateB.promise, permissions: [] },
    };
    mount();
    await waitFor(() => expect(text('override')).toBe('enabled'));
    expect(text('self')).toBe('true');

    await act(async () => {
      await authListener!('SIGNED_IN', { user: authUser('B') });
    });
    await waitFor(() => expect(text('pid')).toBe('B'));
    // B's override fetch is still pending: A's 'enabled' must be gone.
    expect(text('override')).toBe('null');
    expect(text('general')).toBe('false');
    expect(text('self')).toBe('false');

    await act(async () => {
      gateB.resolve(ok('disabled'));
    });
    await waitFor(() => expect(text('override')).toBe('disabled'));
  });
});
