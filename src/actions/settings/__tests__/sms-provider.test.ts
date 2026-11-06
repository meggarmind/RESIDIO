import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  getSettingValueAsService: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: mocks.getSettingValueAsService }));

import { getSmsProviderStatus } from '@/actions/settings/sms-provider';
import { IMPLEMENTED_CHANNELS } from '@/lib/notifications/types';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.getSettingValueAsService.mockResolvedValue(null);
  vi.stubEnv('TERMII_API_KEY', 'termii-secret-value');
  vi.stubEnv('HOLLATAGS_USERNAME', 'holla-user-value');
  vi.stubEnv('HOLLATAGS_PASSWORD', 'holla-secret-value');
});

describe('getSmsProviderStatus (#1462)', () => {
  it('checks settings.manage_general first and reads nothing when refused', async () => {
    mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Forbidden' });
    expect(await getSmsProviderStatus()).toEqual({ data: null, error: 'Forbidden' });
    expect(mocks.authorizePermission).toHaveBeenCalledWith('settings.manage_general');
    expect(mocks.getSettingValueAsService).not.toHaveBeenCalled();
  });

  it('defaults to Termii when nothing is stored', async () => {
    const { data } = await getSmsProviderStatus();
    expect(data?.provider).toBe('termii');
    expect(mocks.getSettingValueAsService).toHaveBeenCalledWith('sms_provider');
  });

  it('reports HollaTags when it is stored, and Termii for an unknown value', async () => {
    mocks.getSettingValueAsService.mockResolvedValue('hollatags');
    expect((await getSmsProviderStatus()).data?.provider).toBe('hollatags');
    mocks.getSettingValueAsService.mockResolvedValue('twilio');
    expect((await getSmsProviderStatus()).data?.provider).toBe('termii');
  });

  it('reports whether each provider has its credentials', async () => {
    const { data } = await getSmsProviderStatus();
    expect(data?.providers).toEqual([
      { name: 'termii', label: 'Termii', configured: true },
      { name: 'hollatags', label: 'HollaTags', configured: true },
    ]);

    vi.stubEnv('TERMII_API_KEY', '');
    vi.stubEnv('HOLLATAGS_PASSWORD', '');
    const missing = await getSmsProviderStatus();
    expect(missing.data?.providers.map((p) => p.configured)).toEqual([false, false]);
  });

  it('reports SMS as switched off while sms is not an implemented channel', async () => {
    const { data } = await getSmsProviderStatus();
    expect(data?.smsSwitchedOn).toBe(IMPLEMENTED_CHANNELS.includes('sms'));
    expect(data?.smsSwitchedOn).toBe(false);
  });

  it('never returns a credential value', async () => {
    const json = JSON.stringify(await getSmsProviderStatus());
    for (const secret of ['termii-secret-value', 'holla-user-value', 'holla-secret-value']) {
      expect(json).not.toContain(secret);
    }
  });
});
