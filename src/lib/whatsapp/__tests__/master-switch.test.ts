import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import { getSettingResultAsService } from '@/lib/settings/service';

vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn() }));

describe('isWhatsAppMasterSwitchOn', () => {
  beforeEach(() => vi.clearAllMocks());

  it('is on only when whatsapp_enabled is true', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: true });
    expect(await isWhatsAppMasterSwitchOn()).toEqual({ on: true });
    expect(getSettingResultAsService).toHaveBeenCalledWith('whatsapp_enabled');
  });

  it('is off when the value is false', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: false });
    expect(await isWhatsAppMasterSwitchOn()).toEqual({ on: false, reason: 'disabled' });
  });

  it('is off for a non-boolean value (fails closed)', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: 'true' });
    expect(await isWhatsAppMasterSwitchOn()).toEqual({ on: false, reason: 'disabled' });
  });

  it('is off when the setting is absent', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'absent' });
    expect(await isWhatsAppMasterSwitchOn()).toEqual({ on: false, reason: 'absent' });
  });

  it('is off when the read errors', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'error', message: 'boom' });
    expect(await isWhatsAppMasterSwitchOn()).toEqual({ on: false, reason: 'error' });
  });
});
