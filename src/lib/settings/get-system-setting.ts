import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/database';

/**
 * Gets a system setting value from the database
 * Handles type coercion for boolean strings stored in JSONB
 *
 * @param supabase - Supabase client instance
 * @param key - The setting key to retrieve
 * @returns The setting value, or null if not found
 */
export async function getSystemSetting<T = unknown>(
  supabase: SupabaseClient<Database>,
  key: string
): Promise<T | null> {
  const { data } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single() as { data: { value: any } | null };

  if (data?.value) {
    // Value is stored as JSONB, but simple values are stored as strings
    if (typeof data.value === 'string') {
      // Try to parse boolean strings
      if (data.value === 'true') return true as T;
      if (data.value === 'false') return false as T;
      return data.value as T;
    }
    return data.value as T;
  }
  return null;
}

/**
 * Gets multiple system settings at once
 * More efficient than multiple individual calls
 *
 * @param supabase - Supabase client instance
 * @param keys - Array of setting keys to retrieve
 * @returns Map of key to value
 */
export async function getSystemSettings(
  supabase: SupabaseClient<Database>,
  keys: string[]
): Promise<Map<string, unknown>> {
  const { data } = await supabase
    .from('system_settings')
    .select('key, value')
    .in('key', keys) as { data: Array<{ key: string; value: any }> | null };

  const result = new Map<string, unknown>();

  for (const item of data || []) {
    if (item.value) {
      if (typeof item.value === 'string') {
        if (item.value === 'true') {
          result.set(item.key, true);
        } else if (item.value === 'false') {
          result.set(item.key, false);
        } else {
          result.set(item.key, item.value);
        }
      } else {
        result.set(item.key, item.value);
      }
    }
  }

  return result;
}
