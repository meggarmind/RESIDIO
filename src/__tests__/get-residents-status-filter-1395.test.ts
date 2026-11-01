import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Issue #1395: the residents list hides archived residents by default.
 * 'not_archived' maps to neq; real statuses still use eq; no status adds no filter.
 */

const calls = vi.hoisted(() => ({ eq: vi.fn(), neq: vi.fn() }));

vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: vi.fn(async () => ({ authorized: true })),
  authorizeAnyPermission: vi.fn(async () => ({ authorized: true })),
}));

vi.mock('@/lib/supabase/server', () => {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'or', 'in', 'is', 'not', 'range', 'order']) chain[m] = () => chain;
  chain.eq = (...a: unknown[]) => { calls.eq(...a); return chain; };
  chain.neq = (...a: unknown[]) => { calls.neq(...a); return chain; };
  chain.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null, count: 0 });
  return {
    createServerSupabaseClient: async () => ({ from: () => chain }),
    createAdminClient: () => ({}),
  };
});

import { getResidents } from '@/actions/residents/get-residents';

beforeEach(() => {
  calls.eq.mockClear();
  calls.neq.mockClear();
});

describe('getResidents status filter', () => {
  it('excludes archived with neq for not_archived', async () => {
    await getResidents({ status: 'not_archived' });
    expect(calls.neq).toHaveBeenCalledWith('account_status', 'archived');
    expect(calls.eq).not.toHaveBeenCalledWith('account_status', expect.anything());
  });

  it('adds no status filter when status is omitted (All Status)', async () => {
    await getResidents({});
    expect(calls.neq).not.toHaveBeenCalled();
    expect(calls.eq).not.toHaveBeenCalledWith('account_status', expect.anything());
  });

  it('still uses eq for archived', async () => {
    await getResidents({ status: 'archived' });
    expect(calls.eq).toHaveBeenCalledWith('account_status', 'archived');
    expect(calls.neq).not.toHaveBeenCalled();
  });
});
