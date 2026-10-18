// @vitest-environment jsdom
//
// #758 slice 5: QA gaps. Lane tone must reflect every figure shown, unavailable lanes stay neutral,
// null sources show Unavailable not 0, each action button is gated by its own permission.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import type {
  DashboardActionMetrics,
  FinancialHealthMetrics,
  QuickStats,
  RecentActivityItem,
  SecurityAlerts,
} from '@/actions/dashboard/get-enhanced-dashboard-stats';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const perms = vi.hoisted(() => ({ granted: new Set<string>(), all: true }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock('@/lib/auth/auth-provider', () => ({
  useAuth: () => ({ hasPermission: (p: string) => perms.all || perms.granted.has(p) }),
}));

import { CommandStrip } from '@/components/dashboard/command-strip';
import { MoneyLane } from '@/components/dashboard/money-lane';
import { PeopleLane } from '@/components/dashboard/people-lane';
import { SecurityLane } from '@/components/dashboard/security-lane';
import { CommandRecentActivity } from '@/components/dashboard/command-recent-activity';

afterEach(() => {
  cleanup();
  perms.all = true;
  perms.granted = new Set();
});

const fh = (over: Partial<FinancialHealthMetrics> = {}): FinancialHealthMetrics => ({
  totalOutstanding: 60000,
  totalCollected: 40000,
  collectionRate: 40,
  monthlyRevenue: 25000,
  totalMonthlyRevenue: 30000,
  previousMonthRevenue: 0,
  revenueChange: 0,
  totalWalletBalance: 0,
  portfolioValue: 0,
  importedBankNetCash: 0,
  pettyCashBalance: 0,
  estateCash: 0,
  walletCredits: 5000,
  overdueAmount: 12000,
  overdueCount: 2,
  ...over,
});
const am = (over: Partial<DashboardActionMetrics> = {}): DashboardActionMetrics => ({
  pendingResidentVerifications: 0,
  unverifiedPayments: 0,
  expiringSecurityContacts: 0,
  totalRequiringAttention: 0,
  ...over,
});
const qs: QuickStats = {
  totalHouses: 179,
  occupiedHouses: 120,
  vacantHouses: 59,
  totalResidents: 200,
  activeResidents: 180,
  pendingVerification: 0,
  totalSecurityContacts: 30,
  activeSecurityContacts: 25,
};
const sa = (over: Partial<SecurityAlerts> = {}): SecurityAlerts => ({
  expiringCodesCount: 0,
  expiredCodesCount: 0,
  suspendedContactsCount: 0,
  recentFlaggedEntries: 0,
  expiringCodes: [],
  ...over,
});
const counts = (over: Partial<{ paid_up: number; outstanding: number; overdue: number; no_invoice: number }> = {}) => ({
  paid_up: 5,
  outstanding: 1,
  overdue: 0,
  no_invoice: 173,
  ...over,
});

const tone = (id: string) => screen.getByTestId(id).getAttribute('data-tone');

describe('security lane tone reflects every figure shown', () => {
  it.each([
    ['expiring contacts', am({ expiringSecurityContacts: 2 }), sa(), '2 contacts expiring soon'],
    ['expired codes', am(), sa({ expiredCodesCount: 1 }), '1 expired access code'],
    ['suspended contacts', am(), sa({ suspendedContactsCount: 3 }), '3 suspended contacts'],
    ['flagged entries', am(), sa({ recentFlaggedEntries: 4 }), '4 flagged entries'],
  ])('%s alone makes it attention and says why', (_n, metrics, alerts, text) => {
    render(<SecurityLane actionMetrics={metrics} securityAlerts={alerts} quickStats={qs} />);
    expect(tone('lane-security')).toBe('attention');
    expect(screen.getByTestId('lane-security-summary')).toHaveTextContent(`Needs attention: ${text}`);
  });

  it('is healthy only when every shown figure is zero', () => {
    render(<SecurityLane actionMetrics={am()} securityAlerts={sa()} quickStats={qs} />);
    expect(tone('lane-security')).toBe('ok');
    expect(screen.getByTestId('lane-security-summary')).toHaveTextContent('No expiring contacts, expired codes');
  });

  it('is neutral, not healthy, when the alert figures are missing', () => {
    render(<SecurityLane actionMetrics={am()} securityAlerts={null} quickStats={qs} />);
    expect(tone('lane-security')).toBe('neutral');
    expect(screen.getByTestId('lane-security-summary')).toHaveTextContent('unavailable');
  });

  it('shows Unavailable, not 0, for alert rows when securityAlerts is null', () => {
    render(<SecurityLane actionMetrics={am()} securityAlerts={null} quickStats={qs} />);
    const rows = within(screen.getByTestId('lane-security-queue')).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Expired access codes');
    expect(rows[0]).toHaveTextContent('Unavailable');
    expect(rows[0]).not.toHaveTextContent('0');
  });
});

describe('people lane', () => {
  it('overdue houses make it attention and are named in the status and a row', () => {
    render(<PeopleLane actionMetrics={am()} quickStats={qs} estateMapCounts={counts({ overdue: 2 })} />);
    expect(tone('lane-people')).toBe('attention');
    expect(screen.getByTestId('lane-people-overdue')).toHaveTextContent('2 houses are overdue');
    const rows = within(screen.getByTestId('lane-people-queue')).getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[2]).toHaveTextContent('Overdue houses2');
  });

  it('one overdue house reads in the singular', () => {
    render(<PeopleLane actionMetrics={am()} quickStats={qs} estateMapCounts={counts({ overdue: 1 })} />);
    expect(screen.getByTestId('lane-people-overdue')).toHaveTextContent('1 house is overdue');
  });

  it('no overdue houses stays healthy and shows no overdue line', () => {
    render(<PeopleLane actionMetrics={am()} quickStats={qs} estateMapCounts={counts()} />);
    expect(tone('lane-people')).toBe('ok');
    expect(screen.queryByTestId('lane-people-overdue')).toBeNull();
  });

  it('without map counts keeps the old behaviour and the vacant row', () => {
    render(<PeopleLane actionMetrics={am()} quickStats={qs} estateMapCounts={null} />);
    expect(tone('lane-people')).toBe('ok');
    expect(screen.getByTestId('lane-people-queue')).toHaveTextContent('Vacant houses59');
    expect(screen.queryByText('Overdue houses')).toBeNull();
  });

  it('awaiting residents make it attention', () => {
    render(<PeopleLane actionMetrics={am({ pendingResidentVerifications: 2 })} quickStats={qs} />);
    expect(tone('lane-people')).toBe('attention');
  });

  it('shows Unavailable, not 0, for active residents when quickStats is null', () => {
    render(<PeopleLane actionMetrics={am()} quickStats={null} />);
    const row = within(screen.getByTestId('lane-people-queue')).getAllByRole('listitem')[0];
    expect(row).toHaveTextContent('Active residents');
    expect(row).toHaveTextContent('Unavailable');
    expect(row).not.toHaveTextContent('0');
  });
});

describe('money lane', () => {
  it('names the real period of each figure and what verified counts', () => {
    render(<MoneyLane financialHealth={fh()} actionMetrics={am()} />);
    const lane = screen.getByTestId('lane-money');
    expect(screen.getByTestId('lane-money-hero')).toHaveTextContent('Collected on invoices, all time');
    expect(lane).toHaveTextContent('Verified payments this month');
    expect(lane).toHaveTextContent('confirmed or that came in through a bank or email statement import');
    expect(lane).not.toHaveTextContent('bank-matched');
  });

  it('unverified payments make it attention when nothing is overdue', () => {
    render(<MoneyLane financialHealth={fh({ overdueCount: 0 })} actionMetrics={am({ unverifiedPayments: 1 })} />);
    expect(tone('lane-money')).toBe('attention');
  });
});

describe('unavailable lane that still receives data', () => {
  it('is neutral with no figures in rows and no as-of time', () => {
    const asOf = '2026-10-18T10:30:00Z';
    render(
      <>
        <MoneyLane financialHealth={fh()} actionMetrics={am({ unverifiedPayments: 4 })} asOf={asOf} isUnavailable />
        <PeopleLane actionMetrics={am({ pendingResidentVerifications: 2 })} quickStats={qs} asOf={asOf} isUnavailable />
        <SecurityLane actionMetrics={am({ expiringSecurityContacts: 2 })} securityAlerts={sa({ expiredCodesCount: 2 })} quickStats={qs} asOf={asOf} isUnavailable />
      </>,
    );
    for (const id of ['lane-money', 'lane-people', 'lane-security']) {
      expect(tone(id)).toBe('neutral');
      expect(screen.getByTestId(id)).toHaveAttribute('data-lane-state', 'unavailable');
      expect(screen.getByTestId(`${id}-state`)).toHaveTextContent('Unavailable');
      expect(screen.queryByTestId(`${id}-asof`)).toBeNull();
      expect(screen.getByTestId(`${id}-queue`)).not.toHaveTextContent(/\d/);
      expect(screen.getByTestId(`${id}-queue`)).not.toHaveTextContent('₦');
      expect(screen.getByTestId(`${id}-queue`)).toHaveTextContent('Unavailable');
    }
  });
});

describe('command strip with isUnavailable and data present', () => {
  it('claims neither all clear nor an urgent item built from stale data', () => {
    const { rerender } = render(<CommandStrip financialHealth={fh()} actionMetrics={am({ unverifiedPayments: 4 })} isUnavailable />);
    const urgent = screen.getByTestId('command-strip-urgent');
    expect(urgent).toHaveTextContent('Attention status unavailable');
    expect(within(urgent).queryByRole('link')).toBeNull();
    expect(urgent).not.toHaveTextContent('Most urgent');
    rerender(<CommandStrip financialHealth={fh({ overdueCount: 0 })} actionMetrics={am()} isUnavailable />);
    expect(screen.getByTestId('command-strip-urgent')).toHaveTextContent('Attention status unavailable');
    expect(screen.queryByText(/All clear/)).toBeNull();
  });
});

// Each button must be gated by its own permission and no other.
const ALL_PERMS = Object.values(PERMISSIONS) as string[];
const without = (p: string) => new Set(ALL_PERMS.filter((x) => x !== p));

const allLanes = () => (
  <>
    <MoneyLane financialHealth={fh()} actionMetrics={am()} />
    <PeopleLane actionMetrics={am()} quickStats={qs} />
    <SecurityLane actionMetrics={am()} securityAlerts={sa()} quickStats={qs} />
  </>
);

const CASES: Array<{ name: string; perm: string; lane: string; primary: boolean }> = [
  { name: 'Verify payments', perm: PERMISSIONS.APPROVALS_VIEW, lane: 'lane-money', primary: true },
  { name: 'Generate invoices', perm: PERMISSIONS.BILLING_CREATE_INVOICE, lane: 'lane-money', primary: false },
  { name: 'Import statement', perm: PERMISSIONS.IMPORTS_CREATE, lane: 'lane-money', primary: false },
  { name: 'Add house', perm: PERMISSIONS.HOUSES_CREATE, lane: 'lane-people', primary: false },
  { name: 'Review residents', perm: PERMISSIONS.RESIDENTS_VIEW, lane: 'lane-people', primary: true },
  { name: 'Open security contacts', perm: PERMISSIONS.SECURITY_VIEW, lane: 'lane-security', primary: true },
];

describe('action buttons are gated by their own permission', () => {
  it.each(CASES)('$name is unavailable with every other permission but not $perm', ({ name, perm, lane, primary }) => {
    perms.all = false;
    perms.granted = without(perm);
    render(allLanes());
    const el = screen.getByTestId(lane);
    expect(within(el).queryByRole('link', { name })).toBeNull();
    if (primary) expect(within(el).getByRole('button', { name })).toBeDisabled();
    else expect(within(el).queryByRole('button', { name })).toBeNull();
  });

  it.each(CASES)('$name is enabled with only $perm', ({ name, perm, lane }) => {
    perms.all = false;
    perms.granted = new Set([perm]);
    render(allLanes());
    expect(within(screen.getByTestId(lane)).getByRole('link', { name })).toBeInTheDocument();
  });
});

describe('CommandRecentActivity cap', () => {
  it('renders at most 6 events', () => {
    const many: RecentActivityItem[] = Array.from({ length: 9 }, (_, i) => ({
      id: `e${i}`,
      type: 'payment',
      action: `Action e${i}`,
      description: `Desc e${i}`,
      timestamp: '2026-10-18T10:00:00Z',
    }));
    render(<CommandRecentActivity activities={many} />);
    const list = within(screen.getByTestId('command-recent-activity')).getByRole('list');
    expect(within(list).getAllByRole('listitem')).toHaveLength(6);
    expect(screen.queryByText('Action e6')).toBeNull();
  });
});
