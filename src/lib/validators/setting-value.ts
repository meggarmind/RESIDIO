import { MAX_MONEY_AMOUNT, validateMoneyAmount } from '@/lib/validators/money';
import { isValidOverrideEmail, isValidOverridePhone } from '@/lib/comms-override/resolver';
import { DEBUG_DURATION_MAX, DEBUG_DURATION_MIN, isValidDebugDuration } from '@/lib/comms-override/limits';

/**
 * Conservative sanity rules for system_settings values (issue #466).
 *
 * Only keys whose meaning is unambiguous from the settings catalogue are
 * bounded: durations (`*_days`, `*_hours`, `*_minutes`) and the late-fee amount.
 * Every other key is only checked for NaN/Infinity. Non-numeric values and
 * arrays (e.g. `payment_reminder_days`) are left alone.
 */
const DURATION_LIMITS: Array<{ suffix: string; max: number }> = [
  { suffix: '_days', max: 3650 },
  { suffix: '_hours', max: 8760 },
  { suffix: '_minutes', max: 10080 },
];

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '' && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return null;
}

/** Clock slack allowed on top of the longest Debug Mode duration when checking an expiry. */
const DEBUG_EXPIRY_SLACK_MINUTES = 5;

const isBoolLike = (v: unknown) => typeof v === 'boolean' || v === 'true' || v === 'false';

/**
 * Communications override settings (#713, #717). These are a data-exposure
 * control, so the generic writers must not accept values the dedicated actions
 * would refuse: an expiry far in the future (Debug Mode that never ends), a
 * malformed override contact, or a non-boolean switch. Returns undefined for a
 * key that is not a comms setting.
 */
function commsSettingError(key: string, value: unknown, now: Date): string | null | undefined {
  switch (key) {
    case 'comms_override_enabled':
    case 'comms_debug_mode':
      return isBoolLike(value) ? null : `Setting "${key}" must be true or false`;
    case 'comms_override_email':
      return typeof value === 'string' && (value.trim() === '' || isValidOverrideEmail(value.trim()))
        ? null
        : `Setting "${key}" must be blank or a valid email address`;
    case 'comms_override_phone':
    case 'comms_override_whatsapp_phone':
      return typeof value === 'string' && (value.trim() === '' || isValidOverridePhone(value.trim()))
        ? null
        : `Setting "${key}" must be blank or a phone number in international format, e.g. +2348012345678`;
    case 'comms_debug_duration_minutes': {
      const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
      return isValidDebugDuration(n)
        ? null
        : `Setting "${key}" must be a whole number of minutes from ${DEBUG_DURATION_MIN} to ${DEBUG_DURATION_MAX}`;
    }
    case 'comms_debug_expires_at': {
      if (typeof value !== 'string') return `Setting "${key}" must be blank or an ISO timestamp`;
      if (value.trim() === '') return null;
      const at = Date.parse(value);
      if (Number.isNaN(at)) return `Setting "${key}" must be blank or an ISO timestamp`;
      const latest = now.getTime() + (DEBUG_DURATION_MAX + DEBUG_EXPIRY_SLACK_MINUTES) * 60_000;
      return at <= latest ? null : `Setting "${key}" cannot be more than ${DEBUG_DURATION_MAX} minutes ahead`;
    }
    default:
      return undefined;
  }
}

/** Returns an error message, or null when the value is acceptable. */
export function settingValueError(key: string, value: unknown, now: Date = new Date()): string | null {
  const comms = commsSettingError(key, value, now);
  if (comms !== undefined) return comms;

  if (typeof value === 'number' && !Number.isFinite(value)) {
    return `Setting "${key}" must be a finite number`;
  }

  const n = toNumber(value);
  if (n === null) return null;
  if (!Number.isFinite(n)) return `Setting "${key}" must be a finite number`;

  const duration = DURATION_LIMITS.find((d) => key.endsWith(d.suffix));
  if (duration) {
    if (n < 0 || n > duration.max || !Number.isInteger(n)) {
      return `Setting "${key}" must be a whole number between 0 and ${duration.max}`;
    }
    return null;
  }

  if (key === 'late_fee_amount') {
    // Either a percentage or a naira amount, so only the money bounds apply.
    return validateMoneyAmount(n, { label: `Setting "${key}"`, allowZero: true, max: MAX_MONEY_AMOUNT });
  }
  return null;
}
