'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { ExpenseCategory } from '@/types/database';

// ============================================================
// Response Types
// ============================================================

type GetExpenseCategoriesResponse = {
    data: ExpenseCategory[];
    error: string | null;
}

// ============================================================
// GET: Fetch All Expense Categories
// ============================================================

interface GetExpenseCategoriesParams {
    is_active?: boolean;
    include_inactive?: boolean;
}

export async function getExpenseCategories(
    params: GetExpenseCategoriesParams = {}
): Promise<ExpenseCategory[]> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
        .from('expense_categories')
        .select('*')
        .order('sort_order')
        .order('name');

    // Filter by active status (by default only show active)
    if (!params.include_inactive) {
        if (params.is_active !== undefined) {
            query = query.eq('is_active', params.is_active);
        } else {
            query = query.eq('is_active', true);
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching expense categories:', error);
        throw new Error('Failed to fetch expense categories');
    }

    return (data ?? []) as ExpenseCategory[];
}

// ============================================================
// GET: Fetch Single Expense Category
// ============================================================

export async function getExpenseCategory(id: string): Promise<ExpenseCategory | null> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('Error fetching expense category:', error);
        return null;
    }

    return data as ExpenseCategory;
}

// ============================================================
// Get Fallback (Miscellaneous) Category
// ============================================================

/**
 * Get the fallback "Bank Import - Miscellaneous" category for unmatched debit transactions.
 * Creates it if it doesn't exist.
 */
export async function getFallbackCategory(): Promise<ExpenseCategory | null> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('name', 'Bank Import - Miscellaneous')
        .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
        console.error('Error fetching fallback category:', error);
        return null;
    }

    return data as ExpenseCategory | null;
}
