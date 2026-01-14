'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export interface CreateExpenseInput {
    amount: number;
    category_id: string;
    expense_date: string;
    description?: string;
    vendor_id?: string;
    project_id?: string;
    status?: 'pending' | 'paid' | 'cancelled';
}

export async function createExpense(input: CreateExpenseInput) {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error('Unauthorized');

    const { data, error } = await supabase
        .from('expenses')
        .insert([{
            ...input,
            created_by: user.id
        }])
        .select()
        .single();

    if (error) {
        console.error('Error creating expense:', error);
        throw new Error('Failed to create expense');
    }

    revalidatePath('/analytics');
    revalidatePath('/expenditure');
    revalidatePath('/projects');
    if (input.project_id) {
        revalidatePath(`/projects/${input.project_id}`);
    }

    return data;
}
