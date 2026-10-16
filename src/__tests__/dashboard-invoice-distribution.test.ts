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
 * Builds a fake client whose `rpc('get_dashboard_invoice_status_counts')` returns the raw counts
 * (the six numbers the SQL function emits). Any other rpc or table read fails the test: the
 * distribution must come from that single call.
 */
function mockStatusCountsRpc(counts: RawInvoiceCounts, error: { message: string } | null = null) {
  const rpc = vi.fn().mockImplementation((name: string) => {
    if (name !== 'get_dashboard_invoice_status_counts') {
      throw new Error(`Unexpected rpc: ${name}`);
    }
    if (error) return Promise.resolve({ data: null, error });
    return Promise.resolve({
      data: {
        unpaid: counts.unpaid,
        paid: counts.paid,
        partially_paid: counts.partiallyPaid,
        void: counts.void,
        overdue_unpaid: counts.overdueUnpaid,
        overdue_partially_paid: counts.overduePartiallyPaid,
      },
      error: null,
    });
  });
  const from = vi.fn().mockImplementation((table: string) => {
    throw new Error(`Unexpected table read: ${table}`);
  });

  createServerSupabaseClient.mockResolvedValue({
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) },
    rpc,
    from,
  });

  return { rpc, from };
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
    mockStatusCountsRpc(counts);

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
    mockStatusCountsRpc(counts);

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
    mockStatusCountsRpc(counts);

    const { data } = await getDashboardInvoiceDistribution();

    expect(sumBuckets(data!)).toBe(145); // 25 + 100 + 15 + 5
    expect(sumBuckets(data!)).toBe(trueTotal(counts));
  });

  it('issues exactly one RPC with the UTC date the old implementation used, and no table reads', async () => {
    const { rpc, from } = mockStatusCountsRpc({
      unpaid: 1, paid: 1, partiallyPaid: 1, void: 1, overdueUnpaid: 0, overduePartiallyPaid: 0,
    });

    await getDashboardInvoiceDistribution();

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_dashboard_invoice_status_counts', {
      p_today: new Date().toISOString().split('T')[0],
    });
    expect(from).not.toHaveBeenCalled();
  });

  it('surfaces an RPC error as the action error, never partial numbers', async () => {
    mockStatusCountsRpc(
      { unpaid: 1, paid: 1, partiallyPaid: 1, void: 1, overdueUnpaid: 0, overduePartiallyPaid: 0 },
      { message: 'permission denied for table invoices' }
    );

    const { data, error } = await getDashboardInvoiceDistribution();

    expect(data).toBeNull();
    // Postgrest errors are plain objects, so the action's catch falls back to its generic message (unchanged).
    expect(error).toBe('Failed to fetch invoice distribution');
  });
});
