/** Formatting shared by the "Money in and out" summary reports (#1404). */
import { formatCalendarDate } from '@/lib/utils/calendar-date';

/** Money with 2 decimals and thousands separators. */
export const money = (amount: number) =>
  amount.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** `dd mmmm yyyy`, e.g. 02 November 2026 (CORE.md section 4). */
export const reportDate = (value: string) =>
  formatCalendarDate(value, 'en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

/** Rounds to cents so a sum of many amounts carries no float dust. */
export const cents = (amount: number) => Math.round(amount * 100) / 100;
