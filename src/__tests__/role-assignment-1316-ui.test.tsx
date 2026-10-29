// @vitest-environment jsdom
// Issue #1316: the assignment dialogs never show an empty role or title list,
// the Title area shows whenever a role is chosen, and the Reject text says only
// what the app does.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { perms, rolesQuery, titlesQuery, pending, mutation } = vi.hoisted(() => ({
  perms: { held: [] as string[] },
  rolesQuery: { current: { data: [] as unknown[], isLoading: false, error: null as Error | null } },
  titlesQuery: { current: { data: [] as unknown[], isLoading: false, error: null as Error | null } },
  pending: { accounts: [] as unknown[] },
  mutation: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    residentPortalEnabled: false,
    hasPermission: (p: string) => perms.held.includes(p),
  }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/actions/roles/assign-role', () => ({
  assignRoleToProfile: vi.fn(),
  removeRoleFromProfile: vi.fn(),
  searchResidentsForRoleAssignment: vi.fn(async () => ({ data: [] })),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/use-roles', () => ({
  useAssignableRoles: () => rolesQuery.current,
  useAdminTitles: () => titlesQuery.current,
}));
vi.mock('@/hooks/use-pending-accounts', () => ({
  usePendingAccounts: () => ({ data: pending.accounts, isLoading: false, error: null, refetch: vi.fn(), isRefetching: false }),
  useApproveAccount: mutation,
  useRejectAccount: mutation,
}));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { AdminRoleActions } from '@/components/admin/admin-role-actions';
import { PendingAccountsList } from '@/components/admin/pending-accounts-list';
import { RoleTitlePicker } from '@/components/admin/role-title-picker';

const ASSIGN = PERMISSIONS.SYSTEM_ASSIGN_ROLES;

const SECRETARY = { id: 'r-sec', name: 'secretary', display_name: 'Secretary', description: null, category: 'exco', is_active: true, requires_resident: false };
const TRUSTEE = { id: 'r-tr', name: 'trustee', display_name: 'Trustee', description: null, category: 'exco', is_active: true, requires_resident: true };

const admin = {
  id: 'x', profile_id: 'p1', first_name: 'Jane', last_name: 'Doe', email: null, house_address: null,
  resident_id: 'res-1', role_id: 'r-sec', role_name: 'secretary', role_display_name: 'Secretary',
  title_id: null, title_name: null,
};

const PENDING = {
  id: 'pending-1', email: 'new@x.test', full_name: 'New Person', created_at: '2026-10-01T00:00:00Z',
  provider: 'email', last_sign_in_at: null, email_confirmed: true, resident_id: null,
};

beforeEach(() => {
  perms.held = [ASSIGN];
  rolesQuery.current = { data: [SECRETARY, TRUSTEE], isLoading: false, error: null };
  titlesQuery.current = { data: [], isLoading: false, error: null };
  pending.accounts = [PENDING];
});
afterEach(() => cleanup());

describe('RoleTitlePicker Title area (#1316)', () => {
  it('shows the Title area with "No titles for this role" when the role has none', () => {
    render(<RoleTitlePicker role={SECRETARY} titles={[]} titleId="" onTitleChange={vi.fn()} profileId="p1" hasResidentLink />);

    expect(screen.getByText('Title')).toBeInTheDocument();
    expect(screen.getByText('No titles for this role')).toBeInTheDocument();
  });

  it('shows why the titles could not be loaded instead of an empty list', () => {
    render(
      <RoleTitlePicker role={SECRETARY} titles={[]} titleId="" onTitleChange={vi.fn()} profileId="p1" hasResidentLink titlesError="Failed to load titles" />
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the titles: Failed to load titles');
    expect(screen.queryByText('No titles for this role')).not.toBeInTheDocument();
  });

  it('shows no Title area before a role is chosen', () => {
    render(<RoleTitlePicker role={undefined} titles={[]} titleId="" onTitleChange={vi.fn()} profileId="p1" hasResidentLink />);
    expect(screen.queryByText('Title')).not.toBeInTheDocument();
  });
});

describe('Change role dialog role list (#1316)', () => {
  const openChange = () => {
    render(<AdminRoleActions admin={admin} />);
    fireEvent.click(screen.getByRole('button', { name: /change role for jane doe/i }));
  };

  it('shows the server\'s reason when the roles cannot be loaded', () => {
    rolesQuery.current = { data: undefined as never, isLoading: false, error: new Error('Unauthorized: Missing permission') };
    openChange();

    expect(screen.getByText('Could not load the roles: Unauthorized: Missing permission')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  });

  it('says "No roles you can give" when every role needs a permission the caller lacks', () => {
    rolesQuery.current = { data: [TRUSTEE], isLoading: false, error: null };
    openChange();

    expect(screen.getByText('No roles you can give')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Role' })).not.toBeInTheDocument();
  });

  it('offers a role list to a caller with only system.assign_roles', () => {
    openChange();

    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument();
    expect(screen.getByText('No titles for this role')).toBeInTheDocument();
  });
});

describe('Pending sign-ups dialogs (#1316)', () => {
  it('Approve offers a resident record and says when no role can be given', () => {
    rolesQuery.current = { data: [TRUSTEE], isLoading: false, error: null };
    render(<PendingAccountsList />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(screen.getByLabelText('Resident record (optional)')).toBeInTheDocument();
    expect(screen.getByText('No roles you can give')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Approve account' })).toBeDisabled();
  });

  it('Approve shows the load error for the roles', () => {
    rolesQuery.current = { data: undefined as never, isLoading: false, error: new Error('Could not load the roles') };
    render(<PendingAccountsList />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(screen.getByRole('alert')).toHaveTextContent('Could not load the roles: Could not load the roles');
  });

  it('Approve does not offer a resident picker for an account already linked', () => {
    pending.accounts = [{ ...PENDING, resident_id: 'res-9' }];
    render(<PendingAccountsList />);
    fireEvent.click(screen.getByRole('button', { name: /approve/i }));

    expect(screen.getByText('This account is already linked to a resident record.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Resident record (optional)')).not.toBeInTheDocument();
  });

  it('Reject says what happens, and not that the person is signed out', () => {
    render(<PendingAccountsList />);
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));

    const dialog = screen.getByRole('dialog');
    expect(dialog).not.toHaveTextContent('signed out');
    expect(dialog).toHaveTextContent('they see that the request was declined and the reason you give below');
    expect(dialog).toHaveTextContent('A rejected sign-up cannot be approved later.');
  });
});
