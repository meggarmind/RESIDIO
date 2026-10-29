// @vitest-environment jsdom
// Issue #912: /settings/roles and /system/accounts merge into one Roles & Access page,
// which #939 moved to /settings/access.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { mocks, replace, redirect } = vi.hoisted(() => ({
  mocks: { permissions: [] as string[], search: '' },
  replace: vi.fn(),
  redirect: vi.fn(),
}));

const { ADMINS, ROLES, ORPHANS, mutation } = vi.hoisted(() => {
  const mutation = () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false });
  const ADMINS = [
  { id: 'a1', profile_id: 'u-1', first_name: 'Ada', last_name: 'Okoro', email: 'ada@x.test', house_address: null, role_id: 'r1', role_name: 'treasurer', role_display_name: 'Treasurer' },
  { id: 'a2', profile_id: 'u-2', first_name: 'Bayo', last_name: 'Ade', email: 'bayo@x.test', house_address: null, role_id: 'r2', role_name: 'secretary', role_display_name: 'Secretary' },
];
  const ROLES = [
  { id: 'r1', name: 'treasurer', display_name: 'Treasurer', category: 'exco', is_active: true, is_system_role: false, permissions: [], user_count: 1 },
  { id: 'r3', name: 'resident', display_name: 'Resident', category: 'resident', is_active: true, is_system_role: true, permissions: [], user_count: 40 },
];
  const ORPHANS = [
  { id: 'u-1', email: 'other@x.test', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, email_confirmed_at: null },
  { id: 'u-9', email: 'BAYO@x.test', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, email_confirmed_at: null },
  { id: 'u-7', email: 'nobody@x.test', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, email_confirmed_at: null },
];

  return { ADMINS, ROLES, ORPHANS, mutation };
});

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    profile: { role_name: 'super_admin' },
    residentPortalEnabled: true,
    hasPermission: (p: string) => mocks.permissions.includes(p),
    hasAnyPermission: (ps: string[]) => ps.some((p) => mocks.permissions.includes(p)),
  }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, push: vi.fn() }),
  usePathname: () => '/settings/access',
  useSearchParams: () => new URLSearchParams(mocks.search),
  redirect,
}));

vi.mock('@/hooks/use-roles', () => ({
  useCurrentAdmins: () => ({ data: ADMINS, isLoading: false, error: null }),
  useRolesWithPermissions: () => ({ data: ROLES, isLoading: false }),
  useAssignableRoles: () => ({ data: ROLES, isLoading: false, error: null }),
  usePermissions: () => ({ data: [], isLoading: false }),
  useCreateRoleWithPermissions: mutation,
  useUpdateRole: mutation,
  useDeleteRole: mutation,
  useAdminTitles: () => ({ data: [], isLoading: false }),
  useCreateAdminTitle: mutation,
  useUpdateAdminTitle: mutation,
  useDeleteAdminTitle: mutation,
}));
vi.mock('@tanstack/react-query', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-query')>()),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock('@/hooks/use-portal-access', () => ({ usePortalAccessOverrides: () => ({ data: {} }) }));
vi.mock('@/hooks/use-auth-accounts', () => ({
  useOrphanedAuthAccounts: () => ({ data: ORPHANS, isLoading: false, error: null, refetch: vi.fn(), isRefetching: false }),
  useLinkAuthAccount: mutation,
}));
vi.mock('@/hooks/use-pending-accounts', () => ({
  usePendingAccounts: () => ({ data: [], isLoading: false, error: null, refetch: vi.fn(), isRefetching: false }),
  useApproveAccount: mutation,
  useRejectAccount: mutation,
}));
vi.mock('@/actions/roles/assign-role', () => ({
  searchResidentsForRoleAssignment: vi.fn(),
  assignRoleToProfile: vi.fn(),
  removeRoleFromProfile: vi.fn(),
}));
vi.mock('@/components/admin/portal-access-control', () => ({ PortalAccessControl: () => null }));
vi.mock('@/components/admin/role-assignment-section', () => ({ RoleAssignmentSection: () => null }));
vi.mock('@/components/admin/role-assignment-rules', () => ({ RoleAssignmentRulesEditor: () => <p>rules editor</p> }));
vi.mock('@/components/admin/role-permissions-dialog', () => ({ RolePermissionsDialog: () => null }));
vi.mock('@/components/admin/permission-picker', () => ({ PermissionPicker: () => null }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn(), info: vi.fn() } }));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import AccountsPage from '@/app/(dashboard)/settings/access/page';
import AccountsRedirect from '@/app/(dashboard)/system/accounts/page';
import RolesRedirect from '@/app/(dashboard)/settings/roles/page';
import UserRolesRedirect from '@/app/(dashboard)/settings/user-roles/page';

const ASSIGN = PERMISSIONS.SYSTEM_ASSIGN_ROLES;
const MANAGE = PERMISSIONS.SYSTEM_MANAGE_ROLES;

const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent?.trim());
const selectedTab = () => screen.getAllByRole('tab').find((t) => t.getAttribute('aria-selected') === 'true')?.textContent?.trim();

