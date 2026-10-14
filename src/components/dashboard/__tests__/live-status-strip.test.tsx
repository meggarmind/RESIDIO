// @vitest-environment jsdom
//
// Issue #90: contextual live-status strip on the admin dashboard.
// Pins the time-of-day framing, the same-day evening count, and the two
// "do not lie" states: audit-log access denied (#197) and snapshot unavailable.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { LiveStatusStrip } from '@/components/dashboard/live-status-strip';
import type {
  DashboardActionMetrics,
  RecentActivityItem,
} from '@/actions/dashboard/get-enhanced-dashboard-stats';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

afterEach(() => {
  cleanup();
  push.mockReset();
});

const at = (h: number, m = 0, day = 15) => new Date(2026, 9, day, h, m);
const MORNING = at(9);
const AFTERNOON = at(14);
const EVENING = at(19);

const METRICS: DashboardActionMetrics = {
  pendingResidentVerifications: 2,
  unverifiedPayments: 3,
  expiringSecurityContacts: 1,
  totalRequiringAttention: 6,
};
const ZERO: DashboardActionMetrics = {
  pendingResidentVerifications: 0,
  unverifiedPayments: 0,
  expiringSecurityContacts: 0,
  totalRequiringAttention: 0,
};

const item = (id: string, when: Date, description = `desc-${id}`): RecentActivityItem => ({
  id,
  type: 'payment',
  action: 'Payment recorded',
  description,
  timestamp: when.toISOString(),
});

const ACTIVITY = [
  item('a', at(18, 30), 'Newest thing'),
  item('b', at(8, 0), 'Earlier today'),
  item('c', at(20, 0, 14), 'Yesterday thing'),
];

const strip = (over: Partial<React.ComponentProps<typeof LiveStatusStrip>> = {}) =>
  render(
    <LiveStatusStrip
      actionMetrics={METRICS}
      recentActivity={ACTIVITY}
      now={EVENING}
      {...over}
    />
  );

describe('LiveStatusStrip time-of-day framing (#90)', () => {
  it('frames the morning around attention items', () => {
    strip({ now: MORNING });
    expect(screen.getByTestId('live-status-strip')).toHaveAttribute('data-period', 'morning');
    expect(screen.getByRole('heading', { name: 'Needs attention today' })).toBeInTheDocument();
    expect(screen.getByText(/6 items \(2 pending verification\)/)).toBeInTheDocument();
  });

  it('frames the afternoon around payments', () => {
    strip({ now: AFTERNOON });
    expect(screen.getByTestId('live-status-strip')).toHaveAttribute('data-period', 'afternoon');
    expect(screen.getByRole('heading', { name: 'Payments focus' })).toBeInTheDocument();
    expect(screen.getByText('3 payments to verify')).toBeInTheDocument();
    expect(screen.queryByText(/pending verification\)/)).not.toBeInTheDocument();
  });

  it('frames the evening around today\'s activity', () => {
    strip({ now: EVENING });
    expect(screen.getByTestId('live-status-strip')).toHaveAttribute('data-period', 'evening');
    expect(screen.getByRole('heading', { name: "Today's activity" })).toBeInTheDocument();
  });

  it('switches period exactly at 12:00 and 17:00', () => {
    const period = (d: Date) => {
      const { unmount } = strip({ now: d });
      const p = screen.getByTestId('live-status-strip').getAttribute('data-period');
      unmount();
      return p;
    };
    expect(period(at(11, 59))).toBe('morning');
    expect(period(at(12, 0))).toBe('afternoon');
    expect(period(at(16, 59))).toBe('afternoon');
    expect(period(at(17, 0))).toBe('evening');
  });

  it('counts only same-day activity in the evening', () => {
    strip({ now: EVENING });
    // a and b are on the 15th, c is on the 14th.
    expect(screen.getByText('2 events today')).toBeInTheDocument();
  });
});

describe('LiveStatusStrip widgets', () => {
  it('shows the most recent activity item with relative time', () => {
    strip({ now: EVENING });
    expect(screen.getByText(/Newest thing · .*ago/)).toBeInTheDocument();
  });

  it('hides the activity widgets and does not claim emptiness when audit access is denied', () => {
    strip({ recentActivity: [], recentActivityUnavailable: true, now: EVENING });
    expect(screen.queryByText('Latest activity')).not.toBeInTheDocument();
    expect(screen.queryByText("Today's activity", { selector: 'p' })).not.toBeInTheDocument();
    expect(screen.queryByText(/0 events today/)).not.toBeInTheDocument();
    expect(screen.queryByText(/No recent activity/i)).not.toBeInTheDocument();
  });

  it('shows a neutral line, not zeros, when the snapshot is unavailable', () => {
    strip({ actionMetrics: null, recentActivity: null, isUnavailable: true });
    expect(screen.getByTestId('live-status-unavailable')).toHaveTextContent('Live status unavailable');
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.queryByTestId('live-status-strip')).not.toBeInTheDocument();
  });

  it('renders skeletons while loading', () => {
    strip({ actionMetrics: null, recentActivity: null, isLoading: true });
    expect(screen.getByTestId('live-status-loading')).toBeInTheDocument();
    expect(screen.queryByText('Live status unavailable')).not.toBeInTheDocument();
  });

  it('says All clear when every metric is zero', () => {
    strip({ actionMetrics: ZERO, now: MORNING });
    expect(screen.getByText('All clear')).toBeInTheDocument();
    expect(screen.queryByText('Pending verifications')).not.toBeInTheDocument();
    expect(screen.queryByText('Expiring security contacts')).not.toBeInTheDocument();
  });

  it('does not say All clear while anything needs attention', () => {
    strip({ now: MORNING });
    expect(screen.queryByText('All clear')).not.toBeInTheDocument();
    expect(screen.getByText('Pending verifications')).toBeInTheDocument();
    expect(screen.getByText('Expiring security contacts')).toBeInTheDocument();
  });

  it('navigates to existing routes on click', () => {
    strip({ now: MORNING });
    fireEvent.click(screen.getByText('3 payments to verify'));
    expect(push).toHaveBeenCalledWith('/approvals');
    fireEvent.click(screen.getByText('1 contact expiring soon'));
    expect(push).toHaveBeenCalledWith('/security/contacts');
    fireEvent.click(screen.getByText('2 residents awaiting review'));
    expect(push).toHaveBeenCalledWith('/residents');
  });

  // Mounting /dashboard needs auth + React Query; this fails if the strip's
  // wiring to the snapshot flags is dropped.
  it('is wired to the snapshot on the dashboard page', () => {
    const page = readFileSync(
      resolve(__dirname, '../../../app/(dashboard)/dashboard/page.tsx'),
      'utf-8'
    );
    expect(page).toContain('<LiveStatusStrip');
    expect(page).toContain('recentActivityUnavailable={snapshot?.recentActivityUnavailable ?? false}');
  });
});
