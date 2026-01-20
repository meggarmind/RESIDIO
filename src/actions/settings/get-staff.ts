'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getStaff() {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .in('role', ['admin', 'chairman'])
        .order('full_name');

    if (error) {
        console.error('Error fetching staff:', error);
        throw new Error('Failed to fetch staff');
    }

    return data;
}
