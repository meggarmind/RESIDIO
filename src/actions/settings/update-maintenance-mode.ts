'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { updateSetting } from './update-setting';
import { logAudit } from '@/lib/audit/logger';

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

    // Audit log
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: 'maintenance_mode',
      entityDisplay: 'System Maintenance Mode',
      oldValues: { enabled: !enabled },
      newValues: { enabled, message: message || null },
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update maintenance mode';
    return { success: false, error: errorMessage };
  }
}
