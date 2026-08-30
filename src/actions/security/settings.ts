'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

type SecuritySettingsResponse = {
  data: {
    max_contacts_per_resident: number | null;
    mandatory_fields: string[];
    code_format: 'alphanumeric' | 'numeric';
    expiry_warning_days: number[];
    auto_expire_contacts: boolean;
  } | null;
  error: string | null;
}

type UpdateSecuritySettingsResponse = {
  success: boolean;
  error: string | null;
}

/**
 * Gets all security module settings
 */
export async function getSecuritySettings(): Promise<SecuritySettingsResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('system_settings')
    .select('key, value')
    .eq('category', 'security');

  if (error) {
    console.error('Get security settings error:', error);
    return { data: null, error: 'Failed to fetch security settings' };
  }

  // Parse settings from database
  const settings: Record<string, unknown> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }

  return {
    data: {
      max_contacts_per_resident: (settings.security_max_contacts_per_resident as number | null | undefined) ?? null,
      mandatory_fields: (settings.security_mandatory_fields as string[] | undefined) || ['full_name', 'phone_primary', 'category_id'],
      code_format: (settings.security_code_format as 'numeric' | 'alphanumeric' | undefined) || 'alphanumeric',
      expiry_warning_days: (settings.security_expiry_warning_days as number[] | undefined) || [7, 3, 1],
      auto_expire_contacts: (settings.security_auto_expire_contacts as boolean | undefined) ?? true,
    },
    error: null,
  };
}

/**
 * Updates a single security setting
 */
export async function updateSecuritySetting(
  key: string,
  value: string | number | boolean
): Promise<UpdateSecuritySettingsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check user authorization
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Permission check (migrated from legacy role check)
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_SECURITY);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Only administrators can modify security settings' };
  }

  // Ensure the key is a security setting
  const validKeys = [
    'security_max_contacts_per_resident',
    'security_mandatory_fields',
    'security_code_format',
    'security_expiry_warning_days',
    'security_auto_expire_contacts',
  ];

  if (!validKeys.includes(key)) {
    return { success: false, error: 'Invalid security setting key' };
  }

  // Get old value for audit
  const { data: oldSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .single();

  const { error } = await supabase
    .from('system_settings')
    .update({ value })
    .eq('key', key);

  if (error) {
    console.error(`Update security setting "${key}" error:`, error);
    return { success: false, error: 'Failed to update setting' };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: key,
    entityDisplay: `Security Setting: ${key}`,
    oldValues: { value: oldSetting?.value },
    newValues: { value },
  });

  revalidatePath('/settings/security');
  return { success: true, error: null };
}

/**
 * Resets all security settings to their default values
 */
export async function resetSecuritySettingsToDefault(): Promise<UpdateSecuritySettingsResponse> {
  const supabase = await createServerSupabaseClient();

  // Check user authorization
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Permission check (migrated from legacy role check)
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_SECURITY);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Only administrators can reset security settings' };
  }

  const defaults = {
    security_max_contacts_per_resident: null,
    security_mandatory_fields: ['full_name', 'phone_primary', 'category_id'],
    security_code_format: 'alphanumeric',
    security_expiry_warning_days: [7, 3, 1],
    security_auto_expire_contacts: true,
  };

  const errors: string[] = [];
  for (const [key, value] of Object.entries(defaults)) {
    const { error } = await supabase
      .from('system_settings')
      .update({ value })
      .eq('key', key);

    if (error) {
      errors.push(`${key}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    return { success: false, error: errors.join('; ') };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: 'security_settings_reset',
    entityDisplay: 'Security Settings Reset to Defaults',
    newValues: defaults,
  });

  revalidatePath('/settings/security');
  return { success: true, error: null };
}

