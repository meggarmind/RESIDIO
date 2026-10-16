'use server';

import { z } from 'zod';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { updateSetting } from './update-setting';
import { getCommsEnvironment } from '@/lib/comms-override/environment';
import {
  DEBUG_DURATION_KEY,
  DEBUG_DURATION_MAX,
  DEBUG_DURATION_MIN,
  OVERRIDE_SETTING_KEYS,
  parseDebugDuration,
  parseOverrideSettings,
} from '@/lib/comms-override/settings';
import { isDebugEffective, isValidOverrideEmail, isValidOverridePhone } from '@/lib/comms-override/resolver';

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
  /** Debug Mode as stored. */
  debugMode: boolean;
  /** Stored expiry (ISO), or null when blank. */
  debugExpiresAt: string | null;
  /** What the resolver uses right now: switch on and an unexpired expiry. */
  debugEffective: boolean;
  /** The switch is on but the stored expiry cannot be parsed (the redirect stays on). */
  debugExpiryUnparseable: boolean;
  /** The switch is on with no expiry stored, so Debug Mode counts as expired. */
  debugMissingExpiry: boolean;
  /** Default duration for enabling, in minutes. */
  debugDurationMinutes: number;
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

  const read = await getRawSettingsAsService([...Object.values(OVERRIDE_SETTING_KEYS), DEBUG_DURATION_KEY]);
  if (read.status === 'error') return { data: null, error: 'Failed to load override settings' };

  const settings = parseOverrideSettings(read.values);
  const environment = getCommsEnvironment();
  const expiryUnparseable =
    settings.debugMode && settings.debugExpiresAt !== null && Number.isNaN(Date.parse(settings.debugExpiresAt));
  return {
    data: {
      environment: environment.env,
      isProduction: environment.isProduction,
      storedEnabled: settings.enabled,
      effectiveEnabled: !environment.isProduction || settings.enabled,
      email: settings.email,
      phone: settings.phone,
      whatsappPhone: settings.whatsappPhone,
      debugMode: settings.debugMode,
      debugExpiresAt: settings.debugExpiresAt,
      debugEffective: isDebugEffective(settings.debugMode, settings.debugExpiresAt, new Date()),
      debugExpiryUnparseable: expiryUnparseable,
      debugMissingExpiry: settings.debugMode && settings.debugExpiresAt === null,
      debugDurationMinutes: parseDebugDuration(read.values.get(DEBUG_DURATION_KEY)),
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

const DebugSchema = z.object({
  enabled: z.boolean(),
  durationMinutes: z
    .number()
    .int('Duration must be a whole number of minutes')
    .min(DEBUG_DURATION_MIN, `Duration must be at least ${DEBUG_DURATION_MIN} minutes`)
    .max(DEBUG_DURATION_MAX, `Duration must be at most ${DEBUG_DURATION_MAX} minutes`)
    .optional(),
});

export type SetDebugModeInput = z.input<typeof DebugSchema>;

/**
 * Turns Debug Mode on (with an expiry) or off.
 *
 * Enabling is refused while the override email, the override phone or the
 * WhatsApp number it would use is blank or invalid: Debug Mode redirects
 * everything, so a blank value would block every message. The expiry is written
 * BEFORE the switch is turned on, and turning it off clears the switch FIRST, so
 * a failure part-way never leaves the switch on without an expiry.
 */
export async function setDebugMode(
  input: SetDebugModeInput
): Promise<{ success: boolean; error: string | null; expiresAt: string | null }> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_GENERAL);
  if (!auth.authorized) return { success: false, error: auth.error || 'Unauthorized', expiresAt: null };

  const parsed = DebugSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input', expiresAt: null };
  }
  const { enabled, durationMinutes } = parsed.data;

  const settingKeys = [...Object.values(OVERRIDE_SETTING_KEYS), DEBUG_DURATION_KEY];

  if (!enabled) {
    // Turning Debug Mode off must always work. The read below only supplies the
    // audit old-values, so a failed read is logged and the audit goes without them.
    let oldValues: Record<string, unknown> | undefined;
    try {
      const before = await getRawSettingsAsService(settingKeys);
      if (before.status === 'ok') {
        const prior = parseOverrideSettings(before.values);
        oldValues = { debug_mode: prior.debugMode, expires_at: prior.debugExpiresAt };
      } else {
        console.error('[setDebugMode] could not read the prior Debug Mode state for the audit entry:', before.message);
      }
    } catch (error) {
      console.error('[setDebugMode] could not read the prior Debug Mode state for the audit entry:', error);
    }

    const off = await updateSetting(OVERRIDE_SETTING_KEYS.debugMode, false);
    if (off.error) return { success: false, error: off.error, expiresAt: null };
    const cleared = await updateSetting(OVERRIDE_SETTING_KEYS.debugExpiresAt, '');
    const rowId = off.data?.id ?? cleared.data?.id;
    if (rowId) {
      await logAudit({
        action: 'DEACTIVATE',
        entityType: 'system_settings',
        entityId: rowId,
        entityDisplay: 'Debug Mode',
        ...(oldValues ? { oldValues } : {}),
        newValues: { debug_mode: false, expires_at: null },
        description: 'Debug Mode turned off',
      });
    }
    if (cleared.error) {
      return { success: false, error: 'Debug Mode is off, but its expiry could not be cleared', expiresAt: null };
    }
    return { success: true, error: null, expiresAt: null };
  }

  const read = await getRawSettingsAsService(settingKeys);
  if (read.status === 'error') return { success: false, error: 'Failed to load override settings', expiresAt: null };
  const settings = parseOverrideSettings(read.values);

  if (!isValidOverrideEmail(settings.email)) {
    return { success: false, error: 'Set a valid override email before enabling Debug Mode', expiresAt: null };
  }
  if (!isValidOverridePhone(settings.phone)) {
    return { success: false, error: 'Set a valid override phone before enabling Debug Mode', expiresAt: null };
  }
  if (settings.whatsappPhone !== '' && !isValidOverridePhone(settings.whatsappPhone)) {
    return { success: false, error: 'The WhatsApp override number is invalid; fix it before enabling Debug Mode', expiresAt: null };
  }

  const minutes = durationMinutes ?? parseDebugDuration(read.values.get(DEBUG_DURATION_KEY));
  const expiresAt = new Date(Date.now() + minutes * 60_000).toISOString();

  const expiry = await updateSetting(OVERRIDE_SETTING_KEYS.debugExpiresAt, expiresAt);
  if (expiry.error) return { success: false, error: expiry.error, expiresAt: null };
  const on = await updateSetting(OVERRIDE_SETTING_KEYS.debugMode, true);
  if (on.error) return { success: false, error: on.error, expiresAt: null };

  const rowId = on.data?.id ?? expiry.data?.id;
  if (rowId) {
    await logAudit({
      action: 'ACTIVATE',
      entityType: 'system_settings',
      entityId: rowId,
      entityDisplay: 'Debug Mode',
      oldValues: { debug_mode: settings.debugMode, expires_at: settings.debugExpiresAt },
      newValues: { debug_mode: true, duration_minutes: minutes, expires_at: expiresAt },
      description: `Debug Mode turned on for ${minutes} minutes`,
    });
  }

  return { success: true, error: null, expiresAt };
}
