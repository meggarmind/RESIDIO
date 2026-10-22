// @vitest-environment jsdom
// Issue #784: the house detail page split. Covers what the split must keep (tab URL, Link,
// Transfer, Remove) and what it changes (no eager list or history queries, Delete behind
// an explained menu item and an AlertDialog, one header status line).
import { Suspense, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  search: '',
  roles: ['resident_landlord', 'co_resident', 'non_resident_landlord'] as string[],
  replace: vi.fn(),
  residentsCalls: [] as { enabled?: boolean }[],
  historyCalls: 0,
  paymentStatus: { data: { totalOutstanding: 0, debtStatus: 'paid_in_full', debtStatusLabel: 'Paid in Full' } as { totalOutstanding: number; debtStatus: string; debtStatusLabel: string } | undefined, isLoading: false, isError: false },
  assign: vi.fn(),
  transfer: vi.fn(),
  unassign: vi.fn(),
  removeOwnership: vi.fn(),
  deleteHouse: vi.fn(),
}));
const { mutation } = vi.hoisted(() => ({
  mutation: (fn: (...args: unknown[]) => unknown) => () => ({ mutateAsync: fn, isPending: false }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: () => true }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));

vi.mock('next/dynamic', () => ({
  default: <P extends object>(loader: () => Promise<{ default: ComponentType<P> }>) => {
    return function Dynamic(props: P) {
      const [Loaded, setLoaded] = useState<ComponentType<P> | null>(null);
      useEffect(() => {
        void loader().then((m) => setLoaded(() => m.default));
      }, []);
      return Loaded ? <Loaded {...props} /> : null;
    };
  },
}));

// A native select stands in for the searchable combobox.
vi.mock('@/components/ui/searchable-select', () => ({
  SearchableSelect: ({ options, value, onValueChange, placeholder }: {
    options: { value: string; label: string }[];
    value: string;
    onValueChange: (v: string) => void;
    placeholder?: string;
  }) => (
    <select aria-label={placeholder} value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">-</option>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  ),
}));

vi.mock('@/hooks/use-houses', () => ({
  useHouse: () => ({
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    data: {
      id: 'house-1',
      house_number: '12',
      is_occupied: mocks.roles.length > 0,
      street: { name: 'Ibrahim Babatunde' },
      house_type: { name: 'Detached' },
      resident_houses: mocks.roles.map((role, i) => ({
        id: `rh-${i}`,
        is_active: true,
        resident_role: role,
        sponsor_resident_id: null,
        resident: { id: `res-${i}`, first_name: `First${i}`, last_name: `Last${i}`, account_status: 'active' },
      })),
    },
  }),
  useDeleteHouse: mutation(mocks.deleteHouse),
  useOwnershipHistory: () => {
    mocks.historyCalls += 1;
    return {
      isLoading: false,
      data: [{ id: 'h1', event_type: 'move_in', event_date: '2026-03-05', end_date: null, resident: null }],
    };
  },
}));
vi.mock('@/hooks/use-billing', () => ({
  useHousePaymentStatus: () => mocks.paymentStatus,
}));
vi.mock('@/hooks/use-residents', () => ({
  useResidents: (_params: unknown, options: { enabled?: boolean } = {}) => {
    mocks.residentsCalls.push(options);
    return {
      isLoading: false,
      data: { data: [{ id: 'res-new', first_name: 'Ada', last_name: 'Obi', resident_code: 'R-9', resident_houses: [] }] },
    };
  },
  useAssignHouse: mutation(mocks.assign),
  useUnassignHouse: mutation(mocks.unassign),
  useUpdateResidentHouse: mutation(vi.fn()),
  useSwapResidentRoles: mutation(vi.fn()),
  useTransferOwnership: mutation(mocks.transfer),
  useRemoveOwnership: mutation(mocks.removeOwnership),
}));
vi.mock('@/components/houses/house-form', () => ({ HouseForm: () => null }));
vi.mock('@/components/houses/house-payment-status', () => ({ HousePaymentStatus: () => <p>payment-status</p> }));
vi.mock('@/components/houses/yearly-payment-table', () => ({ YearlyPaymentTable: () => null }));
vi.mock('@/components/residents/move-out-wizard', () => ({ MoveOutWizard: () => null }));
vi.mock('@/components/residents/owner-move-out-wizard', () => ({ OwnerMoveOutWizard: () => null }));

import HouseDetailPage from '@/app/(dashboard)/houses/[id]/page';

// An already-settled thenable, so React's use() reads it without suspending.
const params = Object.assign(Promise.resolve({ id: 'house-1' }), {
  status: 'fulfilled',
  value: { id: 'house-1' },
}) as Promise<{ id: string }>;

const renderPage = () =>
  render(
    <Suspense fallback={null}>
      <HouseDetailPage params={params} />
    </Suspense>
  );
const openMenu = (name: string) => fireEvent.keyDown(screen.getByRole('button', { name }), { key: 'Enter' });

beforeEach(() => {
  mocks.search = '';
  mocks.roles = ['resident_landlord', 'co_resident', 'non_resident_landlord'];
  mocks.residentsCalls.length = 0;
  mocks.historyCalls = 0;
  mocks.paymentStatus = { data: { totalOutstanding: 0, debtStatus: 'paid_in_full', debtStatusLabel: 'Paid in Full' }, isLoading: false, isError: false };
  for (const fn of [mocks.replace, mocks.assign, mocks.transfer, mocks.unassign, mocks.removeOwnership, mocks.deleteHouse]) {
    fn.mockReset();
    fn.mockResolvedValue({});
  }
});
afterEach(() => cleanup());

describe('tabs and ?tab=', () => {
  it('lands on Residents with no ?tab, and an old ?tab=overview link lands there too', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: 'Residents' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: 'Overview' })).not.toBeInTheDocument();
    cleanup();

    mocks.search = 'tab=overview';
    renderPage();
    expect(screen.getByRole('tab', { name: 'Residents' })).toHaveAttribute('aria-selected', 'true');
  });

  it('writes the tab to the URL, and drops it for the default tab', () => {
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Billing' }));
    expect(mocks.replace).toHaveBeenCalledWith('/houses/house-1?tab=billing', { scroll: false });
    cleanup();

    mocks.search = 'tab=history';
    renderPage();
    fireEvent.mouseDown(screen.getByRole('tab', { name: 'Residents' }));
    expect(mocks.replace).toHaveBeenLastCalledWith('/houses/house-1', { scroll: false });
  });
});

