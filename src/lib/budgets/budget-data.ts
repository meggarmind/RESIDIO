/**
 * Budget and spend reads shared by the Budgets screen and the "Budget against actual" report (#1406).
 * No authorization here: callers check the permission first. Every read is paged (`fetchAllRows`,
 * ordered by id) so a total never stops at the API's 1,000-row cap.
 */

import type { ReportSupabaseClient } from '@/lib/reports/report-generator';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { toCents, fromCents, type BudgetRow } from '@/lib/budgets/budget-months';

/** Budget rows whose period overlaps `start`..`end` (inclusive 'YYYY-MM-DD' days). */
export async function fetchBudgetRows(
    client: ReportSupabaseClient,
    start: string,
    end: string,
    categoryIds?: readonly string[]
): Promise<BudgetRow[]> {
    const { data, error } = await fetchAllRows<BudgetRow>((from, to) => {
        let query = client
            .from('budgets')
            .select('id, category_id, amount, period_start, period_end')
            .lte('period_start', end)
            .gte('period_end', start);
        if (categoryIds) query = query.in('category_id', [...categoryIds]);
        return query.order('id').range(from, to);
    });
    if (error !== null) {
        console.error('Error fetching budgets:', error);
        throw new Error('Failed to load budgets');
    }
    return data;
}

/**
 * Actual spend per expense category (key null: no category) from `start` to `end`: expenses with
 * status 'paid' and an expense date in the period, the status and date rule of the Financial
 * Overview. Unlike that report it keeps expenses made from bank imports: the overview drops them
 * only because it also counts the bank rows they came from, and this report reads no bank rows.
 */
export async function fetchPaidSpendByCategory(
    client: ReportSupabaseClient,
    start: string,
    end: string
): Promise<Map<string | null, number>> {
    const { data, error } = await fetchAllRows<{ id: string; amount: number | string; category_id: string | null }>((from, to) =>
        client
            .from('expenses')
            .select('id, amount, category_id')
            .gte('expense_date', start)
            .lte('expense_date', end)
            .eq('status', 'paid')
            .order('id')
            .range(from, to)
    );
    if (error !== null) {
        console.error('Error fetching paid expenses for budgets:', error);
        throw new Error('Failed to load spend');
    }
    const cents = new Map<string | null, number>();
    for (const expense of data) {
        const key = expense.category_id ?? null;
        cents.set(key, (cents.get(key) ?? 0) + toCents(Number(expense.amount) || 0));
    }
    return new Map([...cents].map(([key, value]) => [key, fromCents(value)]));
}
