'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';

export async function getStaff() {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role_id, app_roles!profiles_role_id_fkey!inner(name)')
        .in('app_roles.name', ['super_admin', 'chairman'])
        .order('full_name');

    if (error) {
        console.error('Error fetching staff:', error);
        throw new Error('Failed to fetch staff');
    }

    // Explicit columns (not '*'): profiles.two_factor_secret_encrypted is not readable
    // by the API roles (#455). `role` is what StaffOption and the expense dialog expect.
    return (data ?? []).map((s) => {
        const roles = s.app_roles as { name: string } | { name: string }[] | null;
        const role = (Array.isArray(roles) ? roles[0]?.name : roles?.name) ?? '';
        return { ...s, role };
    });
}