describe('requests on load', () => {
  it('makes no resident-list or ownership-history request while the dialogs and History are closed', async () => {
    renderPage();
    await screen.findByText('First0 Last0');
    expect(mocks.residentsCalls.every((o) => o.enabled === false)).toBe(true);
    expect(mocks.historyCalls).toBe(0);
  });

  it('loads ownership history once History is opened, with en-NG dates', async () => {
    mocks.search = 'tab=history';
    renderPage();
    expect(await screen.findByText(/5 Mar 2026 - Present/)).toBeInTheDocument();
    expect(mocks.historyCalls).toBeGreaterThan(0);
  });
});

describe('resident flows', () => {
  it('Link: fetches residents only once the dialog opens, then assigns the chosen one', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Link Existing/ }));
    expect(mocks.residentsCalls.at(-1)?.enabled).toBe(true);

    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Search a resident...'), { target: { value: 'res-new' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Link Resident/ }));

    await waitFor(() => expect(mocks.assign).toHaveBeenCalled());
    expect(mocks.assign.mock.calls[0][0]).toMatchObject({
      residentId: 'res-new',
      data: { house_id: 'house-1', resident_role: 'co_resident' },
    });
  });

  it('Transfer: sends the current owner, the new owner and the type', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^Transfer$/ }));
    const dialog = screen.getByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText('Search a new owner...'), { target: { value: 'res-new' } });
    fireEvent.click(within(dialog).getByRole('button', { name: /Transfer Ownership/ }));

    await waitFor(() => expect(mocks.transfer).toHaveBeenCalled());
    expect(mocks.transfer.mock.calls[0][0]).toMatchObject({
      houseId: 'house-1',
      currentOwnerId: 'res-2',
      newOwnerId: 'res-new',
      newOwnerRole: 'non_resident_landlord',
    });
  });

  it('Remove: an Occupant is removed from the row menu after confirming', async () => {
    renderPage();
    openMenu('More actions for First1 Last1');
    fireEvent.click(screen.getByTestId('remove-resident-button'));
    const confirm = screen.getByRole('alertdialog');
    expect(confirm).toHaveTextContent('First1 Last1');
    fireEvent.click(within(confirm).getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(mocks.unassign).toHaveBeenCalledWith({ residentId: 'res-1', houseId: 'house-1' }));
  });

  it('Remove ownership: a Property Owner is removed after confirming', async () => {
    renderPage();
    openMenu('More actions for First2 Last2');
    fireEvent.click(screen.getByRole('menuitem', { name: /^Remove$/ }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: /Remove Ownership/ }));
    await waitFor(() => expect(mocks.removeOwnership).toHaveBeenCalledWith({ houseId: 'house-1', ownerId: 'res-2' }));
  });
});

describe('Delete', () => {
  it('is disabled while residents are linked, and says why', () => {
    renderPage();
    openMenu('More house actions');
    const item = screen.getByRole('menuitem', { name: /Delete house/ });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('delete-disabled-reason')).toHaveTextContent('Remove all residents before deleting this house.');
  });

  it('asks for confirmation in an AlertDialog, not the browser', async () => {
    mocks.roles = [];
    const nativeConfirm = vi.spyOn(window, 'confirm');
    renderPage();
    openMenu('More house actions');
    expect(screen.queryByTestId('delete-disabled-reason')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Delete house/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(mocks.deleteHouse).toHaveBeenCalledWith('house-1'));
    expect(nativeConfirm).not.toHaveBeenCalled();
  });
});

describe('header status line', () => {
  it('shows occupancy, residents, the debt status word and the amount beside it', () => {
    mocks.paymentStatus = { data: { totalOutstanding: 720000, debtStatus: 'arrears', debtStatusLabel: 'Arrears' }, isLoading: false, isError: false };
    renderPage();
    const line = screen.getByTestId('house-status-line');
    expect(line).toHaveTextContent('Occupied');
    expect(line).toHaveTextContent('3 residents');
    expect(line).toHaveTextContent('Arrears');
    expect(line).toHaveTextContent(/720,000\.00/);
  });

  it('never reports a debt status when the figure failed to load', () => {
    mocks.paymentStatus = { data: undefined, isLoading: false, isError: true };
    renderPage();
    const line = screen.getByTestId('house-status-line');
    expect(line).toHaveTextContent('Debt status unavailable');
    expect(line).not.toHaveTextContent('Paid in Full');
  });
});
