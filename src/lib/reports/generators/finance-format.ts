import { formatCalendarDate } from '@/lib/utils/calendar-date';

/** Money with two decimals and thousands separators. */
export const formatMoney = (amount: number) =>
  amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `02 November 2026` style date for report output (CORE.md section 4). */
export const formatLongDate = (value: string) =>
  formatCalendarDate(value, 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

/** Rounds to cents so sums of many amounts do not carry float noise. */
export const roundMoney = (amount: number) => Math.round((amount + Number.EPSILON) * 100) / 100;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** `October 2026` for a `YYYY-MM` key. */
export const monthName = (key: string) => `${MONTH_NAMES[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** `YYYY-MM` keys from the month of `start` to the month of `end`, both `YYYY-MM-DD`. Empty when the range is unusable. */
export function monthKeysInRange(start: string, end: string): string[] {
  const from = start.slice(0, 7);
  const to = end.slice(0, 7);
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/;
  if (!valid.test(from) || !valid.test(to) || from > to) return [];
  const keys: string[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  while (`${y}-${String(m).padStart(2, '0')}` <= to) {
    keys.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) { m = 1; y++; }
  }
  return keys;
}
