// @vitest-environment jsdom
//
// Issue #100: the dashboard's auth, route (Suspense/loading.tsx), ready, debug and
// error states must stay intentional and visibly distinguishable. Page-level
// coverage with no network: heavy children and data hooks are mocked out.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

const mocks = vi.hoisted(() => ({
  authLoading: false,
  snapshot: null as unknown,
  search: '',
  toastError: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.search),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({
    profile: { id: 'u1', role_name: 'super_admin', full_name: 'Test Admin' },
    isLoading: mocks.authLoading,
    hasPermission: () => true,
  }),
}));
vi.mock('@/hooks/use-dashboard', () => ({
  useAdminDashboardSnapshot: () => ({
    data: mocks.snapshot,
    isLoading: false,
    isError: false,
    isStaleSnapshot: false,
    snapshotSavedAt: null,
  }),
  useEstateMapStatus: () => ({ data: null, isPending: false, error: null }),
}));
vi.mock('@/components/dashboard/offline-admin-banner', () => ({ OfflineAdminBanner: () => null }));

import { DashboardContent as DashboardPage } from '@/app/(dashboard)/dashboard/dashboard-content';
import DashboardLoading from '@/app/(dashboard)/dashboard/loading';
import DashboardPageError from '@/app/(dashboard)/dashboard/error';

beforeEach(() => {
  mocks.authLoading = false;
  mocks.snapshot = null;
  mocks.search = '';
  mocks.toastError.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('dashboard page states', () => {
  it('shows only the auth skeleton while auth is loading and nothing is hydrated', () => {
    mocks.authLoading = true;
    mocks.search = 'debug=true';
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[data-loading-state="auth"]')).toBeInTheDocument();
    expect(container.querySelector('[data-dashboard-state="ready"]')).toBeNull();
    expect(container.querySelector('[data-dashboard-debug]')).toBeNull();
  });

  it('renders the board at once while auth loads when the snapshot is already hydrated', () => {
    mocks.authLoading = true;
    mocks.snapshot = {
      financialHealth: { totalCollected: 1000, totalOutstanding: 500, monthlyRevenue: 200, collectionRate: 67, overdueCount: 0, overdueAmount: 0, walletCredits: 0 },
      actionMetrics: { unverifiedPayments: 0, pendingResidentVerifications: 0, expiringSecurityContacts: 0 },
      quickStats: null,
      securityAlerts: null,
      recentActivity: [],
      recentActivityUnavailable: false,
      lastUpdated: '2026-10-18T10:00:00.000Z',
    };
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[data-loading-state="auth"]')).toBeNull();
    expect(screen.getByTestId('lane-money')).toHaveAttribute('data-lane-state', 'ready');
  });

  it('renders the ready wrapper without debug by default', () => {
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[data-dashboard-state="ready"]')).toBeInTheDocument();
    expect(container.querySelector('[data-loading-state]')).toBeNull();
    expect(container.querySelector('[data-dashboard-debug]')).toBeNull();
  });

  it('renders the strip, three lanes and activity, and no fake zeros while the snapshot is missing', () => {
    render(<DashboardPage />);
    expect(screen.getByTestId('command-strip')).toBeInTheDocument();
    for (const id of ['lane-money', 'lane-people', 'lane-security']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-lane-state', 'unavailable');
      expect(screen.getByTestId(`${id}-hero`)).toHaveTextContent('Unavailable');
    }
    expect(screen.getByTestId('command-strip-urgent')).toHaveTextContent('Attention status unavailable');
  });

  it('renders the debug block only for debug=true', () => {
    mocks.search = 'debug=true';
    const on = render(<DashboardPage />);
    expect(on.container.querySelector('[data-dashboard-debug="true"]')).toBeInTheDocument();
    expect(screen.getByText('Debug Info:')).toBeInTheDocument();
    on.unmount();

    mocks.search = 'debug=false';
    const off = render(<DashboardPage />);
    expect(off.container.querySelector('[data-dashboard-debug]')).toBeNull();
  });

  it('fires the unauthorized toast once for error=unauthorized', () => {
    mocks.search = 'error=unauthorized';
    render(<DashboardPage />);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).toHaveBeenCalledWith('You do not have permission to access that page');
  });

  it('does not toast without error=unauthorized', () => {
    mocks.search = 'error=other';
    render(<DashboardPage />);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

describe('dashboard error state', () => {
  it('renders an alert and calls reset from Try again', () => {
    const reset = vi.fn();
    const { container } = render(<DashboardPageError error={new Error('boom')} reset={reset} />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveAttribute('data-error-state', 'dashboard-page');
    expect(container.querySelector('[data-error-state="dashboard-page"]')).toBe(alert);
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});

describe('state distinguishability', () => {
  it('auth skeleton, route skeleton and error state carry distinct markers and labels', () => {
    mocks.authLoading = true;
    const auth = render(<DashboardPage />);
    const authEl = auth.container.querySelector('[data-loading-state]')!;
    const authLabel = authEl.getAttribute('aria-label');
    const authText = authEl.textContent;
    const authState = authEl.getAttribute('data-loading-state');
    const authRole = authEl.getAttribute('role');
    cleanup();

    const route = render(<DashboardLoading />);
    const routeEl = route.container.querySelector('[data-loading-state]')!;
    const routeLabel = routeEl.getAttribute('aria-label');
    const routeText = routeEl.textContent;
    const routeState = routeEl.getAttribute('data-loading-state');
    cleanup();

    const err = render(<DashboardPageError error={new Error('x')} reset={() => {}} />);
    const errEl = err.container.querySelector('[data-error-state]')!;

    expect(authState).toBe('auth');
    expect(routeState).toBe('route');
    expect(authLabel).not.toBe(routeLabel);
    expect(authText).toContain('Loading dashboard authentication');
    expect(routeText).toContain('Loading dashboard route');
    expect(authRole).toBe('status');
    expect(errEl.hasAttribute('data-loading-state')).toBe(false);
    expect(errEl.getAttribute('role')).toBe('alert');
    expect(errEl.textContent).toContain('Dashboard unavailable');
  });
});
