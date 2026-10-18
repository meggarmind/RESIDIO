// @vitest-environment jsdom
// Issue #759: below md the residents, houses and payments lists show stacked
// cards. Both the cards and the table are in the DOM (CSS picks one), so every
// query here is scoped to one of them.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  push: vi.fn(),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));
vi.mock('@/contexts/visual-theme-context', () => ({ useVisualTheme: () => ({ themeId: 'default' }) }));
vi.mock('@/lib/utils/accessibility', () => ({ prefersReducedMotion: () => true }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('@/hooks/use-persisted-state', async () => {
  const { useState } = await import('react');
  return { usePersistedState: <T,>(_key: string, initial: T) => useState<T>(initial) };
});
vi.mock('@/hooks/use-reference', () => ({
  useStreets: () => ({ data: [] }),
  useHouseTypes: () => ({ data: [] }),
}));
vi.mock('@/hooks/use-residents', () => ({
  useAdminResidents: () => ({
    isLoading: false,
    error: null,
    data: {
      count: 2,
      data: [
        { id: 'res-1', resident_code: 'R-001', first_name: 'Ada', last_name: 'Obi', phone_primary: '0800', account_status: 'active', resident_houses: [] },
        { id: 'res-2', resident_code: 'R-002', first_name: 'Bayo', last_name: 'Eze', phone_primary: '0801', account_status: 'inactive', resident_houses: [] },
      ],
    },
  }),
  useContactVerificationStats: () => ({ data: undefined }),
}));
vi.mock('@/hooks/use-houses', () => ({
  useHouses: () => ({
    isLoading: false,
    error: null,
    data: {
      count: 2,
      data: [
        { id: 'house-1', house_number: '12', is_occupied: true, street: { name: 'Ibrahim Babatunde' }, house_type: { name: 'Detached' }, short_name: 'IBB-12' },
        { id: 'house-2', house_number: '14', is_occupied: false, street: { name: 'Ibrahim Babatunde' }, house_type: { name: 'Duplex' }, short_name: 'IBB-14' },
      ],
    },
  }),
}));
vi.mock('@/hooks/use-payments', () => ({
  useDeletePayment: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useBulkUpdatePayments: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/components/residents/resident-quick-view', () => ({ ResidentQuickView: () => null }));
vi.mock('@/components/houses/house-quick-view', () => ({ HouseQuickView: () => null }));

import { ResidentsTable, RESIDENT_SORT_OPTIONS } from '@/components/residents/residents-table';
import { HousesTable, HOUSE_SORT_OPTIONS } from '@/components/houses/houses-table';
import { PaymentTable, PAYMENT_SORT_OPTIONS } from '@/components/payments/payment-table';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const PAYMENTS = [
  { id: 'pay-1', amount: 5000, method: 'bank_transfer', status: 'paid', payment_date: '2026-01-15', reference_number: 'REF-1', resident: { first_name: 'Ada', last_name: 'Obi', resident_code: 'R-1' } },
  { id: 'pay-2', amount: 7500, method: 'cash', status: 'pending', payment_date: '2026-02-20', reference_number: 'REF-2', resident: { first_name: 'Bayo', last_name: 'Eze', resident_code: 'R-2' } },
] as never;

const cards = (testId: string) => within(screen.getByTestId(testId));

beforeEach(() => {
  mocks.permissions = [];
  mocks.push.mockReset();
});
afterEach(() => cleanup());

describe('Residents phone cards', () => {
  it('renders the same residents as the table', () => {
    render(<ResidentsTable />);
    const list = screen.getByTestId('resident-card-list');
    expect(list.querySelectorAll('[data-slot="record-card"]')).toHaveLength(2);
    const tableRows = within(screen.getByRole('table')).getAllByRole('row').slice(1);
    expect(tableRows).toHaveLength(2);
    for (const name of ['Ada Obi', 'Bayo Eze']) {
      expect(cards('resident-card-list').getByText(name)).toBeInTheDocument();
      expect(within(screen.getByRole('table')).getByText(name)).toBeInTheDocument();
    }
    expect(cards('resident-card-list').getByText('R-001')).toBeInTheDocument();
    expect(cards('resident-card-list').getByText('Active')).toBeInTheDocument();
    expect(cards('resident-card-list').getAllByText('Unassigned')).toHaveLength(2);
  });

  it('keeps the Edit action behind residents.update', () => {
    mocks.permissions = [PERMISSIONS.RESIDENTS_VIEW];
    const { unmount } = render(<ResidentsTable />);
    expect(cards('resident-card-list').getAllByRole('button', { name: 'Preview resident' })).toHaveLength(2);
    expect(cards('resident-card-list').queryByRole('link', { name: 'Edit resident' })).not.toBeInTheDocument();
    unmount();

    mocks.permissions = [PERMISSIONS.RESIDENTS_VIEW, PERMISSIONS.RESIDENTS_UPDATE];
    render(<ResidentsTable />);
    expect(cards('resident-card-list').getAllByRole('link', { name: 'Edit resident' })).toHaveLength(2);
  });

  it('navigates when a card is tapped but not when its Edit link is', () => {
    mocks.permissions = [PERMISSIONS.RESIDENTS_UPDATE];
    render(<ResidentsTable />);
    fireEvent.click(cards('resident-card-list').getAllByRole('link', { name: 'Edit resident' })[0]);
    expect(mocks.push).not.toHaveBeenCalled();
    fireEvent.click(cards('resident-card-list').getByRole('button', { name: 'Open Bayo Eze' }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/residents/res-2');
  });

  it('offers the sort control with the direction button disabled until a column is chosen', () => {
    render(<ResidentsTable />);
    const direction = cards('resident-card-list').getByRole('button', { name: 'Sort ascending' });
    expect(direction).toBeDisabled();
  });
});

describe('Houses phone cards', () => {
  it('renders the same houses as the table', () => {
    render(<HousesTable />);
    const list = screen.getByTestId('house-card-list');
    expect(list.querySelectorAll('[data-slot="record-card"]')).toHaveLength(2);
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(2);
    for (const number of ['12', '14']) {
      expect(cards('house-card-list').getByText(number)).toBeInTheDocument();
      expect(within(screen.getByRole('table')).getByText(number)).toBeInTheDocument();
    }
    expect(cards('house-card-list').getByText(/IBB-12 · Ibrahim Babatunde · Detached/)).toBeInTheDocument();
  });

  it('keeps the Edit action behind houses.update', () => {
    mocks.permissions = [PERMISSIONS.HOUSES_VIEW];
    const { unmount } = render(<HousesTable />);
    expect(cards('house-card-list').getAllByRole('button', { name: 'Preview house' })).toHaveLength(2);
    expect(cards('house-card-list').queryByRole('link', { name: 'Edit house' })).not.toBeInTheDocument();
    unmount();

    mocks.permissions = [PERMISSIONS.HOUSES_VIEW, PERMISSIONS.HOUSES_UPDATE];
    render(<HousesTable />);
    expect(cards('house-card-list').getAllByRole('link', { name: 'Edit house' })).toHaveLength(2);
  });

  it('navigates when a card is tapped', () => {
    render(<HousesTable />);
    fireEvent.click(cards('house-card-list').getByRole('button', { name: 'Open house 14' }));
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/houses/house-2');
  });
});

describe('Payments phone cards', () => {
  it('renders the same payments as the table', () => {
    render(<PaymentTable data={PAYMENTS} />);
    const list = screen.getByTestId('payment-card-list');
    expect(list.querySelectorAll('[data-slot="record-card"]')).toHaveLength(2);
    expect(within(screen.getByRole('table')).getAllByRole('row').slice(1)).toHaveLength(2);
    expect(cards('payment-card-list').getByText('Ada Obi · R-1')).toBeInTheDocument();
    expect(cards('payment-card-list').getByText('Ref REF-2')).toBeInTheDocument();
    expect(cards('payment-card-list').getByText(/Jan 15, 2026/)).toBeInTheDocument();
    expect(cards('payment-card-list').getByText('bank transfer')).toBeInTheDocument();
  });

  it('hides the resident line when showResident is false', () => {
    render(<PaymentTable data={PAYMENTS} showResident={false} />);
    expect(cards('payment-card-list').queryByText('Ada Obi · R-1')).not.toBeInTheDocument();
  });

  it('keeps Delete behind payments.delete', () => {
    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW];
    const { unmount } = render(<PaymentTable data={PAYMENTS} />);
    expect(cards('payment-card-list').getAllByRole('link', { name: 'View payment' })).toHaveLength(2);
    expect(cards('payment-card-list').queryByRole('button', { name: 'Delete payment' })).not.toBeInTheDocument();
    unmount();

    mocks.permissions = [PERMISSIONS.PAYMENTS_VIEW, PERMISSIONS.PAYMENTS_DELETE];
    render(<PaymentTable data={PAYMENTS} />);
    expect(cards('payment-card-list').getAllByRole('button', { name: 'Delete payment' })).toHaveLength(2);
  });

  it('puts a selection checkbox on each card that selects without navigating', () => {
    render(<PaymentTable data={PAYMENTS} />);
    const box = cards('payment-card-list').getByRole('checkbox', { name: 'Select payment REF-1' });
    fireEvent.click(box);
    expect(screen.getByText(/1 payment selected/)).toBeInTheDocument();
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('with clickableRows the card navigates and has no checkbox or View link', () => {
    render(<PaymentTable data={PAYMENTS} clickableRows />);
    expect(cards('payment-card-list').queryByRole('checkbox')).not.toBeInTheDocument();
    expect(cards('payment-card-list').queryByRole('link', { name: 'View payment' })).not.toBeInTheDocument();
    fireEvent.click(cards('payment-card-list').getAllByRole('button', { name: /^Open payment of/ })[1]);
    expect(mocks.push).toHaveBeenCalledExactlyOnceWith('/payments/pay-2');
  });

  it('without clickableRows a card has no tap target and does not navigate', () => {
    render(<PaymentTable data={PAYMENTS} />);
    expect(cards('payment-card-list').queryByRole('button', { name: /^Open payment of/ })).not.toBeInTheDocument();
    fireEvent.click(cards('payment-card-list').getByText('Ref REF-2'));
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('renders the sort control only when onSort is provided and wires it', () => {
    const { unmount } = render(<PaymentTable data={PAYMENTS} />);
    expect(cards('payment-card-list').queryByRole('combobox', { name: 'Sort by' })).not.toBeInTheDocument();
    unmount();

    const onSort = vi.fn();
    render(<PaymentTable data={PAYMENTS} sortBy="amount" sortOrder="desc" onSort={onSort} />);
    const direction = cards('payment-card-list').getByRole('button', { name: 'Sort descending' });
    fireEvent.click(direction);
    expect(onSort).toHaveBeenCalledExactlyOnceWith('amount');
  });
});

// jsdom applies no CSS, so the responsive switch is asserted on the classes.
describe('Phone card lists: responsive switch and structure', () => {
  const wrapperOf = () => screen.getByRole('table', { hidden: true }).closest('.hidden') as HTMLElement | null;

  it.each([
    ['residents', 'resident-card-list', () => <ResidentsTable />],
    ['houses', 'house-card-list', () => <HousesTable />],
    ['payments', 'payment-card-list', () => <PaymentTable data={PAYMENTS} />],
  ])('%s: cards show only below md and the table only from md up', (_name, testId, ui) => {
    render(ui());
    const list = screen.getByTestId(testId as string);
    expect(list).toHaveClass('md:hidden');
    expect(list).not.toHaveClass('hidden');
    const wrapper = wrapperOf();
    expect(wrapper).not.toBeNull();
    expect(wrapper).toHaveClass('hidden');
    expect(wrapper).toHaveClass('md:block');
    expect(wrapper).toContainElement(screen.getByRole('table', { hidden: true }));
  });

  it.each([
    ['residents', 'resident-card-list', () => <ResidentsTable />],
    ['houses', 'house-card-list', () => <HousesTable />],
    ['payments', 'payment-card-list', () => <PaymentTable data={PAYMENTS} clickableRows />],
  ])('%s: no interactive element is nested inside a button or link, and cards are not buttons', (_name, testId, ui) => {
    mocks.permissions = Object.values(PERMISSIONS);
    render(ui());
    const list = screen.getByTestId(testId as string);
    expect(list.querySelectorAll('button button, button a, a button, a a, button input, a input, button [role=checkbox], a [role=checkbox]')).toHaveLength(0);
    for (const card of list.querySelectorAll('[data-slot="record-card"]')) {
      expect(card).not.toHaveAttribute('role');
    }
  });
});

describe('Phone sort options', () => {
  it('map to the same columns as the table headers', () => {
    expect(RESIDENT_SORT_OPTIONS.map((o) => o.value)).toEqual(['resident_code', 'first_name', 'house_number']);
    expect(HOUSE_SORT_OPTIONS.map((o) => o.value)).toEqual(['short_name', 'house_number', 'street', 'house_type']);
    expect(PAYMENT_SORT_OPTIONS.map((o) => o.value)).toEqual(['payment_date', 'amount', 'status']);
  });
});