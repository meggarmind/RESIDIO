'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

export async function getProjectDetails(projectId: string) {
    const { authorized } = await authorizePermission(PERMISSIONS.PROJECTS_VIEW);
    if (!authorized) throw new Error('Unauthorized');

    const supabase = await createServerSupabaseClient();

    // Parallel fetch: Project basic info, Milestones, and Linked Expenses
    const [projectResult, milestonesResult, expensesResult] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase.from('project_milestones').select('*').eq('project_id', projectId).order('due_date', { ascending: true }),
        supabase.from('expenses').select('amount').eq('project_id', projectId)
    ]);

    if (projectResult.error) throw new Error('Project not found');

    const totalSpent = expensesResult.data?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) ?? 0;

    return {
        project: projectResult.data,
        milestones: milestonesResult.data || [],
        totalSpent,
        remainingBudget: (Number(projectResult.data.total_budget) || 0) - totalSpent,
        burnRate: projectResult.data.total_budget > 0
            ? Math.round((totalSpent / projectResult.data.total_budget) * 100)
            : 0
    };
}
