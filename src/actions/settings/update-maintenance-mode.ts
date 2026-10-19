'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { updateSetting } from './update-setting';
import { logAudit } from '@/lib/audit/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';

interface UpdateMaintenanceModeResult {
  success: boolean;
  error?: string;
}

/**
 * Update system maintenance mode setting
 *
 * When enabled, all non-super_admin users are redirected to the maintenance page.
 * Super admins can still access the system to perform maintenance tasks.
 *
 * @param enabled - Whether maintenance mode should be enabled
 * @param message - Optional custom message to display on maintenance page
 * @returns Success status and any errors
 */
export async function updateMaintenanceMode(
  enabled: boolean,
  message?: string
): Promise<UpdateMaintenanceModeResult> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    // Update maintenance mode setting
    const modeResult = await updateSetting('maintenance_mode', enabled ? 'true' : 'false');
    if (modeResult.error) {
      return { success: false, error: modeResult.error };
    }

    // Update maintenance message if provided
    if (message !== undefined && message.trim() !== '') {
      const messageResult = await updateSetting('maintenance_message', message);
      if (messageResult.error) {
        return { success: false, error: messageResult.error };
      }
    }

    // Audit log. audit_logs.entity_id is a uuid: use the settings row id (#594).
    if (modeResult.data?.id) {
      await logAudit({
        action: 'UPDATE',
        entityType: 'system_settings',
        entityId: modeResult.data.id,
        entityDisplay: 'System Maintenance Mode',
        oldValues: { enabled: !enabled },
        newValues: { key: 'maintenance_mode', enabled, message: message || null },
      });
    }

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update maintenance mode';
    return { success: false, error: errorMessage };
  }
}

export type MaintenanceLockoutPreview = {
  total: number;
  byRole: { role: string; count: number }[];
};

/**
 * Who maintenance mode would lock out, for its confirmation dialog (#790). The middleware
 * redirects every signed-in user whose role is not super_admin, so this counts active
 * accounts by role, excluding super_admin. Reads only.
 */
export async function previewMaintenanceLockout(): Promise<{ data: MaintenanceLockoutPreview | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_MAINTENANCE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await fetchAllRows<{ app_roles: unknown }>((from, to) =>
    supabase
      .from('profiles')
      .select('app_roles!profiles_role_id_fkey (name, display_name)')
      .eq('approval_status', 'active')
      .order('id')
      .range(from, to)
  );
  if (error || !data) return { data: null, error: error || 'Failed to load users' };

  const counts = new Map<string, number>();
  for (const profile of data) {
    const role = (Array.isArray(profile.app_roles) ? profile.app_roles[0] : profile.app_roles) as
      | { name: string; display_name: string }
      | null;
    if (role?.name === 'super_admin') continue;
    const label = role?.display_name || 'No admin role (residents)';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const byRole = [...counts].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count);
  return { data: { total: byRole.reduce((sum, r) => sum + r.count, 0), byRole }, error: null };
}
