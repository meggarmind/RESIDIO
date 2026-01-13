'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { updateSetting } from './update-setting';
import { logAudit } from '@/lib/audit/logger';

interface UpdateEmailDebugModeResult {
  success: boolean;
  error?: string;
}

/**
 * Update email debug mode setting
 *
 * When enabled, emails are logged to email_logs with DEBUG_MODE status
 * but are NOT actually sent via Resend. This is useful for testing email
 * functionality during development without spamming residents.
 *
 * @param enabled - Whether debug mode should be enabled
 * @param recipient - Optional admin email to receive debug notifications (future use)
 * @returns Success status and any errors
 */
export async function updateEmailDebugMode(
  enabled: boolean,
  recipient?: string
): Promise<UpdateEmailDebugModeResult> {
  // Check permission
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  try {
    // Update debug mode setting
    const modeResult = await updateSetting('email_debug_mode', enabled ? 'true' : 'false');
    if (modeResult.error) {
      return { success: false, error: modeResult.error };
    }

    // Update recipient if provided
    if (recipient !== undefined) {
      const recipientResult = await updateSetting('email_debug_recipient', recipient);
      if (recipientResult.error) {
        return { success: false, error: recipientResult.error };
      }
    }

    // Audit log
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: 'email_debug_mode',
      entityDisplay: 'Email Debug Mode',
      oldValues: { enabled: !enabled },
      newValues: { enabled, recipient: recipient || null },
    });

    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Failed to update email debug mode';
    return { success: false, error: errorMessage };
  }
}
