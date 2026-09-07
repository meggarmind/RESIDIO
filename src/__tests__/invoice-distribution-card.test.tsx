import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { InvoiceDistributionCard } from '@/components/dashboard/invoice-distribution-card';
import type { InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

/**
 * `InvoiceDistributionCard` renders its counts through `AnimatedCounter`,
 * which emits a static `0` in server-rendered markup (the real number only
 * appears once client JS runs the counting animation). A prior version of
 * this file asserted `markup.toContain('589')` and `.toContain('68')` --
 * those passed/failed for a spurious reason: the SVG's circumference
 * constant `2 * Math.PI * 50 === 314.1592653589793` happens to contain the
 * substring "589", so the first assertion was a false positive that could
 * never fail for the reason it claimed, and the second failed for the same
 * underlying reason (the counter renders 0, not 68).
 *
 * The one number that *is* observable in static markup is the donut
 * geometry itself: each wedge is an SVG `<circle>` whose `stroke-dasharray`
 * is `circumference * (value / total)`. Asserting on that geometry lets the
 * test actually fail when the denominator is wrong (e.g. reverting to the
 * old double-counted total that also summed the `overdue` subset back into
 * `unpaid`/`partiallyPaid`).
 */

const RADIUS = 50;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // 314.159...
const TOLERANCE = 0.01;

/** Extracts the `stroke-dasharray` numerator of every rendered wedge circle, in DOM order. */
function extractDasharrayValues(markup: string): number[] {
  const matches = [...markup.matchAll(/stroke-dasharray="([\d.]+) [\d.]+"/g)];
  return matches.map((m) => Number(m[1]));
}

describe('InvoiceDistributionCard donut geometry', () => {
  it("today's live-DB shape (already netted): wedges are denominated against 589, not the old double-counted 608", () => {
    // Measured live data (589 total invoices): every unpaid invoice is also
    // overdue, so a correct partition nets unpaid/partiallyPaid to 0.
    const distribution: InvoiceStatusDistribution = {
      unpaid: 0,
      paid: 570,
      partiallyPaid: 0,
      overdue: 19,
      void: 0,
    };
    const CORRECT_TOTAL = 589;
    const OLD_BUGGY_TOTAL = 608; // paid(570) + unpaid(19) + overdue(19) -- double-counts the 19 overdue

    const markup = renderToStaticMarkup(<InvoiceDistributionCard distribution={distribution} />);
    const dasharrays = extractDasharrayValues(markup);

    // Only `paid` and `overdue` are non-zero, so exactly two wedge circles
    // are rendered (statusConfig order: paid, partiallyPaid, unpaid, overdue
    // -- zero-value entries are filtered out).
    expect(dasharrays).toHaveLength(2);

    const [paidDasharray, overdueDasharray] = dasharrays;
    const expectedPaidDasharray = CIRCUMFERENCE * (570 / CORRECT_TOTAL);
    const expectedOverdueDasharray = CIRCUMFERENCE * (19 / CORRECT_TOTAL);
    const buggyPaidDasharray = CIRCUMFERENCE * (570 / OLD_BUGGY_TOTAL);

    expect(paidDasharray).toBeCloseTo(expectedPaidDasharray, 2);
    expect(overdueDasharray).toBeCloseTo(expectedOverdueDasharray, 2);
    // Guards against the regression directly: if the denominator were the
    // old double-counted 608, the paid wedge's dasharray would be smaller
    // than the correct value by more than floating-point noise.
    expect(Math.abs(paidDasharray - buggyPaidDasharray)).toBeGreaterThan(TOLERANCE);
  });

  it('no invoice is represented in two wedges: wedge dasharrays sum to the full circumference', () => {
    const distribution: InvoiceStatusDistribution = {
      unpaid: 6,
      paid: 50,
      partiallyPaid: 5,
      overdue: 7,
      void: 2,
    };
    // Charted total excludes `void` (it is not drawn as a ring segment):
    // 6 + 50 + 5 + 7 = 68.
    const CHARTED_TOTAL = 68;

    const markup = renderToStaticMarkup(<InvoiceDistributionCard distribution={distribution} />);
    const dasharrays = extractDasharrayValues(markup);

    // All four non-void buckets are non-zero, so four wedges are rendered.
    expect(dasharrays).toHaveLength(4);

    const sumOfDasharrays = dasharrays.reduce((sum, value) => sum + value, 0);
    // If every wedge's percentage is computed against the same total and
    // that total is the true (non-void) sum, the wedges tile the full ring
    // exactly once -- no invoice counted into two wedges, none left out.
    expect(sumOfDasharrays).toBeCloseTo(CIRCUMFERENCE, 2);
    expect(CHARTED_TOTAL).toBe(68);
  });
});
