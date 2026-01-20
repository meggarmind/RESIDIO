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

const sanitizeValue = (val?: string | null) => (!val || val.trim() === '') ? null : val;

export async function createPersonnel(input: PersonnelInsert): Promise<{ data: Personnel | null; error: string | null }> {
    const supabase = await createServerSupabaseClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) return { data: null, error: 'Unauthorized' };

    // Build payload, explicitly setting nulls for empty optional fields
    const payload: Record<string, any> = {
        name: input.name,
        type: input.type || 'vendor',
        status: input.status || 'active',
        is_active: input.is_active ?? true,
    };

    // Only include optional fields if they have actual values
    if (input.category && input.category.trim() !== '') payload.category = input.category;
    if (input.contact_person && input.contact_person.trim() !== '') payload.contact_person = input.contact_person;
    if (input.email && input.email.trim() !== '') payload.email = input.email;
    if (input.phone && input.phone.trim() !== '') payload.phone = input.phone;
    if (input.job_title && input.job_title.trim() !== '') payload.job_title = input.job_title;
    if (input.department && input.department.trim() !== '') payload.department = input.department;
    if (input.start_date && input.start_date.trim() !== '') payload.start_date = input.start_date;
    if (input.end_date && input.end_date.trim() !== '') payload.end_date = input.end_date;
    if (input.notes && input.notes.trim() !== '') payload.notes = input.notes;
    if (input.bank_details) payload.bank_details = input.bank_details;

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

    // Build payload, only including fields that need to be updated
    const payload: Record<string, any> = {};

    if (input.name !== undefined) payload.name = input.name;
    if (input.type !== undefined) payload.type = input.type;
    if (input.status !== undefined) payload.status = input.status;
    if (input.is_active !== undefined) payload.is_active = input.is_active;
    if (input.category !== undefined) payload.category = (input.category && input.category.trim() !== '') ? input.category : null;
    if (input.contact_person !== undefined) payload.contact_person = (input.contact_person && input.contact_person.trim() !== '') ? input.contact_person : null;
    if (input.email !== undefined) payload.email = (input.email && input.email.trim() !== '') ? input.email : null;
    if (input.phone !== undefined) payload.phone = (input.phone && input.phone.trim() !== '') ? input.phone : null;
    if (input.job_title !== undefined) payload.job_title = (input.job_title && input.job_title.trim() !== '') ? input.job_title : null;
    if (input.department !== undefined) payload.department = (input.department && input.department.trim() !== '') ? input.department : null;
    if (input.start_date !== undefined) payload.start_date = (input.start_date && input.start_date.trim() !== '') ? input.start_date : null;
    if (input.end_date !== undefined) payload.end_date = (input.end_date && input.end_date.trim() !== '') ? input.end_date : null;
    if (input.notes !== undefined) payload.notes = (input.notes && input.notes.trim() !== '') ? input.notes : null;
    if (input.bank_details !== undefined) payload.bank_details = input.bank_details;

    const { data, error } = await supabase
        .from('vendors')
        .update(payload)
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
