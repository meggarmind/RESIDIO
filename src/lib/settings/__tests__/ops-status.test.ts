import { describe, expect, it } from 'vitest';
import { OVERRIDE_SETTING_KEYS } from '@/lib/comms-override/settings';
import { OPS_STATUS_KEYS, decodeOpsStatus, encodeOpsStatus, opsStatusFromRows } from '@/lib/settings/ops-status';

describe('ops status (#789)', () => {
  it('reads the same override key the resolver reads', () => {
    expect(OPS_STATUS_KEYS).toContain(OVERRIDE_SETTING_KEYS.enabled);
    expect(OPS_STATUS_KEYS).toContain(OVERRIDE_SETTING_KEYS.debugMode);
    expect(OPS_STATUS_KEYS).toContain(OVERRIDE_SETTING_KEYS.debugExpiresAt);
  });

  it('reads maintenance in both stored forms', () => {
    expect(opsStatusFromRows([{ key: 'maintenance_mode', value: 'true' }], true).maintenance).toBe(true);
    expect(opsStatusFromRows([{ key: 'maintenance_mode', value: true }], true).maintenance).toBe(true);
    expect(opsStatusFromRows([{ key: 'maintenance_mode', value: 'false' }], true).maintenance).toBe(false);
    expect(opsStatusFromRows([], true).maintenance).toBe(false);
  });

  it('follows the stored override switch in production', () => {
    expect(opsStatusFromRows([{ key: 'comms_override_enabled', value: 'true' }], true).commsOverride).toBe(true);
    expect(opsStatusFromRows([{ key: 'comms_override_enabled', value: false }], true).commsOverride).toBe(false);
    expect(opsStatusFromRows([], true).commsOverride).toBe(false);
  });

  it('reports the override on outside production, where the resolver forces it on', () => {
    expect(opsStatusFromRows([{ key: 'comms_override_enabled', value: 'false' }], false).commsOverride).toBe(true);
  });

  it('reports the override on in production while Debug Mode redirects, with the switch off', () => {
    const now = new Date('2026-10-20T12:00:00Z');
    const rows = (expiresAt: string) => [
      { key: 'comms_override_enabled', value: false },
      { key: 'comms_debug_mode', value: true },
      { key: 'comms_debug_expires_at', value: expiresAt },
    ];
    expect(opsStatusFromRows(rows('2026-10-20T13:00:00Z'), true, now).commsOverride).toBe(true);
    expect(opsStatusFromRows(rows('not a date'), true, now).commsOverride).toBe(true);
    expect(opsStatusFromRows(rows('2026-10-20T11:00:00Z'), true, now).commsOverride).toBe(false);
    expect(opsStatusFromRows(rows(''), true, now).commsOverride).toBe(false);
    expect(
      opsStatusFromRows(
        [
          { key: 'comms_debug_mode', value: false },
          { key: 'comms_debug_expires_at', value: '2026-10-20T13:00:00Z' },
        ],
        true,
        now
      ).commsOverride
    ).toBe(false);
  });

  it('round-trips through the cookie value and rejects anything else', () => {
    for (const status of [
      { maintenance: false, commsOverride: false },
      { maintenance: true, commsOverride: false },
      { maintenance: false, commsOverride: true },
      { maintenance: true, commsOverride: true },
    ]) {
      expect(decodeOpsStatus(encodeOpsStatus(status))).toEqual(status);
    }
    for (const bad of [undefined, null, '', '1', '102', 'ab', 'true']) {
      expect(decodeOpsStatus(bad)).toBeNull();
    }
  });
});
