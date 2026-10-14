// @vitest-environment jsdom
//
// #423: the AuthProvider loads profiles.portal_access_override in a separate
// query. If the migration is not applied that query errors; the profile must
// still load and the portal links must stay hidden (fail closed).

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
  resident_id: 'res-1',
};

let supabaseClient: unknown;

vi.mock('@/lib/supabase/client', () => ({ createClient: () => supabaseClient }));
vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
vi.mock('@/actions/auth/get-server-session', () => ({
  getServerSession: async () => ({ session: null, error: null }),
}));
vi.mock('@/lib/offline/admin-read-cache', () => ({ clearAdminReadCache: async () => {} }));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

const { AuthProvider, useAuth } = await import('@/lib/auth/auth-provider');

function makeSupabase({
  overrideResult,
  generalValue,
}: {
  overrideResult: { data: unknown; error: unknown };
  generalValue: unknown;
}) {
  return {
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
      getSession: async () => ({ data: { session: { user: AUTH_USER } } }),
      getUser: async () => ({ data: { user: AUTH_USER } }),
    },
    from: (table: string) => {
      if (table === 'profiles') {
        return {
          select: (columns: string) => ({
            eq: () => ({
              // The main profile query must never ask for the new column.
              single: async () => {
                if (columns.includes('portal_access_override')) {
                  return { data: null, error: { message: 'column does not exist' } };
                }
                return { data: PROFILE_ROW, error: null };
              },
              maybeSingle: async () => overrideResult,
            }),
          }),
        };
      }
      if (table === 'app_roles') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { display_name: 'Super Admin' },
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
              maybeSingle: async () => ({ data: { value: generalValue }, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
    rpc: async () => ({
      data: [
        { role_id: 'role-1', role_name: 'super_admin', permission_name: 'impersonation.start_session' },
      ],
      error: null,
    }),
  };
}

function Consumer() {
  const auth = useAuth();
  return (
    <div>
      <span data-testid="name">{auth.profile?.full_name ?? ''}</span>
      <span data-testid="override">{String(auth.portalAccessOverride)}</span>
      <span data-testid="general">{String(auth.residentPortalEnabled)}</span>
      <span data-testid="self">{String(auth.canSeeSelfPortalLinks)}</span>
      <span data-testid="imp">{String(auth.canSeeImpersonationLink)}</span>
    </div>
  );
}

describe('AuthProvider portal visibility (#423)', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => cleanup());

  it('keeps the profile and hides the links when the override query errors', async () => {
    supabaseClient = makeSupabase({
      overrideResult: { data: null, error: { message: 'column profiles.portal_access_override does not exist' } },
      generalValue: false,
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('name').textContent).toBe('Admin User'));
    expect(screen.getByTestId('override').textContent).toBe('null');
    expect(screen.getByTestId('self').textContent).toBe('false');
    expect(screen.getByTestId('imp').textContent).toBe('false');
  });

  it('shows the links when the override is enabled even though the general switch is off', async () => {
    supabaseClient = makeSupabase({
      overrideResult: { data: { portal_access_override: 'enabled' }, error: null },
      generalValue: false,
    });
    render(
      <AuthProvider>
        <Consumer />
      </AuthProvider>
    );
    await waitFor(() => expect(screen.getByTestId('override').textContent).toBe('enabled'));
    expect(screen.getByTestId('general').textContent).toBe('false');
    expect(screen.getByTestId('self').textContent).toBe('true');
    expect(screen.getByTestId('imp').textContent).toBe('true');
  });
});
