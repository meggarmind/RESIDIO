'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { readSetting } from '@/lib/settings/service';
import type { SystemSetting } from '@/types/database';
import type { Json } from '@/types/database.generated';

type GetSettingsResponse = {
    data: SystemSetting[];
    error: string | null;
}

type GetSettingResponse = {
    data: SystemSetting | null;
    error: string | null;
}

/**
 * Gets all system settings, optionally filtered by category
 */
export async function getSettings(category?: string): Promise<GetSettingsResponse> {
    const supabase = await createServerSupabaseClient();

    let query = supabase.from('system_settings').select('*');

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query.order('key', { ascending: true });

    if (error) {
        console.error('Get settings error:', error);
        return { data: [], error: 'Failed to fetch settings' };
    }

    return { data: data || [], error: null };
}

/**
 * Gets a specific system setting by key
 */
export async function getSetting(key: string): Promise<GetSettingResponse> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('system_settings')
        .select('*')
        .eq('key', key)
        .single();

    if (error) {
        console.error(`Get setting "${key}" error:`, error);
        return { data: null, error: 'Setting not found' };
    }

    return { data, error: null };
}

/**
 * Gets the raw value of a system setting, using the user-scoped/RLS-bound
 * client. Intended for callers running inside an authenticated request
 * (server actions, pages) where there is a real session.
 *
 * The `system_settings` SELECT policy is `TO authenticated`, so this
 * returns `null` for every key when there is no authenticated user — e.g.
 * inside a cron route or webhook handler. Those callers must use
 * `getSettingValueAsService` instead.
 *
 * Collapses `{status:'absent'}` and `{status:'error'}` to `null` for
 * backwards compatibility with existing callers. Use
 * `getSettingResultAsService` when the distinction matters.
 */
export async function getSettingValue(key: string): Promise<Json | null> {
    const supabase = await createServerSupabaseClient();
    const result = await readSetting(supabase, key);
    return result.status === 'ok' ? result.value : null;
}

/**
 * Gets all billing-related settings
 */
export async function getBillingSettings() {
    return getSettings('billing');
}

/**
 * Gets the current Development Levy profile ID from settings
 * Returns null if not set or disabled
 */
export async function getCurrentDevelopmentLevyProfileId(): Promise<string | null> {
    const value = await getSettingValue('current_development_levy_profile_id');

    // Handle null, 'null', empty string, or undefined as "not set"
    if (typeof value !== 'string' || !value || value === 'null' || value === '') {
        return null;
    }

    return value;
}
