'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { sanitizeSearchInput } from '@/lib/utils';
import type { ExpenseStatus } from '@/types/database';

export interface GetExpensesParams {
    status?: ExpenseStatus;
    categoryId?: string;
    search?: string;
    page?: number;
    /** 0 returns only the count and total. */
    pageSize?: number;
}

const EXPENSE_SELECT = `
  *,
  category:expense_categories(name),
  vendor:vendors(name),
  resident:residents!resident_id(first_name, last_name),
  staff:profiles!staff_id(full_name)
`;

/**
 * One page of the expense ledger, plus the exact count and amount total of every expense matching
 * the filters (#785). Filtering, search and paging run in SQL (get_expense_page); the page's ids
 * are then read with the joined select the ledger has always used, so the row shape is unchanged.
 */
export async function getExpenses(params: GetExpensesParams = {}) {
    const supabase = await createServerSupabaseClient();
    const page = Math.max(1, Math.floor(params.page ?? 1));
    const pageSize = Math.max(0, Math.floor(params.pageSize ?? 20));
    const search = params.search?.trim();

    const { data: result, error: pageError } = await supabase.rpc('get_expense_page', {
        p_status: params.status ?? null,
        p_category_id: params.categoryId ?? null,
        p_search: search ? sanitizeSearchInput(search) : null,
        p_limit: pageSize,
        p_offset: (page - 1) * pageSize,
    });

    if (pageError || !result) {
        console.error('Error fetching expense page:', pageError);
        return { data: [], count: 0, total: 0, error: 'Failed to fetch expenses' };
    }

    const { ids, count, total } = result as { ids: string[]; count: number; total: number | string };
    if (ids.length === 0) return { data: [], count, total: Number(total), error: null };

    const { data, error } = await supabase.from('expenses').select(EXPENSE_SELECT).in('id', ids);

    if (error || !data) {
        console.error('Error fetching expenses:', error);
        return { data: [], count: 0, total: 0, error: 'Failed to fetch expenses' };
    }

    // .in() does not keep the ledger order; restore the order the page was cut in.
    const position = new Map(ids.map((id, i) => [id, i]));
    data.sort((a, b) => position.get(a.id)! - position.get(b.id)!);

    return { data, count, total: Number(total), error: null };
}
