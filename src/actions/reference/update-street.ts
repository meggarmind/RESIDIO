'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Street } from '@/types/database';
import type { StreetFormData } from '@/lib/validators/house';

export interface UpdateStreetResponse {
    data: Street | null;
    error: string | null;
}

export async function updateStreet(id: string, formData: StreetFormData): Promise<UpdateStreetResponse> {
    const supabase = await createServerSupabaseClient();

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    // Update
    const { data, error } = await supabase
        .from('streets')
        .update({
            name: formData.name,
            short_name: formData.short_name || null,
            description: formData.description || null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select()
        .single();

    if (error) {
        return { data: null, error: error.message };
    }

    revalidatePath('/houses');
    revalidatePath('/settings/references');
    return { data, error: null };
}
