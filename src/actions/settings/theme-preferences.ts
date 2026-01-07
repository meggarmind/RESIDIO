'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

/**
 * Get estate's default theme for a specific context
 */
export async function getEstateDefaultTheme(context: 'admin-dashboard' | 'resident-portal') {
  const supabase = await createServerSupabaseClient();

  const settingKey = context === 'admin-dashboard' ? 'dashboard_theme' : 'portal_theme';

  const { data, error } = await supabase
    .from('system_settings')
    .select('value')
    .eq('category', 'appearance')
    .eq('key', settingKey)
    .single();

  if (error) {
    console.error('Failed to fetch estate theme:', error);
    return { data: 'default', error: null }; // Fallback to default theme
  }

  return { data: data.value as string, error: null };
}

/**
 * Set estate's default theme for a specific context
 * (Admin only - requires SETTINGS_UPDATE permission)
 */
export async function setEstateDefaultTheme(
  context: 'admin-dashboard' | 'resident-portal',
  themeId: string
) {
  // Permission check - Admin only
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const settingKey = context === 'admin-dashboard' ? 'dashboard_theme' : 'portal_theme';

  // Get old value for audit log
  const { data: oldSetting } = await supabase
    .from('system_settings')
    .select('value')
    .eq('category', 'appearance')
    .eq('key', settingKey)
    .single();

  const oldTheme = oldSetting?.value as string;

  // Update theme
  const { error } = await supabase
    .from('system_settings')
    .update({ value: themeId })
    .eq('category', 'appearance')
    .eq('key', settingKey);

  if (error) {
    return { data: null, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: settingKey,
    entityDisplay: `${context} theme`,
    oldValues: { theme: oldTheme },
    newValues: { theme: themeId },
  });

  return { data: themeId, error: null };
}

/**
 * Get user's theme override for a specific context
 */
export async function getUserThemeOverride(context: 'admin-dashboard' | 'resident-portal') {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  if (context === 'admin-dashboard') {
    const { data, error } = await supabase
      .from('profiles')
      .select('dashboard_theme_override')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Failed to fetch user theme override:', error);
      return { data: null, error: error.message };
    }

    return { data: data.dashboard_theme_override, error: null };
  } else {
    const { data, error } = await supabase
      .from('profiles')
      .select('portal_theme_override')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Failed to fetch user theme override:', error);
      return { data: null, error: error.message };
    }

    return { data: data.portal_theme_override, error: null };
  }
}

/**
 * Set user's theme override for a specific context
 */
export async function setUserThemeOverride(
  context: 'admin-dashboard' | 'resident-portal',
  themeId: string | null
) {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Get old value for audit log
  const { data: oldOverride } = await getUserThemeOverride(context);

  const updateData = context === 'admin-dashboard'
    ? { dashboard_theme_override: themeId }
    : { portal_theme_override: themeId };

  const { error } = await supabase
    .from('profiles')
    .update(updateData)
    .eq('id', user.id);

  if (error) {
    return { data: null, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'profiles',
    entityId: user.id,
    entityDisplay: `${context} theme preference`,
    oldValues: { theme: oldOverride },
    newValues: { theme: themeId },
  });

  return { data: themeId, error: null };
}

/**
 * Get the effective theme for current user (considers override → estate default → fallback)
 */
export async function getEffectiveTheme(context: 'admin-dashboard' | 'resident-portal') {
  // Try user override first
  const { data: override } = await getUserThemeOverride(context);
  if (override) {
    return { data: override, error: null };
  }

  // Fall back to estate default
  const { data: estateDefault } = await getEstateDefaultTheme(context);
  return { data: estateDefault, error: null };
}
