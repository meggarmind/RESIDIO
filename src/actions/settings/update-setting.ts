'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SystemSetting } from '@/types/database';

export interface UpdateSettingResponse {
    data: SystemSetting | null;
    error: string | null;
}

/**
 * Updates a system setting value
 */
export async function updateSetting(key: string, value: any): Promise<UpdateSettingResponse> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    // Normalize value for storage
    // Store simple values as strings for consistency
    let storageValue = value;
    if (typeof value === 'boolean') {
        storageValue = value.toString();
    } else if (typeof value === 'number') {
        storageValue = value.toString();
    }

    const { data, error } = await supabase
        .from('system_settings')
        .update({ value: storageValue })
        .eq('key', key)
        .select()
        .single();

    if (error) {
        console.error(`Update setting "${key}" error:`, error);
        return { data: null, error: 'Failed to update setting' };
    }

    revalidatePath('/settings');
    revalidatePath('/settings/billing');
    return { data, error: null };
}

/**
 * Updates multiple settings at once
 */
export async function updateSettings(settings: Record<string, any>): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { success: false, error: 'Unauthorized' };
    }

    const errors: string[] = [];

    for (const [key, value] of Object.entries(settings)) {
        let storageValue = value;
        if (typeof value === 'boolean') {
            storageValue = value.toString();
        } else if (typeof value === 'number') {
            storageValue = value.toString();
        }

        const { error } = await supabase
            .from('system_settings')
            .update({ value: storageValue })
            .eq('key', key);

        if (error) {
            errors.push(`${key}: ${error.message}`);
        }
    }

    if (errors.length > 0) {
        return { success: false, error: errors.join('; ') };
    }

    revalidatePath('/settings');
    revalidatePath('/settings/billing');
    return { success: true, error: null };
}

/**
 * Sets the current Development Levy profile ID
 * Pass null or empty string to disable Development Levy auto-application
 */
export async function setCurrentDevelopmentLevyProfileId(profileId: string | null): Promise<UpdateSettingResponse> {
    // Store as 'null' string if null, or the actual UUID
    const value = profileId || 'null';
    return updateSetting('current_development_levy_profile_id', value);
}

/**
 * Creates a new system setting (admin only)
 */
export async function createSetting(
    key: string,
    value: any,
    description?: string,
    category?: string
): Promise<UpdateSettingResponse> {
    const supabase = await createServerSupabaseClient();

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        return { data: null, error: 'Unauthorized' };
    }

    let storageValue = value;
    if (typeof value === 'boolean') {
        storageValue = value.toString();
    } else if (typeof value === 'number') {
        storageValue = value.toString();
    }

    const { data, error } = await supabase
        .from('system_settings')
        .insert({
            key,
            value: storageValue,
            description: description || null,
            category: category || 'general',
        })
        .select()
        .single();

    if (error) {
        if (error.code === '23505') {
            return { data: null, error: `Setting "${key}" already exists` };
        }
        console.error(`Create setting "${key}" error:`, error);
        return { data: null, error: 'Failed to create setting' };
    }

    revalidatePath('/settings');
    return { data, error: null };
}
