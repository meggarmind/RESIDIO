'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { HouseType } from '@/types/database';
import type { HouseTypeFormData } from '@/lib/validators/house';
import { logAudit, getChangedValues } from '@/lib/audit/logger';

type UpdateHouseTypeResponse = {
    data: HouseType | null;
    error: string | null;
}

export async function updateHouseType(id: string, formData: HouseTypeFormData): Promise<UpdateHouseTypeResponse> {
    // Authorization check - only admin, chairman can update house types
    const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
    if (!auth.authorized) {
        return { data: null, error: auth.error };
    }

    const supabase = await createServerSupabaseClient();

    // Capture the pre-update state so the audit entry records what actually changed
    const { data: existing } = await supabase
        .from('house_types')
        .select('*')
        .eq('id', id)
        .single();

    // Update
    const { data, error } = await supabase
        .from('house_types')
        .update({
            name: formData.name,
            description: formData.description || null,
            max_residents: formData.max_residents,
            billing_profile_id: formData.billing_profile_id || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return { data: null, error: error.message };
    }

    const changes = getChangedValues(existing ?? {}, data);
    await logAudit({
        action: 'UPDATE',
        entityType: 'house_types',
        entityId: id,
        entityDisplay: data.name,
        oldValues: changes.old,
        newValues: changes.new,
    });

    return { data, error: null };
}
