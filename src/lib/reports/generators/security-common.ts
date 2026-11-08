/**
 * Shared by the Security reports (#1405): Visitor and access log, Access codes due to expire.
 * No authorization here: the callers check REPORTS_VIEW_SECURITY first (see report-generator.ts).
 */

export type Embed<T> = T | T[] | null;
export const one = <T,>(value: Embed<T>): T | null => (Array.isArray(value) ? value[0] ?? null : value);

/** Estate time: Lagos is UTC+1 all year, with no daylight saving. */
export const LAGOS_OFFSET_HOURS = 1;
const HOUR_MS = 60 * 60 * 1000;
export const DAY_MS = 24 * HOUR_MS;

/** The Lagos calendar day of an instant, as `YYYY-MM-DD`. */
export function lagosDay(iso: string): string {
  return new Date(new Date(iso).getTime() + LAGOS_OFFSET_HOURS * HOUR_MS).toISOString().slice(0, 10);
}

/** The Lagos hour of day (0-23) of an instant. */
export function lagosHour(iso: string): number {
  return new Date(new Date(iso).getTime() + LAGOS_OFFSET_HOURS * HOUR_MS).getUTCHours();
}

/** The instant a Lagos day starts, as an ISO string (`2026-11-01` is `2026-10-31T23:00:00.000Z`). */
export function lagosDayStartIso(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) - LAGOS_OFFSET_HOURS * HOUR_MS).toISOString();
}

/** The Lagos day after `day`, as `YYYY-MM-DD`. */
export function nextDay(day: string): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + DAY_MS).toISOString().slice(0, 10);
}

/** `08:00` style label for an hour of day. */
export const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/** `02 Nov 2026 14:05` in Lagos time (month as a name, CORE.md section 4). */
export function lagosDateTime(iso: string): string {
  const day = new Date(new Date(iso).getTime() + LAGOS_OFFSET_HOURS * HOUR_MS);
  const date = day.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
  const time = day.toISOString().slice(11, 16);
  return `${date} ${time}`;
}

type HouseEmbed = Embed<{ house_number: string; short_name: string | null; street: Embed<{ name: string }> }>;
export type ResidentHouseEmbed = Embed<{
  is_active: boolean | null;
  is_primary: boolean | null;
  house: HouseEmbed;
}>;

/** The resident's house as "12, Palm Close": the active primary link first, then any active one. */
export function residentHouseLabel(links: ResidentHouseEmbed | ResidentHouseEmbed[] | undefined): string {
  const flat = (Array.isArray(links) ? links : [links]).flatMap((l) => (Array.isArray(l) ? l : [l])).filter((l): l is NonNullable<typeof l> => !!l);
  const active = flat.filter((l) => l.is_active !== false);
  const pick = active.find((l) => l.is_primary) ?? active[0];
  const house = one(pick?.house ?? null);
  if (!house) return 'No house';
  const street = one(house.street)?.name;
  return street ? `${house.house_number}, ${street}` : house.house_number;
}
