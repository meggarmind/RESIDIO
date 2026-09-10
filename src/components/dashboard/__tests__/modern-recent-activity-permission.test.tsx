// @vitest-environment jsdom
//
// Issue #197: `audit_logs` carries an RLS SELECT policy reading
// `has_permission('settings.view_audit_logs')`, which six of the eight roles
// (chairman, financial_officer, project_manager, resident, secretary,
// security_officer) do not hold. The denial arrives as zero rows, so the
// dashboard's Recent Activity card rendered "No recent activity." -- a
// factually different, and false, statement.
//
// These tests pin the three visually distinct outcomes of
// `ModernRecentActivity` (mounted at src/app/(dashboard)/dashboard/page.tsx):
// permission-denied, genuinely-empty, and populated. They fail if the
// `isUnavailable` branch is removed, if it is ordered behind the null/loading
// skeleton guard, or if it starts leaking the audit-logs link.

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ModernRecentActivity } from '@/components/dashboard/modern-recent-activity';
import type { RecentActivityItem } from '@/actions/dashboard/get-enhanced-dashboard-stats';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

beforeAll(() => {
  // Radix's ScrollArea (used by the populated branch) observes its viewport.
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

afterEach(() => cleanup());

const ACTIVITY: RecentActivityItem[] = [
  {
    id: 'log-1',
    type: 'payment',
    action: 'Payment recorded',
    description: 'Payment of NGN 50,000 for House 12',
    timestamp: new Date().toISOString(),
  },
];

/** The empty-state copy the denied branch must NOT reuse. */
const EMPTY_COPY = /No recent activity/i;
/** The denied-state copy, matched loosely so wording tweaks don't break it. */
const DENIED_COPY = /isn.t available for your role/i;

describe('ModernRecentActivity permission state (#197)', () => {
  it('tells a role without audit-log access why the card is empty', () => {
    render(<ModernRecentActivity activities={[]} isLoading={false} isUnavailable />);

    expect(screen.getByText(DENIED_COPY)).toBeInTheDocument();
    // The misleading state must be gone, not merely accompanied.
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
  });

  it('does not offer an audit-logs link the viewer cannot open', () => {
    render(<ModernRecentActivity activities={[]} isLoading={false} isUnavailable />);

    expect(screen.queryByRole('link', { name: /view audit logs/i })).not.toBeInTheDocument();
  });

  it('resolves the permission state rather than leaving a skeleton up', () => {
    // `activities` is null on the very path that used to fall through to the
    // loading skeleton; a settled denial must still render its own state.
    const { container } = render(
      <ModernRecentActivity activities={null} isLoading={false} isUnavailable />
    );

    expect(screen.getByTestId('recent-activity-unavailable')).toBeInTheDocument();
    expect(container.querySelector('[data-testid="recent-activity-unavailable"]')).not.toBeNull();
  });

  it('still says "no recent activity" when the viewer may look and there is nothing', () => {
    render(<ModernRecentActivity activities={[]} isLoading={false} isUnavailable={false} />);

    expect(screen.getByText(EMPTY_COPY)).toBeInTheDocument();
    expect(screen.queryByText(DENIED_COPY)).not.toBeInTheDocument();
    expect(screen.queryByTestId('recent-activity-unavailable')).not.toBeInTheDocument();
  });

  it('renders the activity list unchanged for a permitted role', () => {
    render(<ModernRecentActivity activities={ACTIVITY} isLoading={false} />);

    expect(screen.getByText('Payment recorded')).toBeInTheDocument();
    expect(screen.getByText('Payment of NGN 50,000 for House 12')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /view audit logs/i })).toBeInTheDocument();
    expect(screen.queryByText(DENIED_COPY)).not.toBeInTheDocument();
  });

  it('keeps showing the skeleton while the snapshot is still loading', () => {
    render(<ModernRecentActivity activities={null} isLoading isUnavailable />);

    expect(screen.queryByText(DENIED_COPY)).not.toBeInTheDocument();
    expect(screen.queryByText(EMPTY_COPY)).not.toBeInTheDocument();
  });

  // Structural rather than behavioural: mounting /dashboard needs the auth
  // provider, React Query and the offline snapshot cache, which is an E2E's
  // job. This at least fails if the prop stops being wired through, which
  // would leave the whole fix inert while every test above still passed.
  it('is wired to the snapshot flag on the dashboard page', () => {
    const page = readFileSync(
      resolve(__dirname, '../../../app/(dashboard)/dashboard/page.tsx'),
      'utf-8'
    );

    expect(page).toContain('isUnavailable={snapshot?.recentActivityUnavailable ?? false}');
  });
});
