'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import type { SystemSetting } from '@/types/database';

type GetSettingsResponse = {
    data: SystemSetting[];
    error: string | null;
}

type GetSettingResponse = {
    data: SystemSetting | null;
    error: string | null;
}

/**
 * Result of a single-setting read that distinguishes "row absent" from
 * "query errored" — both previously collapsed to `null` in `getSettingValue`,
 * which made a transient DB error indistinguishable from an unconfigured
 * setting at every call site. See issue #136.
 */
export type SettingReadResult<T = unknown> =
    | { status: 'ok'; value: T }
    | { status: 'absent' }
    | { status: 'error'; message: string };

/**
 * Handles conversion from JSONB storage format (string 'true'/'false' and
 * numeric strings get coerced to their native types).
 */
function coerceSettingValue(value: unknown): unknown {
    if (typeof value === 'string') {
        if (value === 'true') return true;
        if (value === 'false') return false;
        const numValue = Number(value);
        if (!isNaN(numValue)) return numValue;
        return value;
    }

    return value;
}

/**
 * Shared read path for a single setting's value, given an already-built
 * Supabase client (either the user-scoped/RLS-bound client or the
 * service-role admin client). Uses `maybeSingle()` so "no row" (0 rows)
 * and "query error" are reported distinctly instead of both surfacing as
 * a PostgREST error.
 */
async function readSetting(
    supabase: Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminClient>,
    key: string
): Promise<SettingReadResult> {
    const { data, error } = await supabase
        .from('system_settings')
        .select('value')
        .eq('key', key)
        .maybeSingle();

    if (error) {
        console.error(`Get setting value "${key}" error:`, error);
        return { status: 'error', message: error.message };
    }

    if (!data) {
        return { status: 'absent' };
    }

    return { status: 'ok', value: coerceSettingValue(data.value) };
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
export async function getSettingValue(key: string): Promise<any> {
    const supabase = await createServerSupabaseClient();
    const result = await readSetting(supabase, key);
    return result.status === 'ok' ? result.value : null;
}

/**
 * Gets the raw value of a system setting using the service-role admin
 * client, bypassing RLS. Use this for cron routes, webhooks, and any
 * other server-side caller that runs without an authenticated user
 * session — the regular `getSettingValue` will silently return `null`
 * for every key in that context because the `system_settings` SELECT
 * policy is `TO authenticated`. See issue #136.
 */
export async function getSettingValueAsService(key: string): Promise<any> {
    const supabase = createAdminClient();
    const result = await readSetting(supabase, key);
    return result.status === 'ok' ? result.value : null;
}

/**
 * Same as `getSettingValueAsService`, but returns the full three-way
 * result (`ok` / `absent` / `error`) instead of collapsing to `null`.
 * Use this when a caller needs to fail closed on a genuine query error
 * without confusing it for "setting not configured".
 */
export async function getSettingResultAsService(key: string): Promise<SettingReadResult> {
    const supabase = createAdminClient();
    return readSetting(supabase, key);
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
