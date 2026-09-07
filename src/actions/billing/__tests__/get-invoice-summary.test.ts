import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getInvoiceSummary } from '@/actions/billing/get-invoices';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const { authorizePermission, createServerSupabaseClient } = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

type QueryResult = { data?: unknown; count?: number | null; error?: { message: string } | null };

// Each call to `from('invoices')` returns a fresh chainable query mock so counting and the
// amount_due sum queries don't interfere with each other. Every query is thenable, mirroring
// how the real Supabase query builder resolves.
function createQuery(result: QueryResult) {
  const query: Record<string, unknown> = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    gte: vi.fn(),
    lte: vi.fn(),
    limit: vi.fn(),
    then: vi.fn((resolve: (value: QueryResult) => unknown) => resolve(result)),
  };

  for (const method of ['select', 'eq', 'or', 'gte', 'lte', 'limit'] as const) {
    (query[method] as ReturnType<typeof vi.fn>).mockReturnValue(query);
  }

  return query;
}

describe('getInvoiceSummary', () => {
  beforeEach(() => {
    authorizePermission.mockReset();
    createServerSupabaseClient.mockReset();
    authorizePermission.mockResolvedValue({ authorized: true, error: null });
  });

  it('rejects unauthorized reads before creating a data client', async () => {
    authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized: Missing permission' });

    await expect(getInvoiceSummary()).resolves.toEqual({
      data: null,
      error: 'Unauthorized: Missing permission',
    });

    expect(authorizePermission).toHaveBeenCalledWith(PERMISSIONS.BILLING_VIEW);
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it('maps each count query to its bucket and sums amount_due', async () => {
    // Six queries run in order: total, paid, unpaid, partiallyPaid, void, amount_due sum.
    const responses: QueryResult[] = [
      { count: 589, error: null }, // total
      { count: 570, error: null }, // paid
      { count: 19, error: null },  // unpaid
      { count: 0, error: null },   // partially_paid
      { count: 0, error: null },   // void
      { data: [{ amount_due: '1500000' }, { amount_due: 1785000 }], error: null }, // amount sum
    ];
    let call = 0;
    const from = vi.fn(() => createQuery(responses[call++]));
    createServerSupabaseClient.mockResolvedValue({ from });

    await expect(getInvoiceSummary()).resolves.toEqual({
      data: {
        totalCount: 589,
        paidCount: 570,
        unpaidCount: 19,
        partiallyPaidCount: 0,
        voidCount: 0,
        totalAmountDue: 3285000,
      },
      error: null,
    });
  });

  it('applies the status filter to every bucket query, not just its own', async () => {
    const queries: ReturnType<typeof createQuery>[] = [];
    const responses: QueryResult[] = [
      { count: 19, error: null },
      { count: 0, error: null },
      { count: 19, error: null },
      { count: 0, error: null },
      { count: 0, error: null },
      { data: [], error: null },
    ];
    let call = 0;
    const from = vi.fn(() => {
      const q = createQuery(responses[call++]);
      queries.push(q);
      return q;
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    await getInvoiceSummary({ status: 'unpaid' });

    // Every one of the six queries (five counts + the amount sum) must carry the caller's
    // status filter -- this is the assertion that fails if a bucket query is built without
    // running the shared filter helper first.
    for (const q of queries) {
      expect((q.eq as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['status', 'unpaid']);
    }
  });

  it('applies non-status filters (resident, house, search, period) to every query', async () => {
    const queries: ReturnType<typeof createQuery>[] = [];
    const responses: QueryResult[] = Array.from({ length: 5 }, () => ({ count: 0, error: null }));
    responses.push({ data: [], error: null });
    let call = 0;
    const from = vi.fn(() => {
      const q = createQuery(responses[call++]);
      queries.push(q);
      return q;
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    await getInvoiceSummary({
      residentId: 'resident-1',
      houseId: 'house-1',
      search: 'INV-001',
      periodFrom: '2026-01-01',
      periodTo: '2026-01-31',
    });

    for (const q of queries) {
      expect((q.eq as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['resident_id', 'resident-1']);
      expect((q.eq as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['house_id', 'house-1']);
      expect((q.or as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['invoice_number.ilike.%INV-001%']);
      expect((q.gte as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['period_start', '2026-01-01']);
      expect((q.lte as ReturnType<typeof vi.fn>).mock.calls).toContainEqual(['period_start', '2026-01-31']);
    }
  });

  it('caps the amount_due sum read with a bounded limit', async () => {
    const responses: QueryResult[] = Array.from({ length: 5 }, () => ({ count: 0, error: null }));
    responses.push({ data: [], error: null });
    let call = 0;
    const amountQuery = { current: null as ReturnType<typeof createQuery> | null };
    const from = vi.fn(() => {
      const q = createQuery(responses[call]);
      if (call === 5) amountQuery.current = q;
      call++;
      return q;
    });
    createServerSupabaseClient.mockResolvedValue({ from });

    await getInvoiceSummary();

    expect(amountQuery.current?.limit).toHaveBeenCalledWith(expect.any(Number));
  });

  it('propagates an error from any of the underlying queries', async () => {
    const responses: QueryResult[] = [
      { count: 589, error: null },
      { count: 570, error: null },
      { count: 19, error: null },
      { count: 0, error: null },
      { count: 0, error: { message: 'boom' } },
      { data: [], error: null },
    ];
    let call = 0;
    const from = vi.fn(() => createQuery(responses[call++]));
    createServerSupabaseClient.mockResolvedValue({ from });

    await expect(getInvoiceSummary()).resolves.toEqual({ data: null, error: 'boom' });
  });
});
