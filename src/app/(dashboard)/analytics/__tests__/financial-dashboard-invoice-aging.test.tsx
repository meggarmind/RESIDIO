// @vitest-environment jsdom
//
// #651: the Invoice Aging card must not say "No overdue invoices." while loading or when its
// query failed. That text is reserved for a successful, empty result.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FinancialDashboard } from '../financial-dashboard';

type AgingState = {
  data: { daysOverdue: number; count: number }[] | undefined;
  isLoading: boolean;
  isError: boolean;
};

const { aging } = vi.hoisted(() => ({
  aging: { current: { data: undefined, isLoading: false, isError: false } as AgingState },
}));

vi.mock('@/hooks/use-dashboard', () => ({
  useDashboardFinancialHealth: () => ({ data: null, isLoading: false }),
  useDashboardInvoiceDistribution: () => ({ data: null }),
  useDashboardQuickStats: () => ({ data: null }),
}));
vi.mock('@/hooks/use-analytics', () => ({
  useAnalytics: () => ({ data: null, isLoading: false }),
  useDebtStatusByStreet: () => ({ data: null, isLoading: false, error: null }),
}));
vi.mock('@/lib/auth/auth-provider', () => ({ useAuth: () => ({ isLoading: false, hasPermission: () => false }) }));
vi.mock('@/hooks/use-billing', () => ({ useOverdueInvoiceAging: () => aging.current }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

afterEach(() => cleanup());

const EMPTY = 'No overdue invoices.';
const UNAVAILABLE = 'Invoice aging unavailable';
const HISTOGRAM = 'Exact days overdue histogram';

function card() {
  return screen.getByText('Invoice Aging').closest('div[class*="rounded"]') as HTMLElement;
}
function skeleton() {
  return card().querySelector('[data-slot="skeleton"]');
}

describe('Invoice Aging card states (#651)', () => {
  it('shows a skeleton while loading, not the empty or error text', () => {
    aging.current = { data: undefined, isLoading: true, isError: false };
    render(<FinancialDashboard />);
    expect(skeleton()).not.toBeNull();
    expect(card()).not.toHaveTextContent(EMPTY);
    expect(card()).not.toHaveTextContent(UNAVAILABLE);
    expect(screen.queryByLabelText(HISTOGRAM)).toBeNull();
  });

  it('shows "unavailable" when the query failed, not the empty text', () => {
    aging.current = { data: undefined, isLoading: false, isError: true };
    render(<FinancialDashboard />);
    expect(card()).toHaveTextContent(UNAVAILABLE);
    expect(card()).not.toHaveTextContent(EMPTY);
    expect(skeleton()).toBeNull();
    expect(screen.queryByLabelText(HISTOGRAM)).toBeNull();
  });

  it('shows "No overdue invoices." only for a successful empty result', () => {
    aging.current = { data: [], isLoading: false, isError: false };
    render(<FinancialDashboard />);
    expect(card()).toHaveTextContent(EMPTY);
    expect(card()).not.toHaveTextContent(UNAVAILABLE);
    expect(skeleton()).toBeNull();
    expect(screen.queryByLabelText(HISTOGRAM)).toBeNull();
  });

  it('renders the histogram when there are overdue invoices', () => {
    aging.current = {
      data: [
        { daysOverdue: 3, count: 2 },
        { daysOverdue: 10, count: 4 },
      ],
      isLoading: false,
      isError: false,
    };
    render(<FinancialDashboard />);
    expect(screen.getByLabelText(HISTOGRAM)).toBeInTheDocument();
    expect(screen.getByText('3d')).toBeInTheDocument();
    expect(screen.getByText('10d')).toBeInTheDocument();
    expect(card()).not.toHaveTextContent(EMPTY);
    expect(card()).not.toHaveTextContent(UNAVAILABLE);
    expect(skeleton()).toBeNull();
  });
});
