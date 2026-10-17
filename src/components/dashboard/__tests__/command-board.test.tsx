// @vitest-environment jsdom
//
// #758 slice 2: command strip and the three lanes. Honest states (loading, unavailable, ready),
// no fake zeros for null data, permission-gated actions, one landmark structure per lane.

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

import { CommandStrip, pickUrgentItem, getGreeting } from '@/components/dashboard/command-strip';
import { MoneyLane } from '@/components/dashboard/money-lane';
import { PeopleLane } from '@/components/dashboard/people-lane';
import { SecurityLane } from '@/components/dashboard/security-lane';
import { CommandRecentActivity, filterEstateActivity } from '@/components/dashboard/command-recent-activity';

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
  pendingResidentVerifications: 3,
  unverifiedPayments: 4,
  expiringSecurityContacts: 1,
  totalRequiringAttention: 8,
  ...over,
});
const qs: QuickStats = {
  totalHouses: 179,
  occupiedHouses: 120,
  vacantHouses: 59,
  totalResidents: 200,
  activeResidents: 180,
  pendingVerification: 3,
  totalSecurityContacts: 30,
  activeSecurityContacts: 25,
};
const sa: SecurityAlerts = {
  expiringCodesCount: 1,
  expiredCodesCount: 2,
  suspendedContactsCount: 3,
  recentFlaggedEntries: 4,
  expiringCodes: [],
};
const NONE = am({ pendingResidentVerifications: 0, unverifiedPayments: 0, expiringSecurityContacts: 0, totalRequiringAttention: 0 });

describe('pickUrgentItem', () => {
  it('prefers overdue invoices over everything', () => {
    expect(pickUrgentItem(fh(), am())).toMatchObject({ kind: 'overdue_invoices', count: 2 });
  });
  it('then payments to verify', () => {
    expect(pickUrgentItem(fh({ overdueCount: 0 }), am())).toMatchObject({ kind: 'payments_to_verify', count: 4 });
  });
  it('then residents awaiting review', () => {
    expect(pickUrgentItem(fh({ overdueCount: 0 }), am({ unverifiedPayments: 0 }))).toMatchObject({ kind: 'residents_awaiting_review', count: 3 });
  });
  it('then expiring contacts', () => {
    expect(pickUrgentItem(fh({ overdueCount: 0 }), am({ unverifiedPayments: 0, pendingResidentVerifications: 0 }))).toMatchObject({
      kind: 'expiring_contacts',
      count: 1,
    });
  });
  it('is clear only when every source loaded and nothing needs action', () => {
    expect(pickUrgentItem(fh({ overdueCount: 0 }), NONE)).toBe('clear');
  });
  it('is unknown, not clear, when a source is missing', () => {
    expect(pickUrgentItem(null, NONE)).toBeNull();
    expect(pickUrgentItem(fh({ overdueCount: 0 }), null)).toBeNull();
  });
  it('still surfaces a known urgent item when the other source is missing', () => {
    expect(pickUrgentItem(null, am())).toMatchObject({ kind: 'payments_to_verify' });
    expect(pickUrgentItem(fh(), null)).toMatchObject({ kind: 'overdue_invoices' });
  });
});

