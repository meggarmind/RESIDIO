// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const held = { current: [] as string[] };
const debtHook = vi.fn((opts: { enabled?: boolean }) => (void opts, { data: null, isLoading: false, error: null }));

vi.mock('@/hooks/use-dashboard', () => ({
  useDashboardFinancialHealth: () => ({ data: null, isLoading: false }),
  useDashboardInvoiceDistribution: () => ({ data: null }),
  useDashboardQuickStats: () => ({ data: null }),
}));
vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ data: null, isLoading: false }),
  useDebtStatusByStreet: (opts: { enabled?: boolean }) => debtHook(opts),
}));
vi.mock('@/hooks/use-billing', () => ({ useOverdueInvoiceAging: () => ({ data: [] }) }));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ isLoading: false, hasPermission: (p: string) => held.current.includes(p) }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

import { FinancialDashboard } from '../financial-dashboard';

afterEach(() => {
  cleanup();
  debtHook.mockClear();
});

describe('Debt status section visibility (#1347)', () => {
  it('shows the section and loads the chart for a holder of reports.view_financial', () => {
    held.current = [PERMISSIONS.REPORTS_VIEW_FINANCIAL];
    render(<FinancialDashboard />);
    expect(screen.getByRole('region', { name: 'Debt status' })).toBeTruthy();
    expect(debtHook).toHaveBeenLastCalledWith({ enabled: true });
  });

  it('hides the section and loads nothing for a user without it', () => {
    held.current = [PERMISSIONS.REPORTS_VIEW_OCCUPANCY];
    render(<FinancialDashboard />);
    expect(screen.queryByRole('region', { name: 'Debt status' })).toBeNull();
    expect(debtHook).toHaveBeenLastCalledWith({ enabled: false });
  });
});
