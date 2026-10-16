import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import type { Json } from '@/types/database.generated';

// Plain server-side helpers (deliberately NOT a 'use server' module): the
// *AsService readers use the service-role client with no permission check,
// so they must never be exposed as server-action endpoints. See issue #460.

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
function coerceSettingValue(value: Json): Json {
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
type SettingsClient = Awaited<ReturnType<typeof createServerSupabaseClient>> | ReturnType<typeof createAdminClient>;

export async function readSetting(
    supabase: SettingsClient,
    key: string
): Promise<SettingReadResult<Json>> {
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
 * Gets the raw value of a system setting using the service-role admin
 * client, bypassing RLS. Use this for cron routes, webhooks, and any
 * other server-side caller that runs without an authenticated user
 * session — the regular `getSettingValue` will silently return `null`
 * for every key in that context because the `system_settings` SELECT
 * policy is `TO authenticated`. See issue #136.
 */
export async function getSettingValueAsService(key: string): Promise<Json | null> {
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
 * Reads several settings in one query with NO type coercion: a stored string
 * stays a string. `coerceSettingValue` turns numeric-looking strings into
 * numbers and `''` into `0`, which destroys a phone number such as
 * `08012345678`. Keys with no row are simply absent from the returned map.
 * A query error is reported, never collapsed to "absent", so a caller can fail
 * closed (communications override, #715).
 */
export async function getRawSettingsAsService(
    keys: string[],
    client?: SettingsClient
): Promise<{ status: 'ok'; values: Map<string, Json> } | { status: 'error'; message: string }> {
    const supabase = client ?? createAdminClient();
    const { data, error } = await supabase
        .from('system_settings')
        .select('key, value')
        .in('key', keys);

    if (error) {
        console.error('Get raw settings error:', error);
        return { status: 'error', message: error.message };
    }

    return { status: 'ok', values: new Map((data ?? []).map((row) => [row.key, row.value as Json])) };
}
