'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getVendors(activeOnly = false) {
    const supabase = await createServerSupabaseClient();

    let query = supabase
        .from('vendors')
        .select('*')
        .order('name');

    if (activeOnly) {
        query = query.eq('is_active', true);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching vendors:', error);
        throw new Error('Failed to fetch vendors');
    }

    return data;
}
