'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export interface GetExpensesFilters {
    startDate?: string;
    endDate?: string;
    categoryId?: string;
    vendorId?: string;
    status?: 'pending' | 'paid' | 'cancelled';
}

export async function getExpenses(filters: GetExpensesFilters = {}) {
    const supabase = await createServerSupabaseClient();

    let query = supabase
        .from('expenses')
        .select(`
      *,
      category:expense_categories(name),
      vendor:vendors(name)
    `)
        .order('expense_date', { ascending: false });

    if (filters.startDate) {
        query = query.gte('expense_date', filters.startDate);
    }
    if (filters.endDate) {
        query = query.lte('expense_date', filters.endDate);
    }
    if (filters.categoryId) {
        query = query.eq('category_id', filters.categoryId);
    }
    if (filters.vendorId) {
        query = query.eq('vendor_id', filters.vendorId);
    }
    if (filters.status) {
        query = query.eq('status', filters.status);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching expenses:', error);
        throw new Error('Failed to fetch expenses');
    }

    return data;
}
