'use server';

import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { Personnel, PersonnelEngagement, PersonnelEngagementWithAccountability, PersonnelInsert, PersonnelType, PersonnelUpdate, PersonnelWithEngagements } from '@/types/database';
import { matchesPersonnelAccountabilityFilter, type PersonnelAccountabilityFilter } from '@/lib/personnel/engagements';
import { revalidatePath } from 'next/cache';

export async function getPersonnel(
    filters?: {
        type?: PersonnelType;
        activeOnly?: boolean;
        search?: string;
        accountability?: PersonnelAccountabilityFilter;
    }
): Promise<{ data: PersonnelWithEngagements[] | null; error: string | null }> {
    const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_VIEW);
    if (!authorized) return { data: null, error: 'Unauthorized' };

    const supabase = createAdminClient();

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

    const personnel = data as unknown as Personnel[];
    const personnelIds = personnel.map((person) => person.id);
    const { data: engagementData, error: engagementError } = personnelIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from('personnel_engagements')
            .select('*')
            .in('personnel_id', personnelIds);

    if (engagementError) {
        console.error('Error fetching personnel engagements:', engagementError);
        return { data: null, error: 'Failed to fetch personnel accountability' };
    }

    const rawEngagements = (engagementData ?? []) as PersonnelEngagement[];
    const residentHouseIds = rawEngagements
        .map((engagement) => engagement.resident_house_id)
        .filter((id): id is string => !!id);
    const { data: residentHouseData, error: residentHouseError } = residentHouseIds.length === 0
        ? { data: [], error: null }
        : await supabase
            .from('resident_houses')
            .select('id, resident_id, house_id')
            .in('id', residentHouseIds);
    if (residentHouseError) return { data: null, error: 'Failed to fetch engagement accountability' };

    const residentIds = [...new Set((residentHouseData ?? []).map((row) => row.resident_id))];
    const houseIds = [...new Set((residentHouseData ?? []).map((row) => row.house_id))];
    const [{ data: residents }, { data: houses }] = await Promise.all([
        residentIds.length === 0 ? { data: [] } : supabase.from('residents').select('id, first_name, last_name').in('id', residentIds),
        houseIds.length === 0 ? { data: [] } : supabase.from('houses').select('id, house_number, street_id').in('id', houseIds),
    ]);
    const streetIds = [...new Set((houses ?? []).map((house) => house.street_id).filter((id): id is string => !!id))];
    const { data: streets } = streetIds.length === 0
        ? { data: [] }
        : await supabase.from('streets').select('id, name').in('id', streetIds);
    const residentById = new Map((residents ?? []).map((resident) => [resident.id, `${resident.first_name} ${resident.last_name}`]));
    const houseById = new Map((houses ?? []).map((house) => [house.id, house]));
    const streetById = new Map((streets ?? []).map((street) => [street.id, street.name]));
    const residentHouseById = new Map((residentHouseData ?? []).map((row) => [row.id, {
        id: row.id,
        house_number: houseById.get(row.house_id)?.house_number ?? 'House',
        street_name: houseById.get(row.house_id)?.street_id ? streetById.get(houseById.get(row.house_id)?.street_id as string) ?? null : null,
        resident_name: residentById.get(row.resident_id) ?? 'Resident',
    }]));
    const engagementsWithAccountability = rawEngagements.map((engagement): PersonnelEngagementWithAccountability => ({
        ...engagement,
        resident_house: engagement.resident_house_id ? residentHouseById.get(engagement.resident_house_id) ?? null : null,
    }));
    const engagementsByPersonnel = new Map<string, PersonnelEngagementWithAccountability[]>();
    for (const engagement of engagementsWithAccountability) {
        const engagements = engagementsByPersonnel.get(engagement.personnel_id) ?? [];
        engagements.push(engagement);
        engagementsByPersonnel.set(engagement.personnel_id, engagements);
    }

    const today = new Date().toISOString().slice(0, 10);
    const personnelWithEngagements = personnel.map((person) => {
        const engagementHistory = engagementsByPersonnel.get(person.id) ?? [];
        return {
        ...person,
        engagement_history: engagementHistory,
        active_engagements: engagementHistory.filter((engagement) =>
            engagement.start_date <= today && (engagement.end_date === null || engagement.end_date >= today)
        ),
    }; });

    const accountabilityFilter = filters?.accountability;
    const filteredPersonnel = accountabilityFilter && accountabilityFilter !== 'all'
        ? personnelWithEngagements.filter((person) =>
            matchesPersonnelAccountabilityFilter(person.active_engagements, accountabilityFilter)
        )
        : personnelWithEngagements;

    return { data: filteredPersonnel, error: null };
}

export async function createPersonnel(input: PersonnelInsert): Promise<{ data: Personnel | null; error: string | null }> {
    const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
    if (!authorized) return { data: null, error: 'Unauthorized' };

    const supabase = await createServerSupabaseClient();

    // Build payload, explicitly setting nulls for empty optional fields
    const payload: Record<string, unknown> = {
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

    await logAudit({
        action: 'CREATE',
        entityType: 'vendors',
        entityId: (data as { id: string }).id,
        entityDisplay: `Personnel: ${payload.name}`,
        newValues: payload,
    });

    return { data: data as unknown as Personnel, error: null };
}

export async function updatePersonnel(
    id: string,
    input: PersonnelUpdate
): Promise<{ data: Personnel | null; error: string | null }> {
    const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
    if (!authorized) return { data: null, error: 'Unauthorized' };

    const supabase = await createServerSupabaseClient();

    // Build payload, only including fields that need to be updated
    const payload: Record<string, unknown> = {};

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

    await logAudit({
        action: 'UPDATE',
        entityType: 'vendors',
        entityId: id,
        entityDisplay: `Personnel: ${payload.name ?? id}`,
        newValues: payload,
    });

    return { data: data as unknown as Personnel, error: null };
}

export async function deletePersonnel(id: string): Promise<{ success: boolean; error: string | null }> {
    const { authorized } = await authorizePermission(PERMISSIONS.VENDORS_MANAGE);
    if (!authorized) return { success: false, error: 'Unauthorized' };

    const supabase = await createServerSupabaseClient();

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

    await logAudit({
        action: 'DELETE',
        entityType: 'vendors',
        entityId: id,
        entityDisplay: `Personnel: ${id}`,
    });

    return { success: true, error: null };
}
