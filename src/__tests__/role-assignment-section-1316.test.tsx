// @vitest-environment jsdom
// Issue #1316: the Assign Roles section is gated on system.assign_roles alone,
// and a search reply that is no longer the latest never replaces newer results.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { perms, search } = vi.hoisted(() => ({
  perms: { held: [] as string[] },
  search: {
    residents: vi.fn(),
    profiles: vi.fn(),
  },
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    residentPortalEnabled: false,
    hasPermission: (p: string) => perms.held.includes(p),
  }),
}));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: vi.fn() }) }));
vi.mock('@/hooks/use-roles', () => ({
  useAssignableRoles: () => ({ data: [], isLoading: false, error: null }),
  useAdminTitles: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock('@/hooks/use-portal-access', () => ({ usePortalAccessOverrides: () => ({ data: {} }) }));
vi.mock('@/components/admin/portal-access-control', () => ({ PortalAccessControl: () => null }));
vi.mock('@/components/admin/link-account-dialog', () => ({ LinkAccountDialog: () => null }));
vi.mock('@/actions/roles/assign-role', () => ({
  searchResidentsForRoleAssignment: search.residents,
  searchProfilesForRoleAssignment: search.profiles,
  assignRoleToResident: vi.fn(),
  removeRoleFromResident: vi.fn(),
  assignRoleToProfile: vi.fn(),
  removeRoleFromProfile: vi.fn(),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { RoleAssignmentSection } from '@/components/admin/role-assignment-section';

const resident = (id: string, first: string) => ({
  id, first_name: first, last_name: 'Resident', email: `${id}@x.test`, phone_primary: null, house_address: null,
  profile_id: null, approval_status: null, current_role_id: null, current_role_name: null,
  current_role_display_name: null, current_title_id: null, current_title_name: null,
});
const account = (id: string, name: string) => ({
  profile_id: id, email: `${id}@x.test`, full_name: name, approval_status: 'active', resident_id: null,
  current_role_id: null, current_role_name: null, current_role_display_name: null,
  current_title_id: null, current_title_name: null,
});

beforeEach(() => {
  // jsdom lacks what the cmdk list and Radix popover call.
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  perms.held = [PERMISSIONS.SYSTEM_ASSIGN_ROLES];
  search.residents.mockReset();
  search.profiles.mockReset();
});
afterEach(() => cleanup());

describe('RoleAssignmentSection (#1316)', () => {
  it('is closed to someone with system.manage_roles but not system.assign_roles', () => {
    perms.held = [PERMISSIONS.SYSTEM_MANAGE_ROLES];
    render(<RoleAssignmentSection />);
    expect(screen.getByText(/permission to assign roles/)).toBeInTheDocument();
  });

  it('re-runs the query on a mode switch and ignores the slower reply from the old mode', async () => {
    let answerResidents: (value: unknown) => void = () => {};
    search.residents.mockImplementation(() => new Promise((resolve) => (answerResidents = resolve)));
    search.profiles.mockResolvedValue({ data: [account('acc-1', 'Ada Account')] });

    render(<RoleAssignmentSection />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Search residents...'), { target: { value: 'Ada' } });
    await waitFor(() => expect(search.residents).toHaveBeenCalledWith('Ada'));

    fireEvent.click(screen.getByRole('radio', { name: 'Search accounts' }));
    await waitFor(() => expect(search.profiles).toHaveBeenCalledWith('Ada'));
    expect(await screen.findByText('Ada Account')).toBeInTheDocument();

    // The residents reply arrives after the accounts one and must not replace it.
    await act(async () => answerResidents({ data: [resident('res-1', 'Stale')] }));
    expect(screen.queryByText('Stale Resident')).not.toBeInTheDocument();
    expect(screen.getByText('Ada Account')).toBeInTheDocument();
  });

  it('blocks a role for a resident whose account is still pending', async () => {
    search.residents.mockResolvedValue({
      data: [{ ...resident('res-2', 'Penny'), profile_id: 'p-2', approval_status: 'pending' }],
    });

    render(<RoleAssignmentSection />);
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(screen.getByPlaceholderText('Search residents...'), { target: { value: 'Penny' } });
    fireEvent.click(await screen.findByText('Penny Resident'));

    expect(screen.getByText('Account Not Approved')).toBeInTheDocument();
    expect(screen.getByText(/Approve it under Pending sign-ups/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Assign Role/ })).toBeDisabled();
  });
});
