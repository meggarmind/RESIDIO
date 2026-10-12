import { MAX_MONEY_AMOUNT, validateMoneyAmount } from '@/lib/validators/money';

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

/** Returns an error message, or null when the value is acceptable. */
export function settingValueError(key: string, value: unknown): string | null {
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
