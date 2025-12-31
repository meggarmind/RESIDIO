'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type {
  SettingLevel,
  HierarchicalSetting,
  SettingOverride,
  HierarchicalSettingKey,
  SettingCategory,
} from '@/lib/settings/hierarchical-settings-types';

// Re-export types for consumers (type-only exports are allowed in "use server" files)
export type {
  SettingLevel,
  HierarchicalSetting,
  SettingOverride,
  HierarchicalSettingKey,
  SettingCategory,
} from '@/lib/settings/hierarchical-settings-types';

// Note: SETTING_METADATA is available from '@/lib/settings/hierarchical-settings-types'
// It cannot be re-exported from "use server" files as it's not an async function

type GetEffectiveSettingResponse = {
  success: boolean;
  error: string | null;
  value: unknown;
  resolved_level?: SettingLevel;
};

type SetSettingResponse = {
  success: boolean;
  error: string | null;
  data?: HierarchicalSetting;
};

type GetOverridesResponse = {
  success: boolean;
  error: string | null;
  data?: SettingOverride[];
};

type GetSettingsByCategoryResponse = {
  success: boolean;
  error: string | null;
  data?: HierarchicalSetting[];
};

/**
 * Get effective setting value with cascade resolution
 *
 * Resolution order: resident -> house -> estate
 *
 * @param key - Setting key to look up
 * @param houseId - Optional house ID for house/resident level resolution
 * @param residentId - Optional resident ID for resident level resolution
 */
export async function getEffectiveSetting(
  key: HierarchicalSettingKey,
  houseId?: string,
  residentId?: string
): Promise<GetEffectiveSettingResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized', value: null };
  }

  // Use the database function for cascade resolution
  const { data, error } = await supabase.rpc('get_effective_setting', {
    p_setting_key: key,
    p_house_id: houseId || null,
    p_resident_id: residentId || null,
  });

  if (error) {
    console.error('[getEffectiveSetting] Error:', error);
    return { success: false, error: 'Failed to get setting', value: null };
  }

  // Parse the JSONB value
  let parsedValue = data;
  if (typeof data === 'string') {
    // Handle string-encoded values
    if (data === 'true') parsedValue = true;
    else if (data === 'false') parsedValue = false;
    else if (!isNaN(Number(data))) parsedValue = Number(data);
    else {
      // Try to parse as JSON string (e.g., '"pdf"' -> 'pdf')
      try {
        parsedValue = JSON.parse(data);
      } catch {
        parsedValue = data;
      }
    }
  }

  return { success: true, error: null, value: parsedValue };
}

/**
 * Get the raw effective setting value (convenience function)
 */
export async function getEffectiveSettingValue<T = unknown>(
  key: HierarchicalSettingKey,
  houseId?: string,
  residentId?: string
): Promise<T | null> {
  const result = await getEffectiveSetting(key, houseId, residentId);
  return result.success ? (result.value as T) : null;
}

/**
 * Set a setting value at a specific level
 *
 * @param key - Setting key
 * @param value - Value to set
 * @param level - Hierarchy level (estate, house, or resident)
 * @param houseId - Required for house level
 * @param residentId - Required for resident level
 * @param description - Optional description
 */
export async function setHierarchicalSetting(
  key: HierarchicalSettingKey,
  value: unknown,
  level: SettingLevel,
  houseId?: string,
  residentId?: string,
  description?: string
): Promise<SetSettingResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Validate level requirements
  if (level === 'house' && !houseId) {
    return { success: false, error: 'House ID required for house-level setting' };
  }
  if (level === 'resident' && !residentId) {
    return { success: false, error: 'Resident ID required for resident-level setting' };
  }

  // Prepare value for JSONB storage
  let storageValue: unknown = value;
  if (typeof value === 'boolean' || typeof value === 'number') {
    storageValue = value;
  } else if (typeof value === 'string') {
    storageValue = value;
  } else {
    storageValue = value;
  }

  // Upsert the setting
  const { data, error } = await supabase
    .from('hierarchical_settings')
    .upsert(
      {
        setting_key: key,
        level,
        house_id: level === 'house' ? houseId : null,
        resident_id: level === 'resident' ? residentId : null,
        value: storageValue,
        description: description || null,
        updated_by: user.id,
      },
      {
        onConflict: 'setting_key,level,house_id,resident_id',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('[setHierarchicalSetting] Error:', error);
    return { success: false, error: 'Failed to set setting' };
  }

  revalidatePath('/settings');
  return { success: true, error: null, data: data as HierarchicalSetting };
}

