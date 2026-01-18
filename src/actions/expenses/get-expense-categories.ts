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

type AutoMatchResult = {
    category: ExpenseCategory | null;
    matchedKeyword: string | null;
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
// Auto-Match Expense Category by Keywords
// ============================================================

/**
 * Automatically find a matching expense category based on transaction description keywords.
 * Performs case-insensitive matching against all active categories' keywords.
 *
 * @param description - The transaction description to match against
 * @returns The first matching category and the keyword that matched, or null if no match
 */
export async function autoMatchExpenseCategory(
    description: string
): Promise<AutoMatchResult> {
    const supabase = await createServerSupabaseClient();

    // Fetch active categories that have keywords
    const { data: categories, error } = await supabase
        .from('expense_categories')
        .select('*')
        .eq('is_active', true)
        .order('sort_order')
        .order('name');

    if (error || !categories) {
        console.error('Error fetching categories for auto-match:', error);
        return { category: null, matchedKeyword: null };
    }

    // Normalize description for case-insensitive matching
    const normalizedDescription = description.toLowerCase();

    // Check each category's keywords against the description
    for (const category of categories as ExpenseCategory[]) {
        if (!category.keywords || category.keywords.length === 0) continue;

        for (const keyword of category.keywords) {
            if (normalizedDescription.includes(keyword.toLowerCase())) {
                return { category, matchedKeyword: keyword };
            }
        }
    }

    return { category: null, matchedKeyword: null };
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
