import { describe, it, expect, vi, beforeEach } from 'vitest';

const getRawSettingsAsService = vi.fn();
const getSettings = vi.fn();

vi.mock('@/lib/settings/service', () => ({
  getRawSettingsAsService: (...a: unknown[]) => getRawSettingsAsService(...a),
  getSettingValueAsService: vi.fn(),
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettings: (...a: unknown[]) => getSettings(...a) }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

import { getEstateEmailSettings } from '@/lib/email/send-email';

describe('getEstateEmailSettings (#1198)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getSettings.mockResolvedValue({ data: [], error: null }); // what an anonymous cron request sees under RLS
  });

  it('returns stored values with no session, reading estate_website_url', async () => {
    getRawSettingsAsService.mockResolvedValue({
      status: 'ok',
      values: new Map([
        ['estate_name', 'Palm Court'],
        ['estate_email', 'office@palm.test'],
        ['estate_phone', '08012345678'],
        ['estate_address', '1 Palm Rd'],
        ['estate_website_url', 'https://palm.test'],
      ]),
    });

    await expect(getEstateEmailSettings()).resolves.toEqual({
      estateName: 'Palm Court',
      estateEmail: 'office@palm.test',
      estatePhone: '08012345678',
      estateAddress: '1 Palm Rd',
      estateWebsite: 'https://palm.test',
    });
    expect(getRawSettingsAsService).toHaveBeenCalledWith(
      expect.arrayContaining(['estate_name', 'estate_website_url'])
    );
    expect(getSettings).not.toHaveBeenCalled();
  });

  it('falls back when the read fails or values are blank', async () => {
    getRawSettingsAsService.mockResolvedValue({ status: 'error', message: 'boom' });
    await expect(getEstateEmailSettings()).resolves.toMatchObject({ estateName: 'Residio Estate', estateWebsite: undefined });

    getRawSettingsAsService.mockResolvedValue({ status: 'ok', values: new Map([['estate_name', '  ']]) });
    await expect(getEstateEmailSettings()).resolves.toMatchObject({ estateName: 'Residio Estate' });
  });
});
