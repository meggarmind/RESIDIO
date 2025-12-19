'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';

export interface DeleteStreetResponse {
    success: boolean;
    error: string | null;
}

export async function deleteStreet(id: string): Promise<DeleteStreetResponse> {
    const supabase = await createServerSupabaseClient();

    // Check auth
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    // Fetch street for audit logging
    const { data: street } = await supabase
        .from('streets')
        .select('*')
        .eq('id', id)
        .single();

    if (!street) {
        return { success: false, error: 'Street not found' };
    }

    // Check if street has mapped houses
    const { data: houses } = await supabase
        .from('houses')
        .select('id')
        .eq('street_id', id)
        .eq('is_active', true)
        .limit(1);

    if (houses && houses.length > 0) {
        return { success: false, error: 'Cannot delete a street with mapped houses' };
    }

    // Hard delete the street
    const { error } = await supabase
        .from('streets')
        .delete()
        .eq('id', id);

    if (error) {
        return { success: false, error: error.message };
    }

    // Audit logging
    await logAudit({
        action: 'DELETE',
        entityType: 'streets',
        entityId: id,
        entityDisplay: street.name,
        oldValues: street,
    });

    return { success: true, error: null };
}
