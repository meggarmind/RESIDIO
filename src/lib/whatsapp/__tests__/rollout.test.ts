import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import { getSettingValue } from '@/actions/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

describe('WhatsApp rollout targeting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed when rollout is disabled', async () => {
    vi.mocked(getSettingValue).mockResolvedValue(null);
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });

  it('allows an explicitly targeted pilot resident', async () => {
    vi.mocked(getSettingValue).mockImplementation(async (key) => {
      if (key === 'whatsapp_rollout_mode') return 'pilot';
      if (key === 'whatsapp_pilot_resident_ids') return JSON.stringify(['resident-1']);
      return '';
    });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
  });

  it('allows estate-wide mode without a pilot lookup', async () => {
    vi.mocked(getSettingValue).mockImplementation(async (key) => key === 'whatsapp_rollout_mode' ? 'estate' : null);
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
