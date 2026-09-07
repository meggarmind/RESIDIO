// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { ModernPendingPayments } from '@/components/dashboard/modern-pending-payments';
import type { InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => cleanup());

/**
 * `ModernPendingPayments` (mounted at `src/app/(dashboard)/dashboard/page.tsx`)
 * is the component actually rendered on /dashboard -- unlike
 * `InvoiceDistributionCard`, which is dead code (no import site outside its
 * own file). It renders counts as plain text rather than through
 * `AnimatedCounter`, so `@testing-library/react` assertions work directly
 * here, without needing to fall back to geometry inspection.
 *
 * These tests exercise `total = overdue + unpaid + partiallyPaid + voidCount
 * + paid` at modern-pending-payments.tsx:80, which is only correct because
 * `fetchInvoiceDistribution` now nets the overdue subset out of
 * unpaid/partiallyPaid before returning -- nothing previously tested that
 * line.
 */

const LIVE_SHAPE: InvoiceStatusDistribution = {
  paid: 570,
  unpaid: 0,
  partiallyPaid: 0,
  overdue: 19,
  void: 0,
};
const CORRECT_TOTAL = 589;
const OLD_BUGGY_TOTAL = 608;

describe('ModernPendingPayments (rendered)', () => {
  it('renders Paid 570 and Overdue 19 for the measured live shape', () => {
    render(<ModernPendingPayments distribution={LIVE_SHAPE} />);

    const paidRow = screen.getByText('Paid').closest('div');
    const overdueRow = screen.getByText('Overdue').closest('div');
    expect(paidRow).toHaveTextContent('570');
    expect(overdueRow).toHaveTextContent('19');
  });

  it('denominates segment widths against 589, not the old double-counted 608', () => {
    render(<ModernPendingPayments distribution={LIVE_SHAPE} />);

    // Tooltip content embeds the rounded percentage; the Paid segment's
    // hoverable trigger carries an inline width style computed against
    // `total`. Read it directly to avoid coupling to tooltip open state.
    const bar = screen.getByText('Paid').closest('.rounded-xl')!;
    const segments = bar.querySelectorAll<HTMLElement>('[style*="width"]');

    // Two non-zero buckets (paid, overdue) render a visible segment each.
    expect(segments).toHaveLength(2);

    const widths = Array.from(segments).map((el) => parseFloat(el.style.width));
    const expectedOverduePct = (19 / CORRECT_TOTAL) * 100;
    const expectedPaidPct = (570 / CORRECT_TOTAL) * 100;
    const buggyPaidPct = (570 / OLD_BUGGY_TOTAL) * 100;

    // StatusSegment render order in the bar is overdue, unpaid,
    // partiallyPaid, paid, void -- with the zero-value ones rendering null.
    expect(widths[0]).toBeCloseTo(expectedOverduePct, 1);
    expect(widths[1]).toBeCloseTo(expectedPaidPct, 1);
    expect(Math.abs(widths[1] - buggyPaidPct)).toBeGreaterThan(0.1);
  });

  it('the rendered segment percentages sum to 100% -- no wedge is a subset of another', () => {
    render(<ModernPendingPayments distribution={LIVE_SHAPE} />);

    const bar = screen.getByText('Paid').closest('.rounded-xl')!;
    const segments = bar.querySelectorAll<HTMLElement>('[style*="width"]');
    const widths = Array.from(segments).map((el) => parseFloat(el.style.width));
    const totalPct = widths.reduce((sum, w) => sum + w, 0);

    expect(totalPct).toBeCloseTo(100, 1);
  });

  it('does not render a total of 608 anywhere in the legend or tooltips', () => {
    render(<ModernPendingPayments distribution={LIVE_SHAPE} />);

    expect(screen.queryByText('608')).not.toBeInTheDocument();
  });
});
