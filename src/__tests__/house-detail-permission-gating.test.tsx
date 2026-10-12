// @vitest-environment jsdom
import { Suspense } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
  mutation: () => ({ mutateAsync: () => undefined, mutate: () => undefined, isPending: false }),
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams('tab=residents'),
}));


vi.mock('@/hooks/use-houses', () => ({
  useHouse: () => ({
    isLoading: false,
    error: null,
    data: {
      id: 'house-1',
      house_number: '12',
      is_occupied: true,
      street: { name: 'Ibrahim Babatunde' },
      house_type: { name: 'Detached' },
      resident_houses: [
        {
          id: 'rh-1',
          is_active: true,
          resident_role: 'tenant',
          resident: {
            id: 'res-1',
            first_name: 'Ada',
            last_name: 'Obi',
            account_status: 'active',
          },
        },
        {
          id: 'rh-2',
          is_active: true,
          resident_role: 'non_resident_landlord',
          resident: {
            id: 'res-2',
            first_name: 'Chidi',
            last_name: 'Eze',
            account_status: 'active',
          },
        },
      ],
    },
  }),
  useDeleteHouse: mocks.mutation,
  useOwnershipHistory: () => ({ data: [], isLoading: false }),
}));
vi.mock('@/hooks/use-billing', () => ({
  useHousePaymentStatus: () => ({ data: undefined, isLoading: false, isError: false }),
}));
vi.mock('@/hooks/use-residents', () => ({
  useResidents: () => ({ data: { data: [] }, isLoading: false }),
  useAssignHouse: mocks.mutation,
  useUnassignHouse: mocks.mutation,
  useMoveOutLandlord: mocks.mutation,
  useUpdateResidentHouse: mocks.mutation,
  useSwapResidentRoles: mocks.mutation,
  useTransferOwnership: mocks.mutation,
  useRemoveOwnership: mocks.mutation,
  usePendingMoveOut: () => ({ data: undefined }),
  useConfirmRenterMoveOut: mocks.mutation,
}));
vi.mock('@/components/houses/house-form', () => ({ HouseForm: () => null }));
vi.mock('@/components/houses/house-payment-status', () => ({ HousePaymentStatus: () => null }));
vi.mock('@/components/houses/yearly-payment-table', () => ({ YearlyPaymentTable: () => null }));
vi.mock('@/components/houses/house-stats-cards', () => ({ HouseStatsCards: () => null }));
vi.mock('@/components/residents/move-out-wizard', () => ({ MoveOutWizard: () => null }));
vi.mock('@/components/residents/owner-move-out-wizard', () => ({ OwnerMoveOutWizard: () => null }));

import HouseDetailPage from '@/app/(dashboard)/houses/[id]/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

// An already-settled thenable, so React's use() reads it without suspending.
const params = Object.assign(Promise.resolve({ id: 'house-1' }), {
  status: 'fulfilled',
  value: { id: 'house-1' },
}) as Promise<{ id: string }>;

function renderPage() {
  return render(
    <Suspense fallback={null}>
      <HouseDetailPage params={params} />
    </Suspense>
  );
}

beforeEach(() => {
  mocks.permissions = [];
});
afterEach(() => cleanup());

describe('House detail permission gating (issue #462)', () => {
  it('hides every write control from a houses.view-only user', () => {
    mocks.permissions = [PERMISSIONS.HOUSES_VIEW];
    renderPage();

    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Edit$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Delete$/ })).not.toBeInTheDocument();
    expect(screen.queryByText('Link Existing')).not.toBeInTheDocument();
    expect(screen.queryByText('Add New')).not.toBeInTheDocument();
    expect(screen.queryByText('Move Out')).not.toBeInTheDocument();
    expect(screen.queryByText('Transfer')).not.toBeInTheDocument();
    expect(screen.queryByTestId('remove-resident-button')).not.toBeInTheDocument();
  });

  it('shows the controls to a user holding the matching write permissions', () => {
    mocks.permissions = [
      PERMISSIONS.HOUSES_VIEW,
      PERMISSIONS.HOUSES_UPDATE,
      PERMISSIONS.HOUSES_DELETE,
      PERMISSIONS.HOUSES_ASSIGN_RESIDENT,
      PERMISSIONS.RESIDENTS_CREATE,
    ];
    renderPage();

    expect(screen.getByRole('link', { name: /^Edit$/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Delete$/ })).toBeInTheDocument();
    expect(screen.getByText('Link Existing')).toBeInTheDocument();
    expect(screen.getByText('Add New')).toBeInTheDocument();
    expect(screen.getByText('Move Out')).toBeInTheDocument();
    expect(screen.getByText('Transfer')).toBeInTheDocument();
  });

  it('shows Transfer only with houses.update, not with assign_resident alone', () => {
    mocks.permissions = [PERMISSIONS.HOUSES_VIEW, PERMISSIONS.HOUSES_ASSIGN_RESIDENT];
    renderPage();

    expect(screen.queryByText('Transfer')).not.toBeInTheDocument();
    // Remove-ownership is enforced by assign_resident server-side, so it stays.
    expect(screen.getByRole('button', { name: /Remove/ })).toBeInTheDocument();
  });
});
