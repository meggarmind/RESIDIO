import type { Json } from '@/types/database.generated';
import { getRawSettingsAsService } from '@/lib/settings/service';
import type { OverrideSettings, SettingsSnapshot } from './types';

export const OVERRIDE_SETTING_KEYS = {
  enabled: 'comms_override_enabled',
  email: 'comms_override_email',
  phone: 'comms_override_phone',
  whatsappPhone: 'comms_override_whatsapp_phone',
  debugMode: 'comms_debug_mode',
  debugExpiresAt: 'comms_debug_expires_at',
} as const;

/** Debug Mode duration setting and bounds (#717). Kept out of the send-time key list: the resolver never reads it. */
export const DEBUG_DURATION_KEY = 'comms_debug_duration_minutes';
export const DEBUG_DURATION_MIN = 5;
export const DEBUG_DURATION_MAX = 480;
export const DEBUG_DURATION_DEFAULT = 60;

export function isValidDebugDuration(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= DEBUG_DURATION_MIN && value <= DEBUG_DURATION_MAX;
}

/** The stored default duration as a number; absent, malformed or out of bounds falls back to 60. */
export function parseDebugDuration(value: Json | undefined): number {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return isValidDebugDuration(n) ? n : DEBUG_DURATION_DEFAULT;
}

/**
 * A switch value. Absent is off; `true`/`'true'` is on; `false`/`'false'` is
 * off; anything else is unrecognised and counts as ON, so a corrupted value can
 * only ever widen the redirect.
 */
export function parseSwitch(value: Json | undefined): boolean {
  if (value === undefined || value === null) return false;
  if (value === true || value === 'true') return true;
  if (value === false || value === 'false') return false;
  return true;
}

/** Strings only. A number (a phone that lost its leading zero) is treated as blank. */
function parseText(value: Json | undefined): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function parseOverrideSettings(values: Map<string, Json>): OverrideSettings {
  const k = OVERRIDE_SETTING_KEYS;
  const expiry = parseText(values.get(k.debugExpiresAt));
  return {
    enabled: parseSwitch(values.get(k.enabled)),
    email: parseText(values.get(k.email)),
    phone: parseText(values.get(k.phone)),
    whatsappPhone: parseText(values.get(k.whatsappPhone)),
    debugMode: parseSwitch(values.get(k.debugMode)),
    debugExpiresAt: expiry || null,
  };
}

/**
 * Loads the override settings with the service-role client and WITHOUT type
 * coercion (see `getRawSettingsAsService`). Never throws: a read failure
 * becomes an `error` snapshot, which the resolver turns into a block.
 */
export async function loadOverrideSettings(): Promise<SettingsSnapshot> {
  try {
    const result = await getRawSettingsAsService(Object.values(OVERRIDE_SETTING_KEYS));
    if (result.status === 'error') return { status: 'error', message: result.message };
    return { status: 'ok', settings: parseOverrideSettings(result.values) };
  } catch (error) {
    return { status: 'error', message: error instanceof Error ? error.message : 'unknown error' };
  }
}
