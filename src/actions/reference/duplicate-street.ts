'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { Street } from '@/types/database';
import { logAudit } from '@/lib/audit/logger';

type DuplicateStreetResponse = {
    data: Street | null;
    error: string | null;
}

export async function duplicateStreet(id: string): Promise<DuplicateStreetResponse> {
    const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_REFERENCE);
    if (!auth.authorized) {
        return { data: null, error: auth.error || 'Unauthorized' };
    }

    const supabase = await createServerSupabaseClient();

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
            created_by: auth.userId,
        })
        .select()
        .single();

    if (error) {
        return { data: null, error: error.message };
    }

    await logAudit({
        action: 'CREATE',
        entityType: 'streets',
        entityId: data.id,
        entityDisplay: data.name,
        newValues: data,
        description: `Duplicated from "${source.name}"`,
        metadata: { source_street_id: id },
    });

    return { data, error: null };
}