/**
 * Remove a setting override at a specific level
 *
 * Note: Estate-level settings cannot be removed (they are defaults)
 */
export async function removeSettingOverride(
  key: HierarchicalSettingKey,
  level: 'house' | 'resident',
  houseId?: string,
  residentId?: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  if (level === 'house' && !houseId) {
    return { success: false, error: 'House ID required' };
  }
  if (level === 'resident' && !residentId) {
    return { success: false, error: 'Resident ID required' };
  }

  let query = supabase
    .from('hierarchical_settings')
    .delete()
    .eq('setting_key', key)
    .eq('level', level);

  if (level === 'house') {
    query = query.eq('house_id', houseId!);
  } else {
    query = query.eq('resident_id', residentId!);
  }

  const { error } = await query;

  if (error) {
    console.error('[removeSettingOverride] Error:', error);
    return { success: false, error: 'Failed to remove override' };
  }

  revalidatePath('/settings');
  return { success: true, error: null };
}

/**
 * Get all overrides for a setting across all levels
 */
export async function getSettingOverrides(
  key: HierarchicalSettingKey
): Promise<GetOverridesResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Use the database function
  const { data, error } = await supabase.rpc('get_setting_overrides', {
    p_setting_key: key,
  });

  if (error) {
    console.error('[getSettingOverrides] Error:', error);
    return { success: false, error: 'Failed to get overrides' };
  }

  return {
    success: true,
    error: null,
    data: data as SettingOverride[]
  };
}

/**
 * Get all settings for a category at estate level
 */
export async function getEstateSettingsByCategory(
  category: SettingCategory
): Promise<GetSettingsByCategoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('hierarchical_settings')
    .select('*')
    .eq('category', category)
    .eq('level', 'estate')
    .order('setting_key');

  if (error) {
    console.error('[getEstateSettingsByCategory] Error:', error);
    return { success: false, error: 'Failed to get settings' };
  }

  return {
    success: true,
    error: null,
    data: data as HierarchicalSetting[]
  };
}

/**
 * Get all setting overrides for a house
 */
export async function getHouseSettingOverrides(
  houseId: string
): Promise<GetSettingsByCategoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('hierarchical_settings')
    .select('*')
    .eq('house_id', houseId)
    .eq('level', 'house')
    .order('setting_key');

  if (error) {
    console.error('[getHouseSettingOverrides] Error:', error);
    return { success: false, error: 'Failed to get house settings' };
  }

  return {
    success: true,
    error: null,
    data: data as HierarchicalSetting[]
  };
}

/**
 * Get all setting overrides for a resident
 */
export async function getResidentSettingOverrides(
  residentId: string
): Promise<GetSettingsByCategoryResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  const { data, error } = await supabase
    .from('hierarchical_settings')
    .select('*')
    .eq('resident_id', residentId)
    .eq('level', 'resident')
    .order('setting_key');

  if (error) {
    console.error('[getResidentSettingOverrides] Error:', error);
    return { success: false, error: 'Failed to get resident settings' };
  }

  return {
    success: true,
    error: null,
    data: data as HierarchicalSetting[]
  };
}

/**
 * Bulk update multiple settings at once
 */
export async function updateMultipleSettings(
  settings: Array<{
    key: HierarchicalSettingKey;
    value: unknown;
    level: SettingLevel;
    houseId?: string;
    residentId?: string;
  }>
): Promise<{ success: boolean; error: string | null; updated: number }> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized', updated: 0 };
  }

  let updated = 0;
  const errors: string[] = [];

  for (const setting of settings) {
    const result = await setHierarchicalSetting(
      setting.key,
      setting.value,
      setting.level,
      setting.houseId,
      setting.residentId
    );

    if (result.success) {
      updated++;
    } else {
      errors.push(`${setting.key}: ${result.error}`);
    }
  }

  if (errors.length > 0) {
    return {
      success: false,
      error: `Some settings failed: ${errors.join('; ')}`,
      updated
    };
  }

  return { success: true, error: null, updated };
}
