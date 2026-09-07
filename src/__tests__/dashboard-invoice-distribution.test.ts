import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardInvoiceDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';
import type { InvoiceStatusDistribution } from '@/actions/dashboard/get-enhanced-dashboard-stats';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

/**
 * Raw per-status invoice counts as they exist in the `invoices` table,
 * mirroring the live-DB numbers measured for issue #110 (589 total: 570
 * paid, 19 unpaid, 0 partially_paid, 0 void), plus a synthetic overdue
 * split so the "overdue spans two statuses" path is also exercised.
 */
interface RawInvoiceCounts {
  unpaid: number;
  paid: number;
  partiallyPaid: number;
  void: number;
  overdueUnpaid: number;
  overduePartiallyPaid: number;
}

/**
 * Builds a fake `supabase.from('invoices')` chain whose count depends on
 * which `.eq('status', ...)` / `.lt('due_date', ...)` filters were applied,
 * matching the exact query shapes fetchInvoiceDistribution issues.
 */
function mockInvoicesTable(counts: RawInvoiceCounts) {
  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table !== 'invoices') {
      throw new Error(`Unexpected table: ${table}`);
    }

    let status: string | undefined;
    let hasDueDateFilter = false;

    const chain = {
      select: vi.fn().mockImplementation(() => chain),
      eq: vi.fn().mockImplementation((column: string, value: string) => {
        if (column === 'status') status = value;
        return chain;
      }),
      lt: vi.fn().mockImplementation((column: string) => {
        if (column === 'due_date') hasDueDateFilter = true;
        return chain;
      }),
      then: (resolve: (value: { count: number; error: null }) => unknown) => {
        let count = 0;
        if (status === 'unpaid' && !hasDueDateFilter) count = counts.unpaid;
        else if (status === 'paid') count = counts.paid;
        else if (status === 'partially_paid' && !hasDueDateFilter) count = counts.partiallyPaid;
        else if (status === 'void') count = counts.void;
        else if (status === 'unpaid' && hasDueDateFilter) count = counts.overdueUnpaid;
        else if (status === 'partially_paid' && hasDueDateFilter) count = counts.overduePartiallyPaid;
        return Promise.resolve(resolve({ count, error: null }));
      },
    };

    return chain;
  });

  createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    from: mockFrom,
  });

  return mockFrom;
}

function trueTotal(counts: RawInvoiceCounts): number {
  return counts.unpaid + counts.paid + counts.partiallyPaid + counts.void;
}

function sumBuckets(distribution: InvoiceStatusDistribution): number {
  return distribution.unpaid + distribution.paid + distribution.partiallyPaid + distribution.overdue + distribution.void;
}

describe('fetchInvoiceDistribution (via getDashboardInvoiceDistribution)', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it("today's live-DB shape: every unpaid invoice is also overdue, none are partially paid", async () => {
    const counts: RawInvoiceCounts = {
      unpaid: 19,
      paid: 570,
      partiallyPaid: 0,
      void: 0,
      overdueUnpaid: 19,
      overduePartiallyPaid: 0,
    };
    mockInvoicesTable(counts);

    const { data, error } = await getDashboardInvoiceDistribution();

    expect(error).toBeNull();
    expect(data).toEqual({
      unpaid: 0, // netted: all 19 unpaid invoices are also overdue
      paid: 570,
      partiallyPaid: 0,
      overdue: 19,
      void: 0,
    });
    expect(sumBuckets(data!)).toBe(trueTotal(counts));
    expect(sumBuckets(data!)).toBe(589);
  });

  it('nets the overdue subset out of unpaid AND partially_paid independently', async () => {
    // A mixed scenario: overdue spans both statuses, and each status also
    // has invoices that are NOT overdue, so no single-bucket subtraction
    // could produce the right answer.
    const counts: RawInvoiceCounts = {
      unpaid: 10, // 4 of these are overdue, 6 are not
      paid: 50,
      partiallyPaid: 8, // 3 of these are overdue, 5 are not
      void: 2,
      overdueUnpaid: 4,
      overduePartiallyPaid: 3,
    };
    mockInvoicesTable(counts);

    const { data, error } = await getDashboardInvoiceDistribution();

    expect(error).toBeNull();
    expect(data).toEqual({
      unpaid: 6, // 10 - 4
      paid: 50,
      partiallyPaid: 5, // 8 - 3
      overdue: 7, // 4 + 3
      void: 2,
    });
    expect(sumBuckets(data!)).toBe(trueTotal(counts));
  });

  it('buckets always sum to the true invoice total (no double counting)', async () => {
    const counts: RawInvoiceCounts = {
      unpaid: 25,
      paid: 100,
      partiallyPaid: 15,
      void: 5,
      overdueUnpaid: 12,
      overduePartiallyPaid: 6,
    };
    mockInvoicesTable(counts);

    const { data } = await getDashboardInvoiceDistribution();

    expect(sumBuckets(data!)).toBe(145); // 25 + 100 + 15 + 5
    expect(sumBuckets(data!)).toBe(trueTotal(counts));
  });
});
