'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizeAction } from '@/lib/auth/authorize';
import { ACTION_ROLES } from '@/lib/auth/action-roles';
import type { HouseType } from '@/types/database';
import type { HouseTypeFormData } from '@/lib/validators/house';

type UpdateHouseTypeResponse = {
    data: HouseType | null;
    error: string | null;
}

export async function updateHouseType(id: string, formData: HouseTypeFormData): Promise<UpdateHouseTypeResponse> {
    // Authorization check - only admin, chairman can update house types
    const auth = await authorizeAction(ACTION_ROLES.reference);
    if (!auth.authorized) {
        return { data: null, error: auth.error };
    }

    const supabase = await createServerSupabaseClient();

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

    return { data, error: null };
}
