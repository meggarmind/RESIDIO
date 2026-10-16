import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  updateSetting: vi.fn(),
  getRawSettingsAsService: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting: mocks.updateSetting }));
vi.mock('@/lib/settings/service', () => ({ getRawSettingsAsService: mocks.getRawSettingsAsService }));

import { getCommsOverrideState, updateCommsOverrideSettings } from '@/actions/settings/comms-override';

const valid = { enabled: true, email: 'override@example.test', phone: '+15550100100', whatsappPhone: '' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'production');
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.updateSetting.mockResolvedValue({ data: { id: 'row-1' }, error: null });
});

describe('updateCommsOverrideSettings', () => {
  it('writes nothing and audits nothing when unauthorized', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    const result = await updateCommsOverrideSettings(valid);
    expect(result).toEqual({ success: false, error: 'nope' });
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('rejects a phone that is not E.164 before writing', async () => {
    const result = await updateCommsOverrideSettings({ ...valid, phone: '08012345678' });
    expect(result.success).toBe(false);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it('rejects an invalid email before writing', async () => {
    expect((await updateCommsOverrideSettings({ ...valid, email: 'nope' })).success).toBe(false);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it('writes the switch and the three contacts in production and audits once', async () => {
    const result = await updateCommsOverrideSettings(valid);
    expect(result).toEqual({ success: true, error: null });
    expect(mocks.updateSetting.mock.calls.map((c) => c[0])).toEqual([
      'comms_override_enabled',
      'comms_override_email',
      'comms_override_phone',
      'comms_override_whatsapp_phone',
    ]);
    expect(mocks.updateSetting).toHaveBeenCalledWith('comms_override_phone', '+15550100100');
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
  });

  it('does not write the switch outside production, so it cannot be turned off', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    await updateCommsOverrideSettings({ ...valid, enabled: false });
    expect(mocks.updateSetting.mock.calls.map((c) => c[0])).not.toContain('comms_override_enabled');
  });

  it('stops and reports when a write fails, without auditing', async () => {
    mocks.updateSetting.mockResolvedValueOnce({ data: { id: 'row-1' }, error: null });
    mocks.updateSetting.mockResolvedValueOnce({ data: null, error: 'Failed to update setting' });
    const result = await updateCommsOverrideSettings(valid);
    expect(result).toEqual({ success: false, error: 'Failed to update setting' });
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });
});

describe('getCommsOverrideState', () => {
  it('forces the effective switch on outside production regardless of the stored value', async () => {
    vi.stubEnv('NEXT_PUBLIC_APP_ENV', 'staging');
    mocks.getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map([['comms_override_enabled', 'false']]) });
    const { data } = await getCommsOverrideState();
    expect(data).toMatchObject({ isProduction: false, storedEnabled: false, effectiveEnabled: true });
  });

  it('follows the stored switch in production', async () => {
    mocks.getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map([['comms_override_enabled', 'false']]) });
    const { data } = await getCommsOverrideState();
    expect(data).toMatchObject({ isProduction: true, effectiveEnabled: false });
  });

  it('returns an error rather than state when unauthorized', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    expect(await getCommsOverrideState()).toEqual({ data: null, error: 'nope' });
    expect(mocks.getRawSettingsAsService).not.toHaveBeenCalled();
  });
});
