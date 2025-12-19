'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Street } from '@/types/database';

export interface DuplicateStreetResponse {
    data: Street | null;
    error: string | null;
}

export async function duplicateStreet(id: string): Promise<DuplicateStreetResponse> {
    const supabase = await createServerSupabaseClient();

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    // Get source street
    const { data: source, error: fetchError } = await supabase
        .from('streets')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !source) {
        return { data: null, error: fetchError?.message || 'Street not found' };
    }

    // Create duplicate with "Copy of" prefix
    const { data, error } = await supabase
        .from('streets')
        .insert({
            name: `Copy of ${source.name}`,
            short_name: source.short_name ? `Copy of ${source.short_name}` : null,
            description: source.description,
            is_active: source.is_active,
            created_by: user.id,
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: error.message };
    }

    return { data, error: null };
}
