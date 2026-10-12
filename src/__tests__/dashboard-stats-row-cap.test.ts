import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardStats } from '@/actions/dashboard/get-dashboard-stats';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

const SERVER_CAP = 1000;
const PAYMENT_ROWS = 2500;

/** Chainable query whose .range() honours the PostgREST row cap; unranged reads are capped too. */
function makeQuery(table: string) {
  let range: [number, number] | null = null;
  const query: Record<string, unknown> = {};
  const chain = () => query;
  for (const m of ['select', 'eq', 'neq', 'gte', 'lte', 'lt', 'gt', 'in', 'or', 'order', 'limit']) {
    query[m] = vi.fn(chain);
  }
  query.range = vi.fn((from: number, to: number) => {
    range = [from, to];
    return query;
  });
  query.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
    let result: { data: unknown[]; count: number; error: null };
    if (table === 'payment_records') {
      const [from, to] = range ?? [0, SERVER_CAP - 1];
      const end = Math.min(to, from + SERVER_CAP - 1, PAYMENT_ROWS - 1);
      const data = Array.from({ length: Math.max(0, end - from + 1) }, () => ({ amount: 10 }));
      result = { data, count: PAYMENT_ROWS, error: null };
    } else {
      result = { data: [], count: 0, error: null };
    }
    return Promise.resolve(result).then(resolve, reject);
  };
  return query;
}

describe('getDashboardStats money totals beyond the PostgREST row cap (#459)', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockResolvedValue({ from: (table: string) => makeQuery(table) });
  });

  it('counts and sums every payment, not just the first 1000', async () => {
    const { data, error } = await getDashboardStats();
    expect(error).toBeNull();
    expect(data?.paymentsThisMonth).toBe(PAYMENT_ROWS);
    expect(data?.paymentsThisMonthAmount).toBe(PAYMENT_ROWS * 10);
    expect(data?.unverifiedPaymentsCount).toBe(PAYMENT_ROWS);
    expect(data?.unverifiedPaymentsAmount).toBe(PAYMENT_ROWS * 10);
  });
});
