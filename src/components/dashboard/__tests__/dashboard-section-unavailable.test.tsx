// @vitest-environment jsdom
//
// #101 criterion 3: "Zero-value and unavailable states are visually and verbally distinct."
// A failed action-metrics / quick-stats / invoice-distribution query reaches the UI as null and
// must render the unavailable wording, never a zero or "All clear".

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LiveStatusStrip } from '@/components/dashboard/live-status-strip';
import { ModernStatsCards } from '@/components/dashboard/modern-stats-cards';
import { ModernPendingPayments } from '@/components/dashboard/modern-pending-payments';
import { UnifiedActionsCard } from '@/components/dashboard/unified-actions-card';
import type {
  DashboardActionMetrics,
  FinancialHealthMetrics,
  QuickStats,
} from '@/actions/dashboard/get-enhanced-dashboard-stats';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
  // AnimatedCounter reads prefers-reduced-motion.
  if (!window.matchMedia) {
    window.matchMedia = ((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }
});

afterEach(() => cleanup());

const ZERO_METRICS: DashboardActionMetrics = {
  pendingResidentVerifications: 0,
  unverifiedPayments: 0,
  expiringSecurityContacts: 0,
  totalRequiringAttention: 0,
};

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

const quickStats: QuickStats = {
  totalHouses: 10,
  occupiedHouses: 8,
  vacantHouses: 2,
  totalResidents: 20,
  activeResidents: 18,
  pendingVerification: 0,
  totalSecurityContacts: 4,
  activeSecurityContacts: 4,
};

const MORNING = new Date(2026, 9, 15, 9);

describe('null action metrics render unavailable, not zero or All clear (#101)', () => {
  it('LiveStatusStrip: null metrics say unavailable and never "All clear"', () => {
    render(<LiveStatusStrip actionMetrics={null} recentActivity={null} now={MORNING} />);
    expect(screen.getByText('Attention status unavailable')).toBeInTheDocument();
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
  });

  it('LiveStatusStrip: zero metrics say "All clear", not unavailable', () => {
    render(<LiveStatusStrip actionMetrics={ZERO_METRICS} recentActivity={null} now={MORNING} />);
    expect(screen.getByText('All clear')).toBeInTheDocument();
    expect(screen.queryByText('Attention status unavailable')).not.toBeInTheDocument();
  });

  it('ModernStatsCards: null metrics (no error flag) show unavailable, not a zero count', () => {
    render(
      <ModernStatsCards
        financialHealth={financialHealth}
        quickStats={quickStats}
        actionMetrics={null}
        isLoading={false}
      />,
    );
    expect(screen.getByText('Attention status unavailable')).toBeInTheDocument();
    expect(screen.queryByText(/unverified payments/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Unavailable')).toBeInTheDocument();
  });

  it('ModernStatsCards: zero metrics render the breakdown with zeros, not unavailable', () => {
    render(
      <ModernStatsCards
        financialHealth={financialHealth}
        quickStats={quickStats}
        actionMetrics={ZERO_METRICS}
        isLoading={false}
      />,
    );
    expect(screen.getByText(/0 unverified payments/)).toBeInTheDocument();
    expect(screen.queryByText('Attention status unavailable')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Unavailable')).not.toBeInTheDocument();
  });

  it('ModernStatsCards: null quickStats shows the unavailable card, not statistics', () => {
    render(
      <ModernStatsCards
        financialHealth={financialHealth}
        quickStats={null}
        actionMetrics={ZERO_METRICS}
        isLoading={false}
      />,
    );
    expect(screen.getByText('Dashboard metrics unavailable')).toBeInTheDocument();
  });

  it('UnifiedActionsCard: null metrics say unavailable, zero metrics say 0 items', () => {
    render(<UnifiedActionsCard actionMetrics={null} />);
    expect(screen.getByText(/Attention status unavailable/)).toBeInTheDocument();
    expect(screen.queryByText(/0 items need attention/)).not.toBeInTheDocument();
    cleanup();

    render(<UnifiedActionsCard actionMetrics={ZERO_METRICS} />);
    expect(screen.getByText(/0 items need attention/)).toBeInTheDocument();
    expect(screen.queryByText(/Attention status unavailable/)).not.toBeInTheDocument();
  });

  it('ModernPendingPayments: null distribution says unavailable, not "No invoices recorded"', () => {
    render(<ModernPendingPayments distribution={null} />);
    expect(screen.getByText('Invoice counts unavailable')).toBeInTheDocument();
    expect(screen.queryByText('No invoices recorded')).not.toBeInTheDocument();
  });
});
