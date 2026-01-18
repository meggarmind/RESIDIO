'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

/**
 * Fetches all projects.
 * Returns empty array if user lacks permission (used in dropdowns where projects are optional).
 */
export async function getProjects() {
    const { authorized } = await authorizePermission(PERMISSIONS.PROJECTS_VIEW);
    if (!authorized) {
        // Return empty array instead of throwing - used in expense form dropdown
        return [];
    }

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
