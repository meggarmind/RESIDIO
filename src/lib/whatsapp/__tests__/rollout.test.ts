import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import { getSettingResultAsService } from '@/actions/settings/get-settings';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/actions/settings/get-settings', () => ({ getSettingResultAsService: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));

describe('WhatsApp rollout targeting', () => {
  beforeEach(() => vi.clearAllMocks());

  it('fails closed when rollout is disabled', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'absent' });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });

  it('allows an explicitly targeted pilot resident', async () => {
    vi.mocked(getSettingResultAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_rollout_mode') return { status: 'ok', value: 'pilot' };
      if (key === 'whatsapp_pilot_resident_ids') return { status: 'ok', value: JSON.stringify(['resident-1']) };
      return { status: 'absent' };
    });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
  });

  it('allows estate-wide mode without a pilot lookup', async () => {
    vi.mocked(getSettingResultAsService).mockImplementation(async (key) =>
      key === 'whatsapp_rollout_mode' ? { status: 'ok', value: 'estate' } : { status: 'absent' }
    );
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  // #139: this setting gates who may receive/interact via WhatsApp at all, so
  // a query error must deny rather than silently falling through to a mode
  // default -- unlike a late-fee grace period, "we couldn't check" here must
  // not be treated the same as "unconfigured".
  it('denies a recipient when the rollout mode read errors, rather than falling through to a default', async () => {
    vi.mocked(getSettingResultAsService).mockImplementation(async (key) =>
      key === 'whatsapp_rollout_mode'
        ? { status: 'error', message: 'connection reset' }
        : { status: 'absent' }
    );
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
  });

  it('denies a pilot resident when the resident-ids read errors, even though the mode read succeeded', async () => {
    vi.mocked(getSettingResultAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_rollout_mode') return { status: 'ok', value: 'pilot' };
      if (key === 'whatsapp_pilot_resident_ids') return { status: 'error', message: 'connection reset' };
      return { status: 'absent' };
    });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('denies a pilot lookup when the street-id read errors after a resident-id miss', async () => {
    vi.mocked(getSettingResultAsService).mockImplementation(async (key) => {
      if (key === 'whatsapp_rollout_mode') return { status: 'ok', value: 'pilot' };
      if (key === 'whatsapp_pilot_resident_ids') return { status: 'ok', value: JSON.stringify([]) };
      if (key === 'whatsapp_pilot_street_id') return { status: 'error', message: 'connection reset' };
      return { status: 'absent' };
    });
    expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});
