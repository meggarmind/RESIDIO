import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

import { getCommsOverrideState, updateCommsOverrideSettings, setDebugMode } from '@/actions/settings/comms-override';

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

  it('reports Debug Mode as effective only with an unexpired expiry', async () => {
    const future = new Date(Date.now() + 600_000).toISOString();
    mocks.getRawSettingsAsService.mockResolvedValue({
      status: 'ok',
      values: new Map<string, unknown>([['comms_debug_mode', 'true'], ['comms_debug_expires_at', future], ['comms_debug_duration_minutes', '90']]),
    });
    const { data } = await getCommsOverrideState();
    expect(data).toMatchObject({ debugMode: true, debugEffective: true, debugExpiresAt: future, debugDurationMinutes: 90, debugMissingExpiry: false });
  });

  it('flags a switch that is on with no expiry as not effective', async () => {
    mocks.getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map<string, unknown>([['comms_debug_mode', 'true']]) });
    const { data } = await getCommsOverrideState();
    expect(data).toMatchObject({ debugMode: true, debugEffective: false, debugMissingExpiry: true });
  });

  it('flags an unparseable expiry, which keeps the redirect on', async () => {
    mocks.getRawSettingsAsService.mockResolvedValue({
      status: 'ok',
      values: new Map<string, unknown>([['comms_debug_mode', 'true'], ['comms_debug_expires_at', 'garbage']]),
    });
    const { data } = await getCommsOverrideState();
    expect(data).toMatchObject({ debugEffective: true, debugExpiryUnparseable: true });
  });
});

describe('setDebugMode', () => {
  const NOW = new Date('2026-10-17T12:00:00.000Z');
  const configured = (extra: Record<string, unknown> = {}) =>
    mocks.getRawSettingsAsService.mockResolvedValue({
      status: 'ok',
      values: new Map<string, unknown>(
        Object.entries({
          comms_override_email: 'override@example.test',
          comms_override_phone: '+15550100100',
          comms_override_whatsapp_phone: '',
          comms_debug_duration_minutes: 60,
          ...extra,
        })
      ),
    });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    configured();
  });
  afterEach(() => vi.useRealTimers());

  it('writes nothing and audits nothing when unauthorized', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'nope' });
    expect(await setDebugMode({ enabled: true })).toMatchObject({ success: false, error: 'nope' });
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('checks permission before reading any setting', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false });
    await setDebugMode({ enabled: true });
    expect(mocks.getRawSettingsAsService).not.toHaveBeenCalled();
  });

  it.each([
    ['blank email', { comms_override_email: '' }],
    ['invalid email', { comms_override_email: 'nope' }],
    ['blank phone', { comms_override_phone: '' }],
    ['non-E.164 phone', { comms_override_phone: '08012345678' }],
    ['invalid WhatsApp number', { comms_override_whatsapp_phone: '12345' }],
  ])('refuses to enable with a %s', async (_label, extra) => {
    configured(extra);
    const result = await setDebugMode({ enabled: true });
    expect(result.success).toBe(false);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('lets WhatsApp fall back to the override phone when no WhatsApp number is set', async () => {
    configured({ comms_override_whatsapp_phone: '' });
    expect((await setDebugMode({ enabled: true })).success).toBe(true);
  });

  it.each([4, 481, 12.5])('rejects a duration of %s minutes', async (durationMinutes) => {
    expect((await setDebugMode({ enabled: true, durationMinutes })).success).toBe(false);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });

  it.each([5, 480])('accepts the boundary duration of %s minutes', async (durationMinutes) => {
    expect((await setDebugMode({ enabled: true, durationMinutes })).success).toBe(true);
  });

  it('enabling sets the expiry from the requested duration, writing the expiry before the switch', async () => {
    const result = await setDebugMode({ enabled: true, durationMinutes: 30 });
    const expiry = new Date(NOW.getTime() + 30 * 60_000).toISOString();
    expect(result).toEqual({ success: true, error: null, expiresAt: expiry });
    expect(mocks.updateSetting.mock.calls).toEqual([
      ['comms_debug_expires_at', expiry],
      ['comms_debug_mode', true],
    ]);
  });

  it('defaults the duration to the stored setting', async () => {
    configured({ comms_debug_duration_minutes: '90' });
    const result = await setDebugMode({ enabled: true });
    expect(result.expiresAt).toBe(new Date(NOW.getTime() + 90 * 60_000).toISOString());
  });

  it('audits an enable with the actor entry, duration and expiry', async () => {
    await setDebugMode({ enabled: true, durationMinutes: 30 });
    expect(mocks.logAudit).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'ACTIVATE',
        entityType: 'system_settings',
        entityId: 'row-1',
        newValues: expect.objectContaining({ debug_mode: true, duration_minutes: 30, expires_at: new Date(NOW.getTime() + 30 * 60_000).toISOString() }),
      })
    );
  });

  it('does not turn the switch on when writing the expiry fails', async () => {
    mocks.updateSetting.mockResolvedValueOnce({ data: null, error: 'Failed to update setting' });
    const result = await setDebugMode({ enabled: true, durationMinutes: 30 });
    expect(result.success).toBe(false);
    expect(mocks.updateSetting).toHaveBeenCalledTimes(1);
    expect(mocks.logAudit).not.toHaveBeenCalled();
  });

  it('disabling turns the switch off first, then clears the expiry, and audits', async () => {
    configured({ comms_debug_mode: 'true', comms_debug_expires_at: '2026-10-17T12:30:00.000Z' });
    const result = await setDebugMode({ enabled: false });
    expect(result).toEqual({ success: true, error: null, expiresAt: null });
    expect(mocks.updateSetting.mock.calls).toEqual([
      ['comms_debug_mode', false],
      ['comms_debug_expires_at', ''],
    ]);
    expect(mocks.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'DEACTIVATE',
        oldValues: expect.objectContaining({ debug_mode: true, expires_at: '2026-10-17T12:30:00.000Z' }),
        newValues: expect.objectContaining({ debug_mode: false, expires_at: null }),
      })
    );
  });

  it('can be disabled even when the override contacts are blank', async () => {
    configured({ comms_override_email: '', comms_override_phone: '' });
    expect((await setDebugMode({ enabled: false })).success).toBe(true);
  });

  it('fails when the settings cannot be read, writing nothing', async () => {
    mocks.getRawSettingsAsService.mockResolvedValue({ status: 'error', message: 'down' });
    expect((await setDebugMode({ enabled: true })).success).toBe(false);
    expect(mocks.updateSetting).not.toHaveBeenCalled();
  });
});
