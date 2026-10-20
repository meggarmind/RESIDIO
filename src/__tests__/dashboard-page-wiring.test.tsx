// @vitest-environment jsdom
//
// #758: the real DashboardPage wires the estate map hook into the People lane and
// the EstateMap. Only auth and data hooks are mocked; every dashboard component is real.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type { EstateMapSnapshot } from '@/types/estate-map';

const mocks = vi.hoisted(() => ({
  map: { data: null as unknown, isLoading: false, error: null as Error | null },
}));

vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams('') }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    profile: { id: 'u1', role_name: 'super_admin', full_name: 'Test Admin' },
    isLoading: false,
    hasPermission: () => true,
  }),
}));
vi.mock('@/hooks/use-dashboard', () => ({
  useAdminDashboardSnapshot: () => ({
    data: {
      financialHealth: { totalCollected: 1000, totalOutstanding: 500, monthlyRevenue: 200, collectionRate: 67, overdueCount: 0, overdueAmount: 0, walletCredits: 0 },
      actionMetrics: { unverifiedPayments: 0, pendingResidentVerifications: 0, expiringSecurityContacts: 0 },
      quickStats: { activeResidents: 10, occupiedHouses: 4, totalHouses: 5, vacantHouses: 1, activeSecurityContacts: 3, totalSecurityContacts: 4 },
      securityAlerts: { expiredCodesCount: 0, suspendedContactsCount: 0, recentFlaggedEntries: 0 },
      recentActivity: [],
      recentActivityUnavailable: false,
      lastUpdated: '2026-10-18T10:00:00.000Z',
    },
    isLoading: false,
    isError: false,
    isStaleSnapshot: false,
    snapshotSavedAt: null,
  }),
  useEstateMapStatus: () => mocks.map,
}));
vi.mock('@/components/dashboard/offline-admin-banner', () => ({ OfflineAdminBanner: () => null }));

import DashboardPage from '@/app/(dashboard)/dashboard/page';

const snapshot: EstateMapSnapshot = {
  houses: [
    { id: 'h1', houseNumber: '1', streetId: 's1', streetName: 'Palm Close', status: 'paid_up' },
    { id: 'h2', houseNumber: '2', streetId: 's1', streetName: 'Palm Close', status: 'paid_up' },
    { id: 'h3', houseNumber: '3', streetId: 's1', streetName: 'Palm Close', status: 'overdue' },
    { id: 'h4', houseNumber: '4', streetId: 's2', streetName: 'Ash Road', status: 'outstanding' },
    { id: 'h5', houseNumber: '5', streetId: 's2', streetName: 'Ash Road', status: 'no_invoice' },
  ],
  counts: { paid_up: 2, outstanding: 1, overdue: 1, no_invoice: 1 },
  asOf: '2026-10-18T10:00:00.000Z',
};

beforeEach(() => {
  mocks.map = { data: snapshot, isLoading: false, error: null };
});
afterEach(cleanup);

describe('DashboardPage estate map wiring', () => {
  it('feeds the map counts to the People lane and the houses to the map', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('lane-people-paid-up')).toHaveTextContent('2 of 5 houses paid up');
    expect(screen.getByTestId('lane-people-overdue')).toHaveTextContent('1 house is overdue');

    const map = screen.getByTestId('estate-map');
    expect(within(map).getAllByRole('link', { name: /^House / })).toHaveLength(5);
    const expected = { all: 5, overdue: 1, outstanding: 1, paid_up: 2, no_invoice: 1 };
    for (const [k, n] of Object.entries(expected)) {
      expect(screen.getByTestId(`estate-map-filter-${k}`)).toHaveTextContent(String(n));
    }
    fireEvent.click(screen.getByTestId('estate-map-filter-paid_up'));
    expect(within(map).getAllByRole('link', { name: /^House / })).toHaveLength(2);
  });

  it('shows the map loading state while the read is pending', () => {
    mocks.map = { data: null, isLoading: true, error: null };
    render(<DashboardPage />);
    expect(screen.getByTestId('estate-map-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('lane-people-paid-up')).not.toBeInTheDocument();
  });

  it('shows the locked state for Unauthorized while the lanes still render', () => {
    mocks.map = { data: null, isLoading: false, error: new Error('Unauthorized') };
    render(<DashboardPage />);
    expect(screen.getByTestId('estate-map-locked')).toBeInTheDocument();
    for (const id of ['lane-money', 'lane-people', 'lane-security']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-lane-state', 'ready');
    }
    expect(screen.queryByTestId('lane-people-paid-up')).not.toBeInTheDocument();
  });

  it('shows the unavailable state for any other map error', () => {
    mocks.map = { data: null, isLoading: false, error: new Error('boom') };
    render(<DashboardPage />);
    expect(screen.getByTestId('estate-map-unavailable')).toBeInTheDocument();
    expect(screen.queryByTestId('estate-map-locked')).not.toBeInTheDocument();
  });
});
