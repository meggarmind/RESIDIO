'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getStaff() {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('*, app_roles!inner(name)')
        .in('app_roles.name', ['super_admin', 'chairman'])
        .order('full_name');

    if (error) {
        console.error('Error fetching staff:', error);
        throw new Error('Failed to fetch staff');
    }

    return data;
}
