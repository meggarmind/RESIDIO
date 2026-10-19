/**
 * Reads the maintenance_mode setting (#808). The column is jsonb and
 * updateSetting stores booleans as the strings 'true' / 'false', while older
 * rows hold a real boolean, so both forms must be accepted. Every reader of
 * the setting goes through here so the middleware, the public status endpoint
 * and the settings page cannot disagree about whether maintenance is on.
 */
export function isMaintenanceModeOn(value: unknown): boolean {
  return value === true || value === 'true';
}
