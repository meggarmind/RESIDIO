'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAction } from '@/lib/auth/authorize';
import { ACTION_ROLES } from '@/lib/auth/action-roles';
import { logAudit, getChangedValues } from '@/lib/audit/logger';
import type { Street } from '@/types/database';
import type { StreetFormData } from '@/lib/validators/house';

type UpdateStreetResponse = {
    data: Street | null;
    error: string | null;
}

export async function updateStreet(id: string, formData: StreetFormData): Promise<UpdateStreetResponse> {
    // Authorization check - only admin, chairman can update streets
    const auth = await authorizeAction(ACTION_ROLES.reference);
    if (!auth.authorized) {
        return { data: null, error: auth.error };
    }

    const supabase = await createServerSupabaseClient();

    // Fetch current street for change tracking
    const { data: currentStreet } = await supabase
        .from('streets')
        .select('*')
        .eq('id', id)
        .single();

    // If attempting to deactivate, check for mapped houses
    if (formData.is_active === false && currentStreet?.is_active === true) {
        const { data: houses } = await supabase
            .from('houses')
            .select('id')
            .eq('street_id', id)
            .eq('is_active', true)
            .limit(1);

        if (houses && houses.length > 0) {
            return { data: null, error: 'Cannot deactivate a street with mapped houses' };
        }
    }

    // Update
    const { data, error } = await supabase
        .from('streets')
        .update({
            name: formData.name,
            short_name: formData.short_name || null,
            description: formData.description || null,
            is_active: formData.is_active ?? true,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return { data: null, error: error.message };
    }

    // Audit logging
    if (currentStreet && data) {
        const changes = getChangedValues(currentStreet, data);
        await logAudit({
            action: 'UPDATE',
            entityType: 'streets',
            entityId: id,
            entityDisplay: data.name,
            oldValues: changes.old,
            newValues: changes.new,
        });
    }

    return { data, error: null };
}
