// @vitest-environment jsdom
//
// #101: the Overdue Invoices tile must show "-" (unavailable) when the invoice distribution
// failed to load (null), and a real "0" only when the distribution genuinely reports zero.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FinancialDashboard } from '../financial-dashboard';
import type { InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';

const { distribution } = vi.hoisted(() => ({
  distribution: { current: null as InvoiceStatusDistribution | null },
}));

vi.mock('@/hooks/use-dashboard', () => ({
  useDashboardFinancialHealth: () => ({ data: null, isLoading: false }),
  useDashboardInvoiceDistribution: () => ({ data: distribution.current }),
  useDashboardQuickStats: () => ({ data: null }),
}));
vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/use-billing', () => ({ useOverdueInvoiceAging: () => ({ data: [] }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

afterEach(() => cleanup());

function overdueValue() {
  const card = screen.getByText('Overdue Invoices').closest('div[class*="rounded"]') as HTMLElement;
  return card.querySelector('.text-2xl')!.textContent;
}

describe('Overdue Invoices tile (#101)', () => {
  it('shows "-" and not 0 when the invoice distribution is unavailable', () => {
    distribution.current = null;
    render(<FinancialDashboard />);
    expect(overdueValue()).toBe('-');
  });

  it('shows 0 when the distribution genuinely reports zero overdue', () => {
    distribution.current = { unpaid: 0, paid: 3, partiallyPaid: 0, overdue: 0, void: 0 };
    render(<FinancialDashboard />);
    expect(overdueValue()).toBe('0');
  });

  it('shows the overdue count when present', () => {
    distribution.current = { unpaid: 0, paid: 3, partiallyPaid: 0, overdue: 5, void: 0 };
    render(<FinancialDashboard />);
    expect(overdueValue()).toBe('5');
  });
});
