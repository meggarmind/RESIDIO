import { describe, expect, it } from 'vitest';
import { expenseFiltersToQuery, parseExpenseFilters } from '@/components/expenditure/expense-filters';

const CATEGORY = '3f2c1f8e-9a1b-4c2d-8e3f-0a1b2c3d4e5f';

describe('expense ledger URL filters (#785)', () => {
  it('reads every filter from the URL', () => {
    expect(
      parseExpenseFilters({ status: 'pending', category: CATEGORY, q: ' diesel ', page: '3', size: '50' })
    ).toEqual({ status: 'pending', categoryId: CATEGORY, search: 'diesel', page: 3, pageSize: 50 });
  });

  it('falls back to the unfiltered first page for anything unrecognised', () => {
    expect(
      parseExpenseFilters({ status: 'overdue', category: 'not-a-uuid', q: '   ', page: '-2', size: '1000' })
    ).toEqual({ status: undefined, categoryId: undefined, search: undefined, page: 1, pageSize: 20 });
  });

  it('round-trips through the query string and leaves defaults out', () => {
    const filters = { status: 'paid' as const, categoryId: CATEGORY, search: 'a&b', page: 2, pageSize: 10 };
    const query = expenseFiltersToQuery(filters);

    expect(parseExpenseFilters(Object.fromEntries(new URLSearchParams(query)))).toEqual(filters);
    expect(expenseFiltersToQuery({ page: 1, pageSize: 20 })).toBe('');
  });
});
