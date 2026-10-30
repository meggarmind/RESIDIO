// @vitest-environment jsdom
//
// #101: the Overdue Invoices tile must show "-" (unavailable) when the invoice distribution
// failed to load (null), and a real "0" only when the distribution genuinely reports zero.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { FinancialDashboard } from '../financial-dashboard';
import { formatCurrency } from '@/lib/utils';
import type { FinancialHealthMetrics, InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';

const { distribution, health } = vi.hoisted(() => ({
  distribution: { current: null as InvoiceStatusDistribution | null },
  health: { current: null as FinancialHealthMetrics | null },
}));

vi.mock('@/hooks/use-dashboard', () => ({
  useDashboardFinancialHealth: () => ({ data: health.current, isLoading: false }),
  useDashboardInvoiceDistribution: () => ({ data: distribution.current }),
  useDashboardQuickStats: () => ({ data: null }),
}));
vi.mock('@/hooks/use-analytics', () => ({ useAnalytics: () => ({ data: null, isLoading: false }) }));
vi.mock('@/hooks/use-billing', () => ({ useOverdueInvoiceAging: () => ({ data: [] }) }));
vi.mock('next/dynamic', () => ({ default: () => () => null }));

afterEach(() => cleanup());

function tile(title: string) {
  return screen.getByText(title).closest('div[class*="rounded"]') as HTMLElement;
}
function overdueValue() {
  return tile('Overdue Invoices').querySelector('.text-3xl')!.textContent;
}

const HEALTH: FinancialHealthMetrics = {
  totalOutstanding: 125000,
  totalCollected: 500000,
  collectionRate: 80,
  monthlyRevenue: 100000,
  totalMonthlyRevenue: 120000,
  previousMonthRevenue: 90000,
  revenueChange: 11.1,
  totalWalletBalance: 25000,
  portfolioValue: 350000,
  importedBankNetCash: 300000,
  pettyCashBalance: 50000,
  estateCash: 350000,
  walletCredits: 25000,
  overdueAmount: 40000,
  overdueCount: 2,
};
const ZERO_HEALTH: FinancialHealthMetrics = {
  ...HEALTH,
  collectionRate: 0,
  totalOutstanding: 0,
  overdueAmount: 0,
  portfolioValue: 0,
};

const TILES = [
  ['Collection Rate', '0.0%', '80.0%'],
  ['Outstanding', formatCurrency(0), formatCurrency(125000)],
  ['Portfolio Value', formatCurrency(0), formatCurrency(350000)],
] as const;

describe('financial health tiles when financialHealth is null (#101)', () => {
  it.each(TILES)('%s shows "-", never a zero amount', (title, zeroText) => {
    health.current = null;
    distribution.current = null;
    render(<FinancialDashboard />);
    const text = tile(title).querySelector('.text-3xl')!.textContent;
    expect(text).toBe('-');
    expect(text).not.toBe(zeroText);
  });

  it.each(TILES)('%s renders a real zero as zero, and real values as values', (title, zeroText, realText) => {
    health.current = ZERO_HEALTH;
    distribution.current = null;
    render(<FinancialDashboard />);
    expect(tile(title).querySelector('.text-3xl')!.textContent).toBe(zeroText);
    cleanup();

    health.current = HEALTH;
    render(<FinancialDashboard />);
    expect(tile(title).querySelector('.text-3xl')!.textContent).toBe(realText);
  });

  it('Overdue tile sub-line says unavailable when null, and shows a real zero amount', () => {
    health.current = null;
    distribution.current = null;
    render(<FinancialDashboard />);
    expect(tile('Overdue Invoices')).toHaveTextContent('Amount unavailable');
    expect(tile('Overdue Invoices')).not.toHaveTextContent(formatCurrency(0));
    cleanup();

    health.current = ZERO_HEALTH;
    render(<FinancialDashboard />);
    expect(tile('Overdue Invoices')).toHaveTextContent(`${formatCurrency(0)} total`);
    expect(tile('Overdue Invoices')).not.toHaveTextContent('Amount unavailable');
  });
});

describe('Overdue Invoices tile (#101)', () => {
  beforeEach(() => {
    health.current = HEALTH;
  });

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
