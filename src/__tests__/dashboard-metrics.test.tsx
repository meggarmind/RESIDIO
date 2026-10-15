import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ModernFinancialHealth } from '@/components/dashboard/modern-financial-health';
import { ModernPendingPayments } from '@/components/dashboard/modern-pending-payments';
import { UnifiedActionsCard } from '@/components/dashboard/unified-actions-card';
import type { FinancialHealthMetrics, InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

// AnimatedCounter renders its initial 0 on the server and counts up in an effect, so static
// markup never contains the target value. Render the value directly to assert on it.
vi.mock('@/components/ui/animated-counter', () => ({
  AnimatedCounter: ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => (
    <span data-testid="counter">{`${prefix}${value}${suffix}`}</span>
  ),
}));

const financialHealth: FinancialHealthMetrics = {
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

const populatedDistribution: InvoiceStatusDistribution = {
  unpaid: 3,
  paid: 8,
  partiallyPaid: 2,
  overdue: 1,
  void: 4,
};

const emptyDistribution: InvoiceStatusDistribution = {
  unpaid: 0,
  paid: 0,
  partiallyPaid: 0,
  overdue: 0,
  void: 0,
};

describe('trustworthy dashboard financial states', () => {
  it('uses explicit labels for populated financial metrics', () => {
    const markup = renderToStaticMarkup(<ModernFinancialHealth financialHealth={financialHealth} />);

    expect(markup).toContain('Unpaid Invoice Balance');
    expect(markup).toContain('Verified Payments This Month');
    expect(markup).toContain('Overdue Invoice Balance');
    expect(markup).toContain('Resident Wallet Credits');
  });

  it('distinguishes unavailable financial metrics from zero values', () => {
    const unavailable = renderToStaticMarkup(<ModernFinancialHealth financialHealth={null} />);

    expect(unavailable).toContain('Financial metrics unavailable');
    expect(unavailable).not.toContain('Resident Wallet Credits');
    expect(unavailable).not.toContain('data-testid="counter"');
  });

  // Each field is zeroed on its own, so a zero elsewhere cannot satisfy the assertion.
  it.each([
    ['Unpaid Invoice Balance', 'totalOutstanding'],
    ['Verified Payments This Month', 'monthlyRevenue'],
    ['Overdue Invoice Balance', 'overdueAmount'],
    ['Resident Wallet Credits', 'walletCredits'],
  ] as const)('renders a real zero for %s, and the real value otherwise', (label, field) => {
    const firstCounterAfter = (markup: string) =>
      new RegExp(`${label}(?:(?!data-testid="counter").)*?data-testid="counter">([^<]*)<`, 's').exec(markup)?.[1];

    const zero = renderToStaticMarkup(<ModernFinancialHealth financialHealth={{ ...financialHealth, [field]: 0 }} />);
    const nonZero = renderToStaticMarkup(<ModernFinancialHealth financialHealth={{ ...financialHealth, [field]: 5 }} />);

    expect(zero).not.toContain('Financial metrics unavailable');
    expect(firstCounterAfter(zero)).toBe('₦0');
    expect(firstCounterAfter(nonZero)).toBe('₦5');
  });

  it('labels populated values as invoice status counts', () => {
    const markup = renderToStaticMarkup(<ModernPendingPayments distribution={populatedDistribution} />);

    expect(markup).toContain('Invoice Status Counts');
    expect(markup).toContain('Partially paid');
    expect(markup).toContain('>8<');
  });

  it('distinguishes no invoices from unavailable invoice counts', () => {
    const empty = renderToStaticMarkup(<ModernPendingPayments distribution={emptyDistribution} />);
    const unavailable = renderToStaticMarkup(<ModernPendingPayments distribution={null} />);

    expect(empty).toContain('No invoices recorded');
    expect(empty).toContain('All invoice status counts are zero');
    expect(unavailable).toContain('Invoice counts unavailable');
    expect(unavailable).not.toContain('No invoices recorded');
  });
});

describe('trustworthy dashboard action states', () => {
  it('shows real populated attention state', () => {
    const markup = renderToStaticMarkup(
      <UnifiedActionsCard
        actionMetrics={{
          pendingResidentVerifications: 2,
          unverifiedPayments: 3,
          expiringSecurityContacts: 1,
          totalRequiringAttention: 6,
        }}
      />,
    );

    expect(markup).toContain('Need Attention');
    expect(markup).toContain('<span data-testid="counter">6</span>');
    expect(markup).not.toContain('0 items need attention');
  });

  it('distinguishes zero actions from unavailable action metrics', () => {
    const empty = renderToStaticMarkup(
      <UnifiedActionsCard
        actionMetrics={{
          pendingResidentVerifications: 0,
          unverifiedPayments: 0,
          expiringSecurityContacts: 0,
          totalRequiringAttention: 0,
        }}
      />,
    );
    const unavailable = renderToStaticMarkup(<UnifiedActionsCard actionMetrics={null} isUnavailable />);

    expect(empty).toContain('0 items need attention');
    expect(unavailable).toContain('Attention status unavailable');
    expect(unavailable).not.toContain('0 items need attention');
  });
});
