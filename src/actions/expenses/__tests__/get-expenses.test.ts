import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getExpenses } from '@/actions/expenses/get-expenses';

const { createServerSupabaseClient } = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createServerSupabaseClient }));

type Result = { data: unknown; error: { message: string } | null };

/**
 * Mirrors the two calls getExpenses issues (#785): one rpc('get_expense_page') that filters, pages,
 * counts and totals in SQL, then one joined select of just that page's ids.
 */
function mockSupabase(page: Result, rows: Result = { data: [], error: null }) {
  const rpc = vi.fn((_name: string, _args: Record<string, unknown>) => Promise.resolve(page));
  const inFilter = vi.fn((_col: string, _ids: string[]) => Promise.resolve(rows));
  const select = vi.fn((_columns: string) => ({ in: inFilter }));
  const from = vi.fn((_table: string) => ({ select }));
  createServerSupabaseClient.mockResolvedValue({ rpc, from });
  return { rpc, from, select, inFilter };
}

describe('getExpenses (#785)', () => {
  beforeEach(() => createServerSupabaseClient.mockReset());

  it('asks SQL for one page and passes the filters through', async () => {
    const { rpc } = mockSupabase({ data: { ids: [], count: 0, total: 0 }, error: null });

    await getExpenses({ status: 'pending', categoryId: 'cat-1', search: '  diesel ', page: 3, pageSize: 50 });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('get_expense_page', {
      p_status: 'pending',
      p_category_id: 'cat-1',
      p_search: 'diesel',
      p_limit: 50,
      p_offset: 100,
    });
  });

  it('defaults to the unfiltered first page of 20', async () => {
    const { rpc } = mockSupabase({ data: { ids: [], count: 0, total: 0 }, error: null });

    await getExpenses();

    expect(rpc).toHaveBeenCalledWith('get_expense_page', {
      p_status: null,
      p_category_id: null,
      p_search: null,
      p_limit: 20,
      p_offset: 0,
    });
  });

  it('escapes LIKE wildcards so a search for 100% matches literally', async () => {
    const { rpc } = mockSupabase({ data: { ids: [], count: 0, total: 0 }, error: null });

    await getExpenses({ search: '100%_x' });

    expect(rpc.mock.calls[0][1].p_search).toBe('100\\%\\_x');
  });

  it('returns the page rows in ledger order with the exact count and total across every match', async () => {
    const { from, select, inFilter } = mockSupabase(
      // numeric arrives from PostgREST as a string
      { data: { ids: ['c', 'a', 'b'], count: 1234, total: '9876543.50' }, error: null },
      { data: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], error: null }
    );

    const result = await getExpenses({ page: 2, pageSize: 3 });

    expect(from).toHaveBeenCalledWith('expenses');
    // The joined shape the ledger has always read.
    expect(select.mock.calls[0][0]).toContain('category:expense_categories(name)');
    expect(select.mock.calls[0][0]).toContain('staff:profiles!staff_id(full_name)');
    // Only this page is read, never the whole table.
    expect(inFilter).toHaveBeenCalledWith('id', ['c', 'a', 'b']);
    expect(result).toEqual({
      data: [{ id: 'c' }, { id: 'a' }, { id: 'b' }],
      count: 1234,
      total: 9876543.5,
      error: null,
    });
  });

  it('reads no rows for a count-only call or an empty page', async () => {
    const { from } = mockSupabase({ data: { ids: [], count: 7, total: 3500 }, error: null });

    const result = await getExpenses({ status: 'pending', pageSize: 0 });

    expect(from).not.toHaveBeenCalled();
    expect(result).toEqual({ data: [], count: 7, total: 3500, error: null });
  });

  it('reports a failed page read instead of throwing, so the page can still render', async () => {
    mockSupabase({ data: null, error: { message: 'function get_expense_page does not exist' } });

    await expect(getExpenses()).resolves.toEqual({
      data: [],
      count: 0,
      total: 0,
      error: 'Failed to fetch expenses',
    });
  });

  it('reports a failed row read instead of throwing', async () => {
    mockSupabase(
      { data: { ids: ['a'], count: 1, total: 10 }, error: null },
      { data: null, error: { message: 'boom' } }
    );

    await expect(getExpenses()).resolves.toMatchObject({ data: [], error: 'Failed to fetch expenses' });
  });
});
