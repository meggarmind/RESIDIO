'use server';

import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { updateSetting } from './update-setting';
import { getCommsEnvironment } from '@/lib/comms-override/environment';
import { OVERRIDE_SETTING_KEYS, parseOverrideSettings } from '@/lib/comms-override/settings';
import { isValidOverrideEmail, isValidOverridePhone } from '@/lib/comms-override/resolver';

export interface CommsOverrideState {
  environment: 'production' | 'staging' | 'development';
  isProduction: boolean;
  /** The stored global switch. */
  storedEnabled: boolean;
  /** What the resolver uses: forced on outside production. */
  effectiveEnabled: boolean;
  email: string;
  phone: string;
  whatsappPhone: string;
}

const UpdateSchema = z.object({
  enabled: z.boolean(),
  email: z.string().trim().refine((v) => v === '' || isValidOverrideEmail(v), 'Enter a valid email address'),
  phone: z.string().trim().refine((v) => v === '' || isValidOverridePhone(v), 'Enter the phone in international format, e.g. +2348012345678'),
  whatsappPhone: z.string().trim().refine((v) => v === '' || isValidOverridePhone(v), 'Enter the WhatsApp number in international format, e.g. +2348012345678'),
});

export type UpdateCommsOverrideInput = z.input<typeof UpdateSchema>;

/** Effective state of the communications override, for the settings page. */
export async function getCommsOverrideState(): Promise<{ data: CommsOverrideState | null; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const read = await getRawSettingsAsService(Object.values(OVERRIDE_SETTING_KEYS));
  if (read.status === 'error') return { data: null, error: 'Failed to load override settings' };

  const settings = parseOverrideSettings(read.values);
  const environment = getCommsEnvironment();
  return {
    data: {
      environment: environment.env,
      isProduction: environment.isProduction,
      storedEnabled: settings.enabled,
      effectiveEnabled: !environment.isProduction || settings.enabled,
      email: settings.email,
      phone: settings.phone,
      whatsappPhone: settings.whatsappPhone,
    },
    error: null,
  };
}

/**
 * Saves the override contacts and (in production only) the global switch.
 * Outside production the switch is forced on and cannot be turned off, so the
 * submitted `enabled` is ignored there.
 */
export async function updateCommsOverrideSettings(
  input: UpdateCommsOverrideInput
): Promise<{ success: boolean; error: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized' };

  const parsed = UpdateSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' };
  }
  const values = parsed.data;
  const { isProduction } = getCommsEnvironment();

  const writes: Array<[string, string | boolean]> = [
    [OVERRIDE_SETTING_KEYS.email, values.email],
    [OVERRIDE_SETTING_KEYS.phone, values.phone],
    [OVERRIDE_SETTING_KEYS.whatsappPhone, values.whatsappPhone],
  ];
  if (isProduction) writes.unshift([OVERRIDE_SETTING_KEYS.enabled, values.enabled]);

  let firstId: string | null = null;
  for (const [key, value] of writes) {
    const result = await updateSetting(key, value);
    if (result.error) return { success: false, error: result.error };
    firstId ??= result.data?.id ?? null;
  }

  if (firstId) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: firstId,
      entityDisplay: 'Communications override',
      newValues: {
        ...(isProduction ? { comms_override_enabled: values.enabled } : {}),
        comms_override_email: values.email,
        comms_override_phone: values.phone,
        comms_override_whatsapp_phone: values.whatsappPhone,
      },
      description: 'Updated communications override settings',
    });
  }

  return { success: true, error: null };
}
