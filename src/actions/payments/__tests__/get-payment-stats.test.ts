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

/**
 * Mirrors the real query shape getPaymentStats issues:
 *  - five parallel `select('*', { count: 'exact', head: true })` calls (one bare,
 *    four filtered by `.eq('status', <status>)`) for the counts, and
 *  - one `rpc('sum_paid_payments')` for the paid total (#776), never a row download.
 */
function mockPaymentRecords(
  counts: Counts,
  sumResult: { data: unknown; error: { message: string } | null } = { data: 0, error: null },
  countError: { message: string } | null = null
) {
  const rpcCalls: string[] = [];
  const rowSelects: string[] = [];

  const from = vi.fn(() => ({
    select: vi.fn((columns: string, opts?: { count?: string; head?: boolean }) => {
      if (!(opts?.count === 'exact' && opts?.head === true)) rowSelects.push(columns);
      return {
        eq: vi.fn((_col: string, status: keyof Omit<Counts, 'total'>) => ({
          then: (resolve: (v: unknown) => void) =>
            resolve(countError ? { count: null, error: countError } : { count: counts[status], error: null }),
        })),
        then: (resolve: (v: unknown) => void) =>
          resolve(countError ? { count: null, error: countError } : { count: counts.total, error: null }),
      };
    }),
  }));

  const rpc = vi.fn((name: string) => {
    rpcCalls.push(name);
    return Promise.resolve(sumResult);
  });

  createServerSupabaseClient.mockResolvedValue({ from, rpc });

  return { from, rpcCalls, rowSelects };
}

describe('getPaymentStats', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it('counts every paid row as completed when nothing is pending (issue #114 regression)', async () => {
    mockPaymentRecords({ total: 2259, paid: 2259, pending: 0, overdue: 0, failed: 0 }, { data: 225900, error: null });

    const { stats, error } = await getPaymentStats();

    expect(error).toBeNull();
    expect(stats?.paid_count).toBe(2259);
    expect(stats?.pending_count).toBe(0);
    expect(stats?.total_count).toBe(2259);
  });

  it('takes total_collected from one server-side sum, above the 1000-row cap, with no row download (#252, #776)', async () => {
    const { rpcCalls, rowSelects } = mockPaymentRecords(
      { total: 2259, paid: 2259, pending: 0, overdue: 0, failed: 0 },
      // numeric arrives from PostgREST as a string
      { data: '39436963.00', error: null }
    );

    const { stats, error } = await getPaymentStats();

    expect(error).toBeNull();
    expect(stats?.total_collected).toBe(39436963);
    expect(rpcCalls).toEqual(['sum_paid_payments']);
    expect(rowSelects).toEqual([]);
  });

  it('propagates a sum error instead of returning a partial total', async () => {
    mockPaymentRecords(
      { total: 1259, paid: 1259, pending: 0, overdue: 0, failed: 0 },
      { data: null, error: { message: 'boom on sum' } }
    );

    const { stats, error } = await getPaymentStats();

    expect(stats).toBeNull();
    expect(error).toBe('boom on sum');
  });

  it('reports zero collected for an empty table', async () => {
    mockPaymentRecords({ total: 0, paid: 0, pending: 0, overdue: 0, failed: 0 }, { data: 0, error: null });

    const { stats } = await getPaymentStats();

    expect(stats).toEqual({
      total_collected: 0,
      total_count: 0,
      paid_count: 0,
      pending_count: 0,
      overdue_count: 0,
      failed_count: 0,
    });
  });

  it('keeps the per-status counts alongside the sum', async () => {
    mockPaymentRecords({ total: 4, paid: 2, pending: 1, overdue: 0, failed: 1 }, { data: 750, error: null });

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
    mockPaymentRecords({ total: 2, paid: 1, pending: 0, overdue: 1, failed: 0 }, { data: 100, error: null });

    const { stats } = await getPaymentStats();

    expect(stats?.overdue_count).toBe(1);
    expect(stats?.paid_count).toBe(1);
  });

  it('propagates a count-query error without computing stats', async () => {
    mockPaymentRecords({ total: 0, paid: 0, pending: 0, overdue: 0, failed: 0 }, { data: 0, error: null }, { message: 'boom' });

    const { stats, error } = await getPaymentStats();

    expect(stats).toBeNull();
    expect(error).toBe('boom');
  });
});
