/**
 * Calendar-date helpers.
 *
 * A bank-statement date is a calendar day with no time zone (the database
 * column is DATE). It is carried through the app as a `Date` at 00:00 UTC of
 * that day, and only ever read back with UTC accessors or formatted in UTC.
 * Local midnight (`new Date(y, m, d)`) must never be used: it serialises with
 * `toISOString()` to the previous day east of UTC (Nigeria is UTC+1).
 */

/** The calendar day y-m-d (month is 1-12) as a Date at 00:00 UTC. */
export function calendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

/** The calendar day a local-time Date falls on, as a Date at 00:00 UTC. */
export function calendarDateFromLocal(date: Date): Date {
  return calendarDate(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** 'YYYY-MM-DD' for a calendar Date (read with UTC accessors). */
export function toCalendarDateString(date: Date): string {
  const y = String(date.getUTCFullYear()).padStart(4, '0');
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Format a calendar date (a Date from the parsers, or a 'YYYY-MM-DD' / ISO
 * string from the database) without re-interpreting it in the viewer's zone.
 */
export function formatCalendarDate(
  value: Date | string,
  locale?: string | string[],
  options?: Intl.DateTimeFormatOptions
): string {
  const date = typeof value === 'string' ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : value;
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString(locale, { ...options, timeZone: 'UTC' });
}
