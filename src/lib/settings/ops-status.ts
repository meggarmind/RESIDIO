import type { Json } from '@/types/database.generated';
import { isMaintenanceModeOn } from '@/lib/settings/maintenance-mode';
import { getCommsEnvironment } from '@/lib/comms-override/environment';
import { parseSwitch } from '@/lib/comms-override/switch';

/**
 * Whether maintenance mode and the communications override are on, for the
 * dashboard banner and the Settings status dot (#789).
 *
 * The middleware already reads `maintenance_mode` on every signed-in request,
 * so it reads `comms_override_enabled` in the same query and hands the result
 * to the browser in a cookie. The banner therefore costs no request of its own.
 * The cookie only drives what an admin is shown; nothing enforces from it.
 *
 * Edge-safe: no import may reach the server-only settings service.
 */
export const OPS_STATUS_COOKIE = 'residio_ops_status';

/** `comms_override_enabled` is `OVERRIDE_SETTING_KEYS.enabled`, written out because that module is server-only. */
export const OPS_STATUS_KEYS = ['maintenance_mode', 'comms_override_enabled'] as const;

export interface OpsStatus {
  maintenance: boolean;
  /** The effective override, as the resolver sees it: forced on outside production. */
  commsOverride: boolean;
}

export function opsStatusFromRows(
  rows: { key: string; value: Json }[],
  isProduction: boolean = getCommsEnvironment().isProduction
): OpsStatus {
  const value = (key: string) => rows.find((row) => row.key === key)?.value;
  return {
    maintenance: isMaintenanceModeOn(value('maintenance_mode')),
    commsOverride: !isProduction || parseSwitch(value('comms_override_enabled')),
  };
}

/** Two digits, maintenance then override: `'10'` is maintenance on, override off. */
export function encodeOpsStatus(status: OpsStatus): string {
  return `${Number(status.maintenance)}${Number(status.commsOverride)}`;
}

/** Null for an absent or malformed cookie, so a stale browser shows nothing rather than guessing. */
export function decodeOpsStatus(raw: string | undefined | null): OpsStatus | null {
  if (!raw || !/^[01]{2}$/.test(raw)) return null;
  return { maintenance: raw[0] === '1', commsOverride: raw[1] === '1' };
}
