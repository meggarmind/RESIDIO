'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { SystemSetting } from '@/types/database';

export interface GetSettingsResponse {
    data: SystemSetting[];
    error: string | null;
}

export interface GetSettingResponse {
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
 * Gets the raw value of a system setting
 * Handles conversion from JSONB storage format
 */
export async function getSettingValue(key: string): Promise<any> {
    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .single();

    if (error || !data) {
        return null;
    }

    const value = data.value;

    // Handle string values that are actually booleans
    if (typeof value === 'string') {
        if (value === 'true') return true;
        if (value === 'false') return false;
        // Try parsing as number
        const numValue = Number(value);
        if (!isNaN(numValue)) return numValue;
        return value;
    }

    return value;
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
    if (!value || value === 'null' || value === '') {
        return null;
    }

    return value;
}
