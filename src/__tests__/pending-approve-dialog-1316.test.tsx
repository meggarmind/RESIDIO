// @vitest-environment jsdom
// Issue #1316 (QA follow-up): the Approve dialog's resident picker, what it
// sends, and when it refuses to submit.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const { perms, approve, search, titles } = vi.hoisted(() => ({
  perms: { held: [] as string[] },
  approve: { mutateAsync: vi.fn(), mutate: vi.fn(), isPending: false },
  search: vi.fn(),
  titles: { data: [] as unknown[] },
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: (p: string) => perms.held.includes(p) }),
}));
vi.mock('@/hooks/use-roles', () => ({
  useAssignableRoles: () => ({
    data: [
      { id: 'r-sec', name: 'secretary', display_name: 'Secretary', description: null, category: 'exco', is_active: true, requires_resident: false },
      { id: 'r-wel', name: 'welfare_officer', display_name: 'Welfare Officer', description: null, category: 'exco', is_active: true, requires_resident: true },
    ],
    isLoading: false,
    error: null,
  }),
  useAdminTitles: () => ({ data: titles.data, isLoading: false, error: null }),
}));
vi.mock('@/hooks/use-pending-accounts', () => ({
  usePendingAccounts: () => ({
    data: [{ id: 'pending-1', email: 'new@x.test', full_name: 'New Person', created_at: '2026-10-01T00:00:00Z', provider: 'email', last_sign_in_at: null, email_confirmed: true, resident_id: null }],
    isLoading: false, error: null, refetch: vi.fn(), isRefetching: false,
  }),
  useApproveAccount: () => approve,
  useRejectAccount: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/actions/roles/assign-role', () => ({ searchResidentsForRoleAssignment: search }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <a>{children}</a> }));

import { PERMISSIONS } from '@/lib/auth/action-roles';
import { PendingAccountsList } from '@/components/admin/pending-accounts-list';

const resident = (id: string, first: string, profileId: string | null) => ({
  id, first_name: first, last_name: 'Res', email: null, phone_primary: null, house_address: null,
  profile_id: profileId, approval_status: null, current_role_id: null, current_role_name: null,
  current_role_display_name: null, current_title_id: null, current_title_name: null,
});

/** Opens a Radix Select by its trigger and picks an option. */
function choose(trigger: HTMLElement, option: string) {
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: 'mouse' });
  fireEvent.click(screen.getByRole('option', { name: option }));
}

beforeEach(() => {
  if (!Element.prototype.hasPointerCapture) {
    Element.prototype.hasPointerCapture = () => false;
    Element.prototype.setPointerCapture = () => {};
    Element.prototype.releasePointerCapture = () => {};
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {};
  }
  perms.held = [PERMISSIONS.SYSTEM_ASSIGN_ROLES];
  approve.mutateAsync.mockReset();
  approve.mutateAsync.mockResolvedValue({ success: true });
  search.mockReset();
  search.mockResolvedValue({ data: [resident('res-free', 'Fola', null), resident('res-linked', 'Lara', 'someone')] });
  titles.data = [{ id: 't-wel', role_id: 'r-wel', name: 'Welfare Officer', is_principal: true, seats: 1, sort_order: 0, holders: [] }];
});
afterEach(() => cleanup());

function openApprove() {
  render(<PendingAccountsList />);
  fireEvent.click(screen.getByRole('button', { name: /^approve$/i }));
  return screen.getByRole('dialog');
}

async function pickResident(dialog: HTMLElement) {
  fireEvent.change(within(dialog).getByLabelText('Resident record (optional)'), { target: { value: 'ola' } });
  fireEvent.click(await within(dialog).findByRole('button', { name: /Fola Res/ }));
}

describe('Approve dialog (#1316)', () => {
  it('asks only for residents with no account, and lists none that has one', async () => {
    const dialog = openApprove();
    fireEvent.change(within(dialog).getByLabelText('Resident record (optional)'), { target: { value: 'ola' } });

    expect(await within(dialog).findByRole('button', { name: /Fola Res/ })).toBeInTheDocument();
    expect(search).toHaveBeenCalledWith('ola', { unlinkedOnly: true });
    expect(within(dialog).queryByRole('button', { name: /Lara Res/ })).not.toBeInTheDocument();
  });

  it('will not submit a resident-only role without a resident record', () => {
    const dialog = openApprove();
    choose(within(dialog).getByLabelText('Role'), 'Welfare Officer');

    expect(within(dialog).getByRole('alert')).toHaveTextContent('can only be held by a resident');
    expect(within(dialog).getByRole('button', { name: 'Approve account' })).toBeDisabled();
  });

  it('sends the chosen resident and title with the role', async () => {
    const dialog = openApprove();
    await pickResident(dialog);
    choose(within(dialog).getByLabelText('Role'), 'Welfare Officer');
    choose(within(dialog).getByRole('combobox', { name: 'Title' }), 'Welfare Officer');

    const submit = within(dialog).getByRole('button', { name: 'Approve account' });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() =>
      expect(approve.mutateAsync).toHaveBeenCalledWith({
        profileId: 'pending-1',
        roleId: 'r-wel',
        residentId: 'res-free',
        titleId: 't-wel',
      })
    );
  });
});
