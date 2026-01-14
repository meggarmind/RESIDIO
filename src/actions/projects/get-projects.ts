'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

export async function getProjects() {
    const { authorized } = await authorizePermission(PERMISSIONS.PROJECTS_VIEW);
    if (!authorized) throw new Error('Unauthorized');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching projects:', error);
        throw new Error('Failed to fetch projects');
    }

    return data;
}
