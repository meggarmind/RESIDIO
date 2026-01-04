'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { SecurityRolePermissions, UserRole } from '@/types/database';
import { DEFAULT_SECURITY_PERMISSIONS, SECURITY_PERMISSION_LABELS } from '@/types/database';
import { logAudit } from '@/lib/audit/logger';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

type SecuritySettingsResponse = {
  data: {
    role_permissions: SecurityRolePermissions;
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
  const settings: Record<string, any> = {};
  for (const row of data || []) {
    settings[row.key] = row.value;
  }

  return {
    data: {
      role_permissions: settings.security_role_permissions || DEFAULT_SECURITY_PERMISSIONS,
      max_contacts_per_resident: settings.security_max_contacts_per_resident ?? null,
      mandatory_fields: settings.security_mandatory_fields || ['full_name', 'phone_primary', 'category_id'],
      code_format: settings.security_code_format || 'alphanumeric',
      expiry_warning_days: settings.security_expiry_warning_days || [7, 3, 1],
      auto_expire_contacts: settings.security_auto_expire_contacts ?? true,
    },
    error: null,
  };
}

/**
 * Gets the role permissions for the security module
 */
export async function getSecurityRolePermissions(): Promise<{ data: SecurityRolePermissions | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'security_role_permissions')
    .single();

  if (error) {
    // If not found, return defaults
    if (error.code === 'PGRST116') {
      return { data: DEFAULT_SECURITY_PERMISSIONS, error: null };
    }
    console.error('Get security role permissions error:', error);
    return { data: null, error: 'Failed to fetch role permissions' };
  }

  return { data: data.value as SecurityRolePermissions, error: null };
}

/**
 * Updates the security role permissions
 */
export async function updateSecurityRolePermissions(
  permissions: SecurityRolePermissions
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
    return { success: false, error: auth.error || 'Only administrators can modify security permissions' };
  }

  // Get old value for audit
  const { data: oldSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'security_role_permissions')
    .single();

  const { error } = await supabase
    .from('system_settings')
    .update({ value: permissions })
    .eq('key', 'security_role_permissions');

  if (error) {
    console.error('Update security role permissions error:', error);
    return { success: false, error: 'Failed to update permissions' };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: 'security_role_permissions',
    entityDisplay: 'Security Role Permissions',
    oldValues: { permissions: oldSetting?.value },
    newValues: { permissions },
  });

  revalidatePath('/settings/security');
  return { success: true, error: null };
}

/**
 * Updates a single security setting
 */
export async function updateSecuritySetting(
  key: string,
  value: any
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
    'security_role_permissions',
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
    security_role_permissions: DEFAULT_SECURITY_PERMISSIONS,
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

/**
 * Checks if the current user has a specific security permission
 */
export async function hasSecurityPermission(
  permissionName: keyof SecurityRolePermissions
): Promise<boolean> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;

  // Get user's role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) return false;

  const userRole = profile.role as UserRole;

  // Admin always has all permissions
  if (userRole === 'admin') return true;

  // Get permissions from settings
  const { data: permissionsData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'security_role_permissions')
    .single();

  const permissions: SecurityRolePermissions = permissionsData?.value || DEFAULT_SECURITY_PERMISSIONS;

  // Check if user's role has the permission
  const allowedRoles = permissions[permissionName] || [];
  return allowedRoles.includes(userRole);
}

/**
 * Gets all permissions for the current user
 */
export async function getCurrentUserSecurityPermissions(): Promise<{
  permissions: Record<keyof SecurityRolePermissions, boolean>;
  role: UserRole | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      permissions: {} as Record<keyof SecurityRolePermissions, boolean>,
      role: null,
    };
  }

  // Get user's role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return {
      permissions: {} as Record<keyof SecurityRolePermissions, boolean>,
      role: null,
    };
  }

  const userRole = profile.role as UserRole;

  // Admin has all permissions
  if (userRole === 'admin') {
    const allTrue: Record<keyof SecurityRolePermissions, boolean> = {
      register_contacts: true,
      generate_codes: true,
      update_contacts: true,
      verify_codes: true,
      record_checkin: true,
      view_contacts: true,
      search_contacts: true,
      export_contacts: true,
      suspend_revoke_contacts: true,
      configure_categories: true,
      view_access_logs: true,
    };
    return { permissions: allTrue, role: userRole };
  }

  // Get permissions from settings
  const { data: permissionsData } = await supabase
    .from('system_settings')
    .select('value')
    .eq('key', 'security_role_permissions')
    .single();

  const permissions: SecurityRolePermissions = permissionsData?.value || DEFAULT_SECURITY_PERMISSIONS;

  // Build permissions object for this user
  const userPermissions: Record<keyof SecurityRolePermissions, boolean> = {
    register_contacts: permissions.register_contacts.includes(userRole),
    generate_codes: permissions.generate_codes.includes(userRole),
    update_contacts: permissions.update_contacts.includes(userRole),
    verify_codes: permissions.verify_codes.includes(userRole),
    record_checkin: permissions.record_checkin.includes(userRole),
    view_contacts: permissions.view_contacts.includes(userRole),
    search_contacts: permissions.search_contacts.includes(userRole),
    export_contacts: permissions.export_contacts.includes(userRole),
    suspend_revoke_contacts: permissions.suspend_revoke_contacts.includes(userRole),
    configure_categories: permissions.configure_categories.includes(userRole),
    view_access_logs: permissions.view_access_logs.includes(userRole),
  };

  return { permissions: userPermissions, role: userRole };
}
