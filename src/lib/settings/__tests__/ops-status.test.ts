import { describe, expect, it } from 'vitest';
import { OVERRIDE_SETTING_KEYS } from '@/lib/comms-override/settings';
import { OPS_STATUS_KEYS, decodeOpsStatus, encodeOpsStatus, opsStatusFromRows } from '@/lib/settings/ops-status';

describe('ops status (#789)', () => {
  it('reads the same override key the resolver reads', () => {
    expect(OPS_STATUS_KEYS).toContain(OVERRIDE_SETTING_KEYS.enabled);
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
