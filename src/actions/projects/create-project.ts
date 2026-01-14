'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { revalidatePath } from 'next/cache';

export async function createProject(formData: {
    name: string;
    description?: string;
    total_budget: number;
    status: 'planning' | 'active' | 'completed' | 'on_hold';
    start_date?: string;
    end_date?: string;
}) {
    const { authorized } = await authorizePermission(PERMISSIONS.PROJECTS_MANAGE);
    if (!authorized) throw new Error('Unauthorized');

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('projects')
        .insert([formData])
        .select()
        .single();

    if (error) {
        console.error('Error creating project:', error);
        throw new Error('Failed to create project');
    }

    revalidatePath('/projects');
    return data;
}
