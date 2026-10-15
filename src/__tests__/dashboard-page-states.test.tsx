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
  }),
}));
vi.mock('@/hooks/use-dashboard', () => ({
  useAdminDashboardSnapshot: () => ({
    data: null,
    isLoading: false,
    isError: false,
    isStaleSnapshot: false,
    snapshotSavedAt: null,
  }),
}));
vi.mock('@/hooks/use-smart-suggestions', () => ({ useSmartSuggestions: () => ({ suggestions: [] }) }));
vi.mock('@/components/dashboard/unified-actions-card', () => ({ UnifiedActionsCard: () => null }));
vi.mock('@/components/dashboard/live-status-strip', () => ({ LiveStatusStrip: () => null }));
vi.mock('@/components/dashboard/modern-stats-cards', () => ({ ModernStatsCards: () => null }));
vi.mock('@/components/dashboard/modern-financial-health', () => ({ ModernFinancialHealth: () => null }));
vi.mock('@/components/dashboard/modern-pending-payments', () => ({ ModernPendingPayments: () => null }));
vi.mock('@/components/dashboard/modern-recent-activity', () => ({ ModernRecentActivity: () => null }));
vi.mock('@/components/dashboard/offline-admin-banner', () => ({ OfflineAdminBanner: () => null }));

import DashboardPage from '@/app/(dashboard)/dashboard/page';
import DashboardLoading from '@/app/(dashboard)/dashboard/loading';
import DashboardPageError from '@/app/(dashboard)/dashboard/error';

beforeEach(() => {
  mocks.authLoading = false;
  mocks.search = '';
  mocks.toastError.mockReset();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('dashboard page states', () => {
  it('shows only the auth skeleton while auth is loading', () => {
    mocks.authLoading = true;
    mocks.search = 'debug=true';
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[data-loading-state="auth"]')).toBeInTheDocument();
    expect(container.querySelector('[data-dashboard-state="ready"]')).toBeNull();
    expect(container.querySelector('[data-dashboard-debug]')).toBeNull();
  });

  it('renders the ready wrapper without debug by default', () => {
    const { container } = render(<DashboardPage />);
    expect(container.querySelector('[data-dashboard-state="ready"]')).toBeInTheDocument();
    expect(container.querySelector('[data-loading-state]')).toBeNull();
    expect(container.querySelector('[data-dashboard-debug]')).toBeNull();
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