function open(search: string, permissions: string[]) {
  mocks.search = search;
  mocks.permissions = permissions;
  return render(<AccountsPage />);
}

beforeEach(() => {
  replace.mockReset();
  redirect.mockReset();
});
afterEach(() => cleanup());

describe('Roles & Access tabs are gated by permission (#912)', () => {
  it('shows only the three assign_roles tabs, in order, to an assign-only admin', () => {
    open('', [ASSIGN]);
    expect(tabNames()).toEqual(['Administrators', 'Pending sign-ups', 'Unlinked logins']);
    expect(screen.getByRole('heading', { name: 'Roles & Access' })).toBeInTheDocument();
  });

  it('adds Roles and Who can hold each role, after the others, with manage_roles', () => {
    open('', [ASSIGN, MANAGE]);
    expect(tabNames()).toEqual([
      'Administrators',
      'Pending sign-ups',
      'Unlinked logins',
      'Roles',
      'Who can hold each role',
    ]);
  });

  it('never renders the role editor for an assign-only admin who opens ?tab=roles or ?tab=rules', () => {
    for (const tab of ['roles', 'rules']) {
      const { unmount } = open(`tab=${tab}`, [ASSIGN]);
      expect(selectedTab()).toBe('Administrators');
      expect(screen.queryByText('rules editor')).not.toBeInTheDocument();
      expect(screen.queryByRole('columnheader', { name: 'Holders' })).not.toBeInTheDocument();
      unmount();
    }
  });
});

describe('?tab= round trip (#912)', () => {
  it('defaults to Administrators', () => {
    open('', [ASSIGN, MANAGE]);
    expect(selectedTab()).toBe('Administrators');
  });

  it.each([
    ['administrators', 'Administrators'],
    ['pending', 'Pending sign-ups'],
    ['unlinked', 'Unlinked logins'],
    ['roles', 'Roles'],
    ['rules', 'Who can hold each role'],
    ['assignments', 'Administrators'],
    ['orphaned', 'Unlinked logins'],
    ['nonsense', 'Administrators'],
  ])('reads ?tab=%s', (tab, label) => {
    open(`tab=${tab}`, [ASSIGN, MANAGE]);
    expect(selectedTab()).toBe(label);
  });

  it('writes ?tab= with router.replace on every tab change, without scrolling', () => {
    open('', [ASSIGN, MANAGE]);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Unlinked logins' }), { button: 0 });
    expect(replace).toHaveBeenLastCalledWith('/settings/access?tab=unlinked', { scroll: false });
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Roles' }), { button: 0 });
    expect(replace).toHaveBeenLastCalledWith('/settings/access?tab=roles', { scroll: false });
  });

  it('drops the role filter when leaving the Administrators tab', () => {
    open('tab=administrators&role=treasurer', [ASSIGN, MANAGE]);
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Pending sign-ups' }), { button: 0 });
    expect(replace).toHaveBeenLastCalledWith('/settings/access?tab=pending', { scroll: false });
  });

  it('keeps the five-tab bar scrolling inside itself rather than widening the page', () => {
    open('', [ASSIGN, MANAGE]);
    // jsdom has no layout, so this pins the mechanism: the tablist's wrapper owns the overflow.
    const wrapper = screen.getByRole('tablist').parentElement!;
    expect(wrapper.className).toContain('overflow-x-auto');
    expect(screen.getByRole('tablist').className).toContain('w-max');
  });
});

