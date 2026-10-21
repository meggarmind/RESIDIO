import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({ createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient: mocks.createServerSupabaseClient }));

import { getOwnershipHistory } from '../get-ownership-history';

/** Records every chained call per table; each chain resolves to that table's rows. */
function buildClient(rows: Record<string, unknown[]>) {
  const calls: { table: string; method: string; args: unknown[] }[] = [];
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'range', 'limit']) {
      chain[method] = (...args: unknown[]) => {
        calls.push({ table, method, args });
        return chain;
      };
    }
    chain.then = (resolve: (v: unknown) => void) => resolve({ data: rows[table] ?? [], error: null });
    return chain;
  });
  return {
    calls,
    client: { auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) }, from },
  };
}

const HISTORY = [
  { id: 'h1', event_type: 'move_in', resident_id: 'r1', event_date: '2026-01-01' },
  { id: 'h2', event_type: 'house_added', resident_id: null, event_date: '2025-01-01' },
];

describe('getOwnershipHistory paging (#784)', () => {
  let built: ReturnType<typeof buildClient>;
  beforeEach(() => {
    built = buildClient({
      house_ownership_history: HISTORY,
      resident_houses: [{ resident_id: 'r1', move_out_date: '2026-06-01', is_active: false }],
    });
    mocks.createServerSupabaseClient.mockResolvedValue(built.client);
  });

  it('bounds the history query to one page, 100 rows by default', async () => {
    await getOwnershipHistory('house-1');
    const range = built.calls.find((c) => c.table === 'house_ownership_history' && c.method === 'range');
    expect(range?.args).toEqual([0, 99]);
  });

  it('honours limit and offset', async () => {
    await getOwnershipHistory('house-1', { limit: 20, offset: 40 });
    const range = built.calls.find((c) => c.table === 'house_ownership_history' && c.method === 'range');
    expect(range?.args).toEqual([40, 59]);
  });

  it('reads move-out dates only for residents on the page, and still computes end_date', async () => {
    const result = await getOwnershipHistory('house-1');
    const inCall = built.calls.find((c) => c.table === 'resident_houses' && c.method === 'in');
    expect(inCall?.args).toEqual(['resident_id', ['r1']]);
    expect(result.data?.[0].end_date).toBe('2026-06-01');
  });
});
