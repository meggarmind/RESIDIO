import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDashboardActionMetrics } from '@/actions/dashboard/get-enhanced-dashboard-stats';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

function createQuery(result: { count: number | null; error: Error | null }) {
  const promise = Promise.resolve(result);
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    not: vi.fn(),
    gt: vi.fn(),
    lte: vi.fn(),
    then: promise.then.bind(promise),
  };

  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.not.mockReturnValue(query);
  query.gt.mockReturnValue(query);
  query.lte.mockResolvedValue(result);

  return query;
}

describe('dashboard action metrics', () => {
  beforeEach(() => {
    createServerSupabaseClient.mockReset();
  });

  it('returns populated real attention counts', async () => {
    const residentQuery = createQuery({ count: 2, error: null });
    const paymentQuery = createQuery({ count: 3, error: null });
    const securityQuery = createQuery({ count: 1, error: null });
    const from = vi.fn()
      .mockReturnValueOnce(residentQuery)
      .mockReturnValueOnce(paymentQuery)
      .mockReturnValueOnce(securityQuery);

    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin' } } }) },
      from,
    });

    const result = await getDashboardActionMetrics();

    expect(result).toEqual({
      data: {
        pendingResidentVerifications: 2,
        unverifiedPayments: 3,
        expiringSecurityContacts: 1,
        totalRequiringAttention: 6,
      },
      error: null,
    });
    expect(paymentQuery.eq).toHaveBeenCalledWith('is_verified', false);
    expect(paymentQuery.eq).toHaveBeenCalledWith('status', 'paid');
  });

  it('returns explicit zeros when no actions require attention', async () => {
    const from = vi.fn()
      .mockReturnValueOnce(createQuery({ count: 0, error: null }))
      .mockReturnValueOnce(createQuery({ count: 0, error: null }))
      .mockReturnValueOnce(createQuery({ count: 0, error: null }));

    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin' } } }) },
      from,
    });

    const result = await getDashboardActionMetrics();

    expect(result.data?.totalRequiringAttention).toBe(0);
    expect(result.error).toBeNull();
  });

  it('returns unavailable data when a count query fails', async () => {
    const from = vi.fn()
      .mockReturnValueOnce(createQuery({ count: null, error: new Error('count failed') }))
      .mockReturnValueOnce(createQuery({ count: 0, error: null }))
      .mockReturnValueOnce(createQuery({ count: 0, error: null }));

    createServerSupabaseClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin' } } }) },
      from,
    });

    const result = await getDashboardActionMetrics();

    expect(result).toEqual({ data: null, error: 'count failed' });
  });
});
