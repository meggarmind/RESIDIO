'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { Personnel, PersonnelInsert, PersonnelType, PersonnelUpdate } from '@/types/database';
import { revalidatePath } from 'next/cache';

export async function getPersonnel(
    filters?: {
        type?: PersonnelType;
        activeOnly?: boolean;
        search?: string;
    }
): Promise<{ data: Personnel[] | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    let query = supabase
        .from('vendors')
        .select('*')
        .order('name');

    if (filters?.type) {
        query = query.eq('type', filters.type);
    }

    if (filters?.activeOnly) {
        query = query.eq('is_active', true).neq('status', 'terminated');
    }

    if (filters?.search) {
        query = query.ilike('name', `%${filters.search}%`);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching personnel:', error);
        return { data: null, error: 'Failed to fetch personnel' };
    }

    // Cast to Personnel[] because Supabase types might imply the old Vendor shape without our manual overrides effectively propagating to the query result type automatically unless we cast or generated types
    return { data: data as unknown as Personnel[], error: null };
}

export async function createPersonnel(input: PersonnelInsert): Promise<{ data: Personnel | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { data: null, error: 'Unauthorized' };

    // Set default type if missing
    const payload = {
        ...input,
        type: input.type || 'vendor',
        status: input.status || 'active',
    };

    const { data, error } = await supabase
        .from('vendors')
        .insert([payload])
        .select()
        .single();

    if (error) {
        console.error('Error creating personnel:', error);
        return { data: null, error: 'Failed to create personnel' };
    }

    revalidatePath('/personnel');
    revalidatePath('/expenditure'); // Because they show up in Log Expense

    return { data: data as unknown as Personnel, error: null };
}

export async function updatePersonnel(
    id: string,
    input: PersonnelUpdate
): Promise<{ data: Personnel | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { data: null, error: 'Unauthorized' };

    const { data, error } = await supabase
        .from('vendors')
        .update(input)
        .eq('id', id)
        .select()
        .single();

    if (error) {
        console.error('Error updating personnel:', error);
        return { data: null, error: 'Failed to update personnel' };
    }

    revalidatePath('/personnel');
    revalidatePath('/expenditure');

    return { data: data as unknown as Personnel, error: null };
}

export async function deletePersonnel(id: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { success: false, error: 'Unauthorized' };

    const { error } = await supabase
        .from('vendors')
        .delete()
        .eq('id', id);

    if (error) {
        console.error('Error deleting personnel:', error);
        return { success: false, error: 'Failed to delete personnel' };
    }

    revalidatePath('/personnel');
    revalidatePath('/expenditure');

    return { success: true, error: null };
}
