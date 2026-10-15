import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isWhatsAppRecipientAllowed } from '@/lib/whatsapp/rollout';
import { getSettingResultAsService } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn() }));
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

  describe('pilot street targeting', () => {
    function pilotSettings(residentIds: string[], streetId: string | undefined) {
      vi.mocked(getSettingResultAsService).mockImplementation(async (key) => {
        if (key === 'whatsapp_rollout_mode') return { status: 'ok', value: 'pilot' };
        if (key === 'whatsapp_pilot_resident_ids') return { status: 'ok', value: JSON.stringify(residentIds) };
        if (key === 'whatsapp_pilot_street_id') return streetId ? { status: 'ok', value: streetId } : { status: 'absent' };
        return { status: 'absent' };
      });
    }

    function assignments(result: { data?: unknown; error?: unknown }) {
      const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
      chain.select = vi.fn().mockReturnValue(chain);
      chain.eq = vi.fn().mockReturnValue(chain);
      chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
      const from = vi.fn().mockReturnValue(chain);
      vi.mocked(createAdminClient).mockReturnValue({ from } as never);
      return { chain, from };
    }

    it('allows a resident whose active house is on the pilot street', async () => {
      pilotSettings([], 'street-1');
      const { chain, from } = assignments({ data: [{ house: { street_id: 'street-1' } }], error: null });
      expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
      expect(from).toHaveBeenCalledWith('resident_houses');
      expect(chain.eq).toHaveBeenCalledWith('resident_id', 'resident-1');
      expect(chain.eq).toHaveBeenCalledWith('is_active', true);
    });

    it('allows a match when the house join comes back as an array', async () => {
      pilotSettings([], 'street-1');
      assignments({ data: [{ house: [{ street_id: 'street-1' }] }], error: null });
      expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(true);
    });

    it('denies a resident whose house is on a different street', async () => {
      pilotSettings([], 'street-1');
      assignments({ data: [{ house: { street_id: 'street-2' } }], error: null });
      expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    });

    it('denies a resident with no active house assignment', async () => {
      pilotSettings([], 'street-1');
      assignments({ data: [], error: null });
      expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    });

    it('denies a resident who is not in a non-empty resident-id list and has no street target', async () => {
      pilotSettings(['resident-2', 'resident-3'], undefined);
      expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
      expect(createAdminClient).not.toHaveBeenCalled();
    });

    it('denies a resident outside a non-empty id list whose street also does not match', async () => {
      pilotSettings(['resident-2'], 'street-1');
      assignments({ data: [{ house: { street_id: 'street-9' } }], error: null });
      expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    });

    it('fails closed when the street lookup errors', async () => {
      pilotSettings([], 'street-1');
      assignments({ data: [{ house: { street_id: 'street-1' } }], error: { message: 'boom' } });
      expect(await isWhatsAppRecipientAllowed('resident-1')).toBe(false);
    });
  });
});