describe('old routes redirect (#912)', () => {
  it('sends /settings/roles to the Roles tab and keeps ?tab=rules', async () => {
    await RolesRedirect({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenLastCalledWith('/settings/access?tab=roles');
    await RolesRedirect({ searchParams: Promise.resolve({ tab: 'rules' }) });
    expect(redirect).toHaveBeenLastCalledWith('/settings/access?tab=rules');
    await RolesRedirect({ searchParams: Promise.resolve({ tab: 'roles' }) });
    expect(redirect).toHaveBeenLastCalledWith('/settings/access?tab=roles');
  });

  it('sends /system/accounts to /settings/access with every query value (#939)', async () => {
    await AccountsRedirect({ searchParams: Promise.resolve({}) });
    expect(redirect).toHaveBeenLastCalledWith('/settings/access');
    for (const tab of ['administrators', 'pending', 'unlinked', 'roles', 'rules', 'assignments', 'orphaned']) {
      await AccountsRedirect({ searchParams: Promise.resolve({ tab }) });
      expect(redirect).toHaveBeenLastCalledWith(`/settings/access?tab=${tab}`);
    }
    await AccountsRedirect({ searchParams: Promise.resolve({ tab: 'administrators', role: 'vice chairman' }) });
    expect(redirect).toHaveBeenLastCalledWith('/settings/access?tab=administrators&role=vice+chairman');
  });

  it('sends /settings/user-roles to the Administrators tab', () => {
    UserRolesRedirect();
    expect(redirect).toHaveBeenLastCalledWith('/settings/access?tab=administrators');
  });
});

describe('links between tabs (#912)', () => {
  it('shows a holder count per role that links to the Administrators tab filtered to the role', () => {
    open('tab=roles', [ASSIGN, MANAGE]);
    const link = screen.getAllByRole('link', { name: '1 holder of Treasurer' })[0];
    expect(link).toHaveAttribute('href', '/settings/access?tab=administrators&role=treasurer');
    expect(link).toHaveTextContent('1');
  });

  it('does not link the Resident role, which no administrator holds', () => {
    open('tab=roles', [ASSIGN, MANAGE]);
    expect(screen.queryByRole('link', { name: /holders of Resident/ })).not.toBeInTheDocument();
    expect(screen.getAllByText('40').length).toBeGreaterThan(0);
  });

  it('filters Administrators by ?role= and offers a way to clear it', () => {
    open('tab=administrators&role=treasurer', [ASSIGN]);
    expect(screen.getByText('Ada Okoro')).toBeInTheDocument();
    expect(screen.queryByText('Bayo Ade')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing:/)).toHaveTextContent('Showing: Treasurer');
    expect(screen.getByRole('link', { name: '(clear)' })).toHaveAttribute('href', '/settings/access?tab=administrators');
  });

  it('lists every administrator when there is no ?role=', () => {
    open('tab=administrators', [ASSIGN]);
    expect(screen.getByText('Ada Okoro')).toBeInTheDocument();
    expect(screen.getByText('Bayo Ade')).toBeInTheDocument();
    expect(screen.queryByText(/Showing:/)).not.toBeInTheDocument();
  });

  it('links the empty Pending state to Roles for someone who can manage roles', () => {
    open('tab=pending', [ASSIGN, MANAGE]);
    expect(screen.getByRole('link', { name: 'Roles' })).toHaveAttribute('href', '/settings/access?tab=roles');
  });

  it('does not offer that link to someone who cannot open the Roles tab', () => {
    open('tab=pending', [ASSIGN]);
    expect(screen.queryByRole('link', { name: 'Roles' })).not.toBeInTheDocument();
  });

  it('no longer says role assignment is part of the Settings module', () => {
    const { container } = open('tab=administrators', [ASSIGN]);
    expect(container).not.toHaveTextContent('part of the Settings module');
  });
});

describe('Unlinked logins (#912)', () => {
  it('badges logins that already hold a role, by user id or email, and hides none', () => {
    open('tab=unlinked', [ASSIGN]);
    expect(screen.getAllByText(/^Holds role:/)).toHaveLength(2);
    const byId = screen.getByText('other@x.test').closest('tr')!;
    const byEmail = screen.getByText('BAYO@x.test').closest('tr')!;
    const neither = screen.getByText('nobody@x.test').closest('tr')!;
    expect(within(byId).getByText('Holds role: Treasurer')).toBeInTheDocument();
    expect(within(byEmail).getByText('Holds role: Secretary')).toBeInTheDocument();
    expect(within(neither).queryByText(/Holds role:/)).not.toBeInTheDocument();
  });

  it('uses the new name and none of the implementation words', () => {
    const { container } = open('tab=unlinked', [ASSIGN]);
    expect(screen.getAllByText('Unlinked logins').length).toBeGreaterThan(1);
    expect(container).not.toHaveTextContent(/Supabase|Orphaned|Auth Account/);
    expect(screen.getByRole('button', { name: /Refresh/ })).toBeInTheDocument();
  });
});

describe('navigation, search and route guards (#912)', () => {
  it('takes Roles & Access out of the Oversight menu (#939)', async () => {
    const { oversightConfig } = await import('@/config/oversight-nav');
    expect(oversightConfig.flatMap((g) => g.items).map((i) => i.href)).not.toContain('/system/accounts');
  });

  it('lists Roles & Access in Settings at /settings/access, indexed for search (#939)', async () => {
    const { settingsConfig } = await import('@/config/settings-nav');
    const { SETTINGS_SEARCH_ENTRIES } = await import('@/lib/search/settings-search-entries');
    const items = settingsConfig.flatMap((g) => g.items);
    expect(items.find((i) => i.title === 'Roles & Access')?.href).toBe('/settings/access');
    const entry = SETTINGS_SEARCH_ENTRIES.find((e) => e.title === 'Roles & Access');
    expect(entry?.href).toBe('/settings/access');
    expect(entry?.permissions).toEqual([ASSIGN]);
    expect(SETTINGS_SEARCH_ENTRIES.some((e) => e.href.startsWith('/system/accounts'))).toBe(false);
  });

  it('keeps the old route guards, because the redirect runs after middleware', async () => {
    const { ROUTE_PERMISSIONS } = await import('@/lib/auth/action-roles');
    expect(ROUTE_PERMISSIONS['/settings/roles']).toEqual([MANAGE, ASSIGN]);
    expect(ROUTE_PERMISSIONS['/settings/user-roles']).toEqual([MANAGE, ASSIGN]);
    expect(ROUTE_PERMISSIONS['/system/accounts']).toEqual([ASSIGN]);
    // The new route carries the old page's guard unchanged (#939).
    expect(ROUTE_PERMISSIONS['/settings/access']).toEqual([ASSIGN]);
  });
});
