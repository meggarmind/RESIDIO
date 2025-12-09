'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { HouseType } from '@/types/database';
import type { HouseTypeFormData } from '@/lib/validators/house';

export interface UpdateHouseTypeResponse {
    data: HouseType | null;
    error: string | null;
}

export async function updateHouseType(id: string, formData: HouseTypeFormData): Promise<UpdateHouseTypeResponse> {
    const supabase = await createServerSupabaseClient();

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

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

    revalidatePath('/houses');
    return { data, error: null };
}
