'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getExpenseCategories() {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('expense_categories')
        .select('*')
        .order('name');

    if (error) {
        console.error('Error fetching expense categories:', error);
        throw new Error('Failed to fetch expense categories');
    }

    return data;
}
