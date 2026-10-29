// @vitest-environment jsdom
//
// #1317: account-linking UI. Staff with a role are listed apart from unlinked
// logins, approval status shows, the resident search runs once per settled query
// and reports errors, and the link dialog confirms before linking and resets when
// the resident changes.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORPHANS = [
  { id: 'a1', email: 'plain@x.test', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, email_confirmed_at: null, approval_status: 'pending' },
  { id: 'a2', email: 'staff@x.test', created_at: '2026-01-02T00:00:00Z', last_sign_in_at: null, email_confirmed_at: null, approval_status: 'active' },
  { id: 'a3', email: 'gone@x.test', created_at: '2026-01-03T00:00:00Z', last_sign_in_at: null, email_confirmed_at: null, approval_status: 'suspended' },
];
const ADMINS = [{ profile_id: 'a2', email: 'staff@x.test', role_display_name: 'Treasurer' }];

const linkMutateAsync = vi.hoisted(() => vi.fn(async () => ({ success: true })));
const searchState = vi.hoisted(() => ({ error: null as Error | null }));
const searchResidents = vi.hoisted(() => vi.fn());
const debounce = vi.hoisted(() => ({ pending: false }));

// useDeferredValue settles at once in jsdom, so the pending flag is driven by hand.
vi.mock('@/hooks/use-debounced-value', async () => {
  const { useState } = await import('react');
  return {
    useDebouncedValue: <T,>(value: T): [T, boolean] => {
      const [settled] = useState(value);
      return debounce.pending ? [settled, true] : [value, false];
    },
  };
});

vi.mock('@/hooks/use-auth-accounts', () => ({
  useOrphanedAuthAccounts: () => ({ data: ORPHANS, isLoading: false, error: null, refetch: vi.fn(), isRefetching: false }),
  useLinkAuthAccount: () => ({ mutateAsync: linkMutateAsync, isPending: false }),
  useSearchAuthAccounts: () => ({
    data: searchState.error
      ? undefined
      : [{ id: 'x1', email: 'free@x.test', created_at: '2026-01-01T00:00:00Z', last_sign_in_at: null, linked_resident_id: null, linked_resident_name: null }],
    isLoading: false,
    error: searchState.error,
  }),
}));
vi.mock('@/hooks/use-roles', () => ({
  useCurrentAdmins: () => ({ data: ADMINS, isLoading: false, error: null }),
}));
vi.mock('@/actions/roles/assign-role', () => ({ searchResidentsForRoleAssignment: searchResidents }));

import { OrphanedAccountsList } from '@/components/admin/orphaned-accounts-list';
import { LinkAccountDialog } from '@/components/admin/link-account-dialog';

beforeEach(() => {
  searchState.error = null;
  debounce.pending = false;
  linkMutateAsync.mockClear();
  searchResidents.mockReset();
  searchResidents.mockResolvedValue({ data: [] });
});
afterEach(() => cleanup());

describe('OrphanedAccountsList', () => {
  it('lists a role holder under "Staff with a role", not among the unlinked logins, and shows approval status', () => {
    render(<OrphanedAccountsList />);
    expect(screen.getByText('2 unlinked logins')).toBeTruthy();
    expect(screen.getByText('1 staff with a role')).toBeTruthy();
    const staffHeading = screen.getByRole('heading', { name: 'Staff with a role' });
    const staffSection = staffHeading.parentElement!;
    expect(staffSection.textContent).toContain('staff@x.test');
    expect(staffSection.textContent).not.toContain('plain@x.test');
    expect(screen.getByText('pending')).toBeTruthy();
    expect(screen.getByText('suspended')).toBeTruthy();
  });

  it('disables Link for a suspended account', () => {
    render(<OrphanedAccountsList />);
    const row = screen.getByText('gone@x.test').closest('tr')!;
    expect(row.querySelector('button')!.hasAttribute('disabled')).toBe(true);
  });

  it('searches residents once per typed query, drops those that already have an account, and shows errors', async () => {
    searchResidents.mockResolvedValue({
      data: [
        { id: 'r1', first_name: 'Ada', last_name: 'Obi', email: null, house_address: null, profile_id: null },
        { id: 'r2', first_name: 'Adam', last_name: 'Eze', email: null, house_address: null, profile_id: 'taken' },
      ],
    });
    render(<OrphanedAccountsList />);
    const row = screen.getByText('plain@x.test').closest('tr')!;
    fireEvent.click(row.querySelector('button')!);
    fireEvent.change(await screen.findByPlaceholderText('Search residents by name...'), { target: { value: 'Ada' } });
    await screen.findByText('Ada Obi');
    expect(screen.queryByText('Adam Eze')).toBeNull();
    expect(searchResidents).toHaveBeenCalledTimes(1);

    searchResidents.mockResolvedValue({ error: 'Failed to search residents' });
    fireEvent.change(screen.getByPlaceholderText('Search residents by name...'), { target: { value: 'Adam' } });
    expect((await screen.findByRole('alert')).textContent).toContain('Failed to search residents');
    expect(searchResidents).toHaveBeenCalledTimes(2);
  });
});

describe('LinkAccountDialog', () => {
  const props = { open: true, onOpenChange: vi.fn(), residentName: 'Ada Obi' };

  it('asks for confirmation before linking an unlinked account', async () => {
    render(<LinkAccountDialog {...props} residentId="r1" residentEmail="free@x.test" />);
    fireEvent.click(await screen.findByText('free@x.test', { selector: 'p' }));
    expect(linkMutateAsync).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: 'Link account' }));
    await waitFor(() =>
      expect(linkMutateAsync).toHaveBeenCalledWith({ authUserId: 'x1', residentId: 'r1', forceRelink: false })
    );
  });

  it('resets the search when the resident changes', async () => {
    const { rerender } = render(<LinkAccountDialog {...props} residentId="r1" residentEmail="one@x.test" />);
    const input = () => screen.getByLabelText('Search by Email') as HTMLInputElement;
    fireEvent.change(input(), { target: { value: 'typed-by-hand' } });
    expect(input().value).toBe('typed-by-hand');
    rerender(<LinkAccountDialog {...props} residentId="r2" residentName="Bob Eze" residentEmail="two@x.test" />);
    await waitFor(() => expect(input().value).toBe('two@x.test'));
  });

  it('shows a search error instead of an empty list', async () => {
    searchState.error = new Error('Unauthorized');
    render(<LinkAccountDialog {...props} residentId="r1" residentEmail="free@x.test" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Unauthorized');
  });

  it('shows a spinner, not "enter at least 3 characters" or stale results, while the debounce is pending', async () => {
    debounce.pending = true;
    render(<LinkAccountDialog {...props} residentId="r1" residentEmail="free@x.test" />);
    expect(screen.queryByText('free@x.test', { selector: 'p' })).toBeNull();
    expect(screen.queryByText('Enter at least 3 characters to search')).toBeNull();
    expect(document.querySelector('.animate-spin')).not.toBeNull();
  });
});
