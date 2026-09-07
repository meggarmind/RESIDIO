import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getPaymentStats } from '@/actions/payments/get-payment-stats';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

type Counts = {
  total: number;
  paid: number;
  pending: number;
  overdue: number;
  failed: number;
};

type PagedRow = { amount: number };

/**
 * Mirrors the real query shape getPaymentStats now issues:
 *  - five parallel `select('*', { count: 'exact', head: true })` calls (one bare,
 *    four filtered by `.eq('status', <status>)`) for the counts, and
 *  - a paged `select('amount').eq('status', 'paid').range(from, to)` loop for the sum.
 *
 * `paidPages` supplies one array of rows per expected `.range()` call, in order.
 * A page entry may instead be `{ error }` to simulate a failure on that page.
 */
function mockPaymentRecords(
  counts: Counts,
  paidPages: Array<PagedRow[] | { error: { message: string } }> = [[]],
  countError: { message: string } | null = null
) {
  const rangeCalls: Array<[number, number]> = [];
  let pageIndex = 0;

  const from = vi.fn(() => ({
    select: vi.fn((_columns: string, opts?: { count?: string; head?: boolean }) => {
      if (opts?.count === 'exact' && opts?.head === true) {
        const countBuilder = {
          eq: vi.fn((_col: string, status: keyof Omit<Counts, 'total'>) => ({
            then: (resolve: (v: unknown) => void) =>
              resolve(countError ? { count: null, error: countError } : { count: counts[status], error: null }),
          })),
          then: (resolve: (v: unknown) => void) =>
            resolve(countError ? { count: null, error: countError } : { count: counts.total, error: null }),
        };
        return countBuilder;
      }

      // Paged amount query
      const pagingBuilder = {
        eq: vi.fn(() => pagingBuilder),
        range: vi.fn((from: number, to: number) => {
          rangeCalls.push([from, to]);
          const page = paidPages[pageIndex] ?? [];
          pageIndex += 1;

          if (!Array.isArray(page)) {
            return { then: (resolve: (v: unknown) => void) => resolve({ data: null, error: page.error }) };
          }

          return { then: (resolve: (v: unknown) => void) => resolve({ data: page, error: null }) };
        }),
      };
      return pagingBuilder;
    }),
  }));

  createServerSupabaseClient.mockResolvedValue({ from });

  return { from, rangeCalls };
}

describe('getPaymentStats', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it('counts every paid row as completed when nothing is pending (issue #114 regression)', async () => {
    // This is the exact case the original bug got wrong: the "Completed" card
    // used to hardcode '0' whenever stats.pending_count was 0, even though the
    // dataset held nothing but paid rows (today's live data: 2259 paid, 0 pending).
    mockPaymentRecords(
      { total: 2259, paid: 2259, pending: 0, overdue: 0, failed: 0 },
      [Array.from({ length: 1000 }, () => ({ amount: 100 })), Array.from({ length: 1000 }, () => ({ amount: 100 })), Array.from({ length: 259 }, () => ({ amount: 100 }))]
    );

    const { stats, error } = await getPaymentStats();

    expect(error).toBeNull();
    expect(stats?.paid_count).toBe(2259);
    expect(stats?.pending_count).toBe(0);
    expect(stats?.total_count).toBe(2259);
  });

  it('sums total_collected from paid rows only, across a dataset larger than one PostgREST page', async () => {
    // Guards against the row-cap regression (issue #252): a bare .select() truncates
    // at 1000 rows, so both paid_count and total_collected went wrong on real data
    // (2259 rows). This asserts the full sum survives paging across 3 pages.
    const paidRows = Array.from({ length: 2259 }, () => ({ amount: 17462.14159 }));
    const expectedSum = paidRows.reduce((sum, r) => sum + r.amount, 0);

    mockPaymentRecords(
      { total: 2259, paid: 2259, pending: 0, overdue: 0, failed: 0 },
      [paidRows.slice(0, 1000), paidRows.slice(1000, 2000), paidRows.slice(2000, 2259)]
    );

    const { stats, error } = await getPaymentStats();

    expect(error).toBeNull();
    expect(stats?.paid_count).toBe(2259);
    expect(stats?.total_collected).toBeCloseTo(expectedSum, 5);
  });

  it('stops paging once a short page is returned, issuing no extra request', async () => {
    const { rangeCalls } = mockPaymentRecords(
      { total: 4, paid: 4, pending: 0, overdue: 0, failed: 0 },
      [[{ amount: 500 }, { amount: 250 }]]
    );

    const { stats, error } = await getPaymentStats();

    expect(error).toBeNull();
    expect(stats?.total_collected).toBe(750);
    // Exactly one range() call: the first page came back short (< PAGE_SIZE), so
    // the loop must not issue a second request looking for more data.
    expect(rangeCalls).toHaveLength(1);
  });

  it('propagates an error from a later page instead of returning a partial sum', async () => {
    mockPaymentRecords(
      { total: 1259, paid: 1259, pending: 0, overdue: 0, failed: 0 },
      [Array.from({ length: 1000 }, () => ({ amount: 100 })), { error: { message: 'boom on page 2' } }]
    );

    const { stats, error } = await getPaymentStats();

    expect(stats).toBeNull();
    expect(error).toBe('boom on page 2');
  });

  it('sums total_collected from paid rows only', async () => {
    mockPaymentRecords(
      { total: 4, paid: 2, pending: 1, overdue: 0, failed: 1 },
      [[{ amount: 500 }, { amount: 250 }]]
    );

    const { stats } = await getPaymentStats();

    expect(stats?.total_collected).toBe(750);
    expect(stats?.paid_count).toBe(2);
    expect(stats?.pending_count).toBe(1);
    expect(stats?.failed_count).toBe(1);
    expect(stats?.total_count).toBe(4);
  });

  it('counts overdue rows separately, since payment_status is a real, DB-admitted value', async () => {
    // Verified live against the Supabase payment_status enum (pg_enum):
    // {pending, paid, overdue, failed} -- all four are storable by the column.
    // No row happens to carry 'overdue' today, but the status is reachable
    // (payment-form.tsx exposes it, payment-table.tsx bulk-updates to it), so
    // counting it here is correct, not dead code counting an impossible value.
    mockPaymentRecords(
      { total: 2, paid: 1, pending: 0, overdue: 1, failed: 0 },
      [[{ amount: 100 }]]
    );

    const { stats } = await getPaymentStats();

    expect(stats?.overdue_count).toBe(1);
    expect(stats?.paid_count).toBe(1);
  });

  it('propagates a count-query error without computing stats', async () => {
    mockPaymentRecords(
      { total: 0, paid: 0, pending: 0, overdue: 0, failed: 0 },
      [[]],
      { message: 'boom' }
    );

    const { stats, error } = await getPaymentStats();

    expect(stats).toBeNull();
    expect(error).toBe('boom');
  });
});
