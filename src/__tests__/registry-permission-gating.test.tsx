// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  permissions: [] as string[],
}));

vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    isLoading: false,
    hasPermission: (p: string) => mocks.permissions.includes(p),
  }),
}));

vi.mock('@/contexts/visual-theme-context', () => ({
  useVisualTheme: () => ({ themeId: 'default' }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock('@/hooks/use-persisted-state', async () => {
  const { useState } = await import('react');
  return {
    usePersistedState: <T,>(_key: string, initial: T) => useState<T>(initial),
  };
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
      count: 1,
      data: [
        {
          id: 'res-1',
          resident_code: 'R-001',
          first_name: 'Ada',
          last_name: 'Obi',
          phone_primary: '0800',
          account_status: 'active',
          resident_houses: [],
        },
      ],
    },
  }),
  useContactVerificationStats: () => ({ data: undefined }),
  useResidentStats: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/hooks/use-houses', () => ({
  useHouses: () => ({
    isLoading: false,
    error: null,
    data: {
      count: 1,
      data: [
        {
          id: 'house-1',
          house_number: '12',
          is_occupied: true,
          street: { name: 'Ibrahim Babatunde' },
          house_type: { name: 'Detached' },
          short_name: 'IBB-12',
        },
      ],
    },
  }),
  useHouseStats: () => ({ data: undefined, isLoading: false }),
}));

vi.mock('@/components/residents/resident-quick-view', () => ({ ResidentQuickView: () => null }));
vi.mock('@/components/houses/house-quick-view', () => ({ HouseQuickView: () => null }));

import { ResidentsTable } from '@/components/residents/residents-table';
import { HousesTable } from '@/components/houses/houses-table';
import ResidentsPage from '@/app/(dashboard)/residents/page';
import HousesPage from '@/app/(dashboard)/houses/page';
import { PERMISSIONS } from '@/lib/auth/action-roles';

beforeEach(() => {
  mocks.permissions = [];
});
afterEach(() => cleanup());

describe('Residents permission gating (issue #462)', () => {
  it('hides Add resident and row Edit from a residents.view-only user', () => {
    mocks.permissions = [PERMISSIONS.RESIDENTS_VIEW];
    render(<ResidentsPage />);
    expect(screen.getByText('Ada Obi')).toBeInTheDocument();
    expect(screen.queryByText('Add resident')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit resident' })).not.toBeInTheDocument();
  });

  it('shows Add resident and row Edit to users holding create and update', () => {
    mocks.permissions = [
      PERMISSIONS.RESIDENTS_VIEW,
      PERMISSIONS.RESIDENTS_CREATE,
      PERMISSIONS.RESIDENTS_UPDATE,
    ];
    render(<ResidentsPage />);
    expect(screen.getByText('Add resident')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit resident' })).toBeInTheDocument();
  });

  it('keeps Edit hidden when only residents.create is held', () => {
    mocks.permissions = [PERMISSIONS.RESIDENTS_VIEW, PERMISSIONS.RESIDENTS_CREATE];
    render(<ResidentsTable />);
    expect(screen.queryByRole('link', { name: 'Edit resident' })).not.toBeInTheDocument();
  });
});

describe('Houses permission gating (issue #462)', () => {
  it('hides Add property, table Add and row Edit from a houses.view-only user', () => {
    mocks.permissions = [PERMISSIONS.HOUSES_VIEW];
    render(<HousesPage />);
    expect(screen.getByText('IBB-12')).toBeInTheDocument();
    expect(screen.queryByText('Add property')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Add$/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Edit house' })).not.toBeInTheDocument();
  });

  it('shows Add property, table Add and row Edit to users holding create and update', () => {
    mocks.permissions = [
      PERMISSIONS.HOUSES_VIEW,
      PERMISSIONS.HOUSES_CREATE,
      PERMISSIONS.HOUSES_UPDATE,
    ];
    render(<HousesPage />);
    expect(screen.getByText('Add property')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Add$/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Edit house' })).toBeInTheDocument();
  });

  it('keeps Edit hidden when only houses.create is held', () => {
    mocks.permissions = [PERMISSIONS.HOUSES_VIEW, PERMISSIONS.HOUSES_CREATE];
    render(<HousesTable />);
    expect(screen.queryByRole('link', { name: 'Edit house' })).not.toBeInTheDocument();
  });
});
