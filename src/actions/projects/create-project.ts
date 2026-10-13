'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

// New schema, so strict: an unknown key (e.g. current_progress, id, created_at)
// is rejected rather than inserted.
const createProjectSchema = z.object({
    name: z.string().min(1, 'Project name is required'),
    description: z.string().optional(),
    total_budget: z.number().min(0),
    status: z.enum(['planning', 'active', 'completed', 'on_hold']),
    start_date: z.string().optional(),
    end_date: z.string().optional(),
}).strict();

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

    const parsed = createProjectSchema.safeParse(formData);
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0]?.message || 'Invalid project data');
    }
    const input = parsed.data;

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
        .from('projects')
        .insert([{
            name: input.name,
            description: input.description,
            total_budget: input.total_budget,
            status: input.status,
            start_date: input.start_date,
            end_date: input.end_date,
        }])
        .select()
        .single();

    if (error) {
        console.error('Error creating project:', error);
        throw new Error('Failed to create project');
    }

    await logAudit({
        action: 'CREATE',
        entityType: 'projects',
        entityId: data.id,
        entityDisplay: `Project: ${input.name}`,
        newValues: input as Record<string, unknown>,
    });

    revalidatePath('/projects');
    return data;
}