describe('CommandStrip', () => {
  it('greets by time of day with the first name and links the urgent item', () => {
    expect(getGreeting(new Date(2026, 0, 1, 9))).toBe('Good morning');
    expect(getGreeting(new Date(2026, 0, 1, 13))).toBe('Good afternoon');
    expect(getGreeting(new Date(2026, 0, 1, 20))).toBe('Good evening');
    render(<CommandStrip name="Ada Obi" financialHealth={fh()} actionMetrics={am()} now={new Date(2026, 0, 1, 9)} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Good morning, Ada');
    expect(screen.getByRole('link')).toHaveAttribute('href', '/billing');
    expect(screen.getByTestId('command-strip-urgent')).toHaveTextContent('2 invoices are overdue');
  });
  it('shows an all-clear line', () => {
    render(<CommandStrip financialHealth={fh({ overdueCount: 0 })} actionMetrics={NONE} />);
    expect(screen.getByTestId('command-strip-urgent')).toHaveTextContent('All clear');
  });
  it('shows unavailable, never all clear, when data is null', () => {
    render(<CommandStrip financialHealth={null} actionMetrics={null} />);
    expect(screen.getByTestId('command-strip-urgent')).toHaveTextContent('Attention status unavailable');
    expect(screen.queryByText(/All clear/)).toBeNull();
  });
  it('shows a loading placeholder while loading', () => {
    render(<CommandStrip financialHealth={null} actionMetrics={null} isLoading />);
    expect(screen.getByLabelText('Loading status')).toBeInTheDocument();
  });
});

const ANATOMY = ['hero', 'status', 'queue'];

function lanes() {
  return (
    <>
      <MoneyLane financialHealth={fh()} actionMetrics={am()} asOf="2026-10-18T10:30:00Z" />
      <PeopleLane actionMetrics={am()} quickStats={qs} asOf="2026-10-18T10:30:00Z" />
      <SecurityLane actionMetrics={am()} securityAlerts={sa} quickStats={qs} asOf="2026-10-18T10:30:00Z" />
    </>
  );
}

describe('lanes', () => {
  it('render identical landmark structure when ready', () => {
    render(lanes());
    for (const id of ['lane-money', 'lane-people', 'lane-security']) {
      const lane = screen.getByTestId(id);
      expect(lane.tagName).toBe('SECTION');
      expect(within(lane).getAllByRole('heading', { level: 2 })).toHaveLength(1);
      for (const part of ANATOMY) expect(screen.getByTestId(`${id}-${part}`)).toBeInTheDocument();
      expect(within(screen.getByTestId(`${id}-queue`)).getAllByRole('listitem')).toHaveLength(3);
      expect(within(lane).getAllByRole('link').length).toBeGreaterThanOrEqual(1);
      expect(screen.getByTestId(`${id}-asof`)).toHaveTextContent('as of');
    }
  });

  it('money lane shows real figures, the explanation and the approvals route', () => {
    render(<MoneyLane financialHealth={fh()} actionMetrics={am()} />);
    const lane = screen.getByTestId('lane-money');
    expect(screen.getByTestId('lane-money-hero')).toHaveTextContent('₦40,000');
    expect(lane).toHaveTextContent('collected of ₦100,000 invoiced (40%)');
    expect(lane).toHaveTextContent('Verified this month: ₦25,000');
    expect(lane).toHaveTextContent('Collection counts invoice payments. Verified counts bank-matched receipts.');
    expect(within(screen.getByTestId('lane-money-queue')).getAllByRole('listitem')[0]).toHaveTextContent('Payments to verify4');
    expect(within(lane).getByRole('link', { name: 'Verify payments' })).toHaveAttribute('href', '/approvals');
    expect(screen.getByTestId('lane-money-state')).toHaveTextContent('Overdue');
    expect(screen.queryByTestId('lane-money-asof')).toBeNull();
  });

  it('money lane with no invoices is neutral, not healthy', () => {
    render(<MoneyLane financialHealth={fh({ totalCollected: 0, totalOutstanding: 0, overdueCount: 0, overdueAmount: 0 })} actionMetrics={NONE} />);
    expect(screen.getByTestId('lane-money')).toHaveAttribute('data-tone', 'neutral');
    expect(screen.getByTestId('lane-money')).toHaveTextContent('No invoices raised yet');
  });

  it('money lane turns the overdue suggestion into a queue row hint', () => {
    render(
      <MoneyLane
        financialHealth={fh()}
        actionMetrics={am()}
        suggestions={[{ id: 'suggestion-severely-overdue-invoices', title: '12 invoices overdue 30+ days', description: '', actionLabel: '', actionUrl: '/billing', priority: 'high', type: 'finance' }]}
      />,
    );
    expect(screen.getByTestId('lane-money-queue')).toHaveTextContent('12 invoices overdue 30+ days');
  });

  it('people lane hides the houses-paid-up line without map counts and shows it with them', () => {
    const { rerender } = render(<PeopleLane actionMetrics={am()} quickStats={qs} />);
    expect(screen.queryByTestId('lane-people-paid-up')).toBeNull();
    rerender(<PeopleLane actionMetrics={am()} quickStats={qs} estateMapCounts={null} />);
    expect(screen.queryByTestId('lane-people-paid-up')).toBeNull();
    rerender(<PeopleLane actionMetrics={am()} quickStats={qs} estateMapCounts={{ paid_up: 5, outstanding: 1, overdue: 2, no_invoice: 171 }} />);
    expect(screen.getByTestId('lane-people-paid-up')).toHaveTextContent('5 of 179 houses paid up');
  });

  it('people and security lanes link to their routes', () => {
    render(lanes());
    expect(within(screen.getByTestId('lane-people')).getByRole('link', { name: 'Review residents' })).toHaveAttribute('href', '/residents');
    expect(within(screen.getByTestId('lane-security')).getByRole('link', { name: 'Open security contacts' })).toHaveAttribute('href', '/security/contacts');
  });

  it('loading shows placeholders and no figures', () => {
    render(
      <>
        <MoneyLane financialHealth={null} actionMetrics={null} isLoading />
        <PeopleLane actionMetrics={null} quickStats={null} isLoading />
        <SecurityLane actionMetrics={null} quickStats={null} isLoading />
      </>,
    );
    for (const id of ['lane-money', 'lane-people', 'lane-security']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-lane-state', 'loading');
      expect(screen.getByTestId(`${id}-hero`)).not.toHaveTextContent(/\d/);
      expect(screen.getByTestId(`${id}-hero`)).not.toHaveTextContent('Unavailable');
    }
  });

  it('null data is unavailable with no fake zero', () => {
    render(
      <>
        <MoneyLane financialHealth={null} actionMetrics={null} />
        <PeopleLane actionMetrics={null} quickStats={null} />
        <SecurityLane actionMetrics={null} quickStats={null} />
      </>,
    );
    for (const id of ['lane-money', 'lane-people', 'lane-security']) {
      expect(screen.getByTestId(id)).toHaveAttribute('data-lane-state', 'unavailable');
      expect(screen.getByTestId(`${id}-hero`)).toHaveTextContent('Unavailable');
      expect(screen.getByTestId(`${id}-hero`)).not.toHaveTextContent('0');
      expect(screen.getByTestId(`${id}-queue`)).not.toHaveTextContent(/\d/);
    }
  });

  it('isUnavailable (query error) overrides present data', () => {
    render(<MoneyLane financialHealth={fh()} actionMetrics={am()} isUnavailable />);
    expect(screen.getByTestId('lane-money')).toHaveAttribute('data-lane-state', 'unavailable');
    expect(screen.getByTestId('lane-money-hero')).not.toHaveTextContent('₦');
  });

  it('partial data: one missing source shows Unavailable for its rows only', () => {
    render(<MoneyLane financialHealth={fh()} actionMetrics={null} />);
    const rows = within(screen.getByTestId('lane-money-queue')).getAllByRole('listitem');
    expect(rows[0]).toHaveTextContent('Unavailable');
    expect(rows[1]).toHaveTextContent('₦12,000');
  });

  it('disables the primary action and hides secondary actions without permission', () => {
    perms.all = false;
    perms.granted = new Set(['payments.create']);
    render(lanes());
    const money = screen.getByTestId('lane-money');
    expect(within(money).queryByRole('link', { name: 'Verify payments' })).toBeNull();
    expect(within(money).getByRole('button', { name: 'Verify payments' })).toBeDisabled();
    expect(within(money).getByRole('link', { name: 'Record payment' })).toBeInTheDocument();
    expect(within(money).queryByRole('link', { name: 'Generate invoices' })).toBeNull();
    expect(within(money).queryByRole('link', { name: 'Import statement' })).toBeNull();
    expect(within(screen.getByTestId('lane-people')).queryByRole('link')).toBeNull();
    expect(within(screen.getByTestId('lane-security')).queryByRole('link')).toBeNull();
  });
});

describe('CommandRecentActivity', () => {
  const item = (id: string, type: RecentActivityItem['type']): RecentActivityItem => ({
    id,
    type,
    action: `Action ${id}`,
    description: `Desc ${id}`,
    timestamp: '2026-10-18T10:00:00Z',
  });

  it('keeps payment, resident and security events only', () => {
    const out = filterEstateActivity([item('a', 'payment'), item('b', 'import'), item('c', 'resident'), item('d', 'approval'), item('e', 'security'), item('f', 'invoice')]);
    expect(out.map((i) => i.id)).toEqual(['a', 'c', 'e']);
  });

  it('renders the filtered list', () => {
    render(<CommandRecentActivity activities={[item('a', 'payment'), item('b', 'import')]} />);
    expect(screen.getByText('Action a')).toBeInTheDocument();
    expect(screen.queryByText('Action b')).toBeNull();
  });

  it('shows the permission-locked state, not an empty state', () => {
    render(<CommandRecentActivity activities={[]} isUnavailable />);
    expect(screen.getByTestId('recent-activity-unavailable')).toHaveTextContent("isn't available for your role");
    expect(screen.queryByText(/No recent/)).toBeNull();
  });

  it('shows a skeleton for null activities and an empty note for none', () => {
    const { rerender } = render(<CommandRecentActivity activities={null} />);
    expect(screen.getByLabelText('Loading recent activity')).toBeInTheDocument();
    rerender(<CommandRecentActivity activities={[]} />);
    expect(screen.getByText(/No recent payment, resident or security contact activity/)).toBeInTheDocument();
  });
});
