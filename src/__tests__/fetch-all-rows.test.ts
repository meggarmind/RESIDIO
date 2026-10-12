import { describe, expect, it, vi } from 'vitest';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';

/** Mock table that honours inclusive .range() bounds and an optional server-side row cap. */
function mockTable(total: number, serverCap = 1000) {
  const rows = Array.from({ length: total }, (_, i) => ({ id: i }));
  return vi.fn(async (from: number, to: number) => ({
    data: rows.slice(from, Math.min(to, from + serverCap - 1) + 1),
    error: null,
  }));
}

describe('fetchAllRows', () => {
  it.each([
    [0, 1],
    [999, 2],
    [1000, 2],
    [1001, 3],
    [2500, 4],
  ])('returns all %i rows across pages (%i requests)', async (total, requests) => {
    const page = mockTable(total);
    const result = await fetchAllRows(page);
    expect(result.error).toBeNull();
    expect(result.data).toHaveLength(total);
    expect(result.data?.map((r) => r.id)).toEqual(Array.from({ length: total }, (_, i) => i));
    expect(page).toHaveBeenCalledTimes(requests);
  });

  it('requests contiguous inclusive ranges', async () => {
    const page = mockTable(2500);
    await fetchAllRows(page);
    expect(page.mock.calls.map((c) => [c[0], c[1]])).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
      [2500, 3499],
    ]);
  });

  it('does not treat a short page as exhausted when the server cap is below the page size', async () => {
    const page = mockTable(1200, 500);
    const result = await fetchAllRows(page);
    expect(result.data).toHaveLength(1200);
  });

  it('fails instead of returning a partial result when a later page errors', async () => {
    const page = vi
      .fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 1000 }, (_, i) => ({ id: i })), error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    const result = await fetchAllRows(page);
    expect(result).toEqual({ data: null, error: 'boom' });
  });

  it('honours a custom page size', async () => {
    const page = mockTable(25);
    const result = await fetchAllRows(page, 10);
    expect(result.data).toHaveLength(25);
    expect(page.mock.calls[1]).toEqual([10, 19]);
  });
});
