import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { replayHeldWhatsAppMessages } from '@/lib/whatsapp/held-replay';
import { getWhatsAppPilotRoster, promoteWhatsAppPilotToEstate, setWhatsAppEnabled, updateWhatsAppPilotSettings, type PilotSettings } from '../pilot';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/whatsapp/held-replay', () => ({ replayHeldWhatsAppMessages: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { WHATSAPP_MANAGE: 'whatsapp.manage', WHATSAPP_VIEW: 'whatsapp.view' } }));

const ROW_ID = '55555555-5555-4555-8555-555555555555'; // audit entity_id is a uuid (#594)
const authorized = { authorized: true, userId: 'admin-1', error: null };

function query(result: { data?: unknown; error?: unknown }) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'eq', 'update']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

describe('WhatsApp pilot promotion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(logAudit).mockResolvedValue(undefined);
  });

  it('requires authorization before creating a database client', async () => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: false, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith('whatsapp.manage');
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('promotes only an active pilot and records the estate-wide transition', async () => {
    const current = query({ data: { value: 'pilot' }, error: null });
    const update = query({ data: [{ id: ROW_ID }], error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValueOnce(current).mockReturnValueOnce(update) } as never);

    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: true, error: null });
    expect(update.update).toHaveBeenCalledWith({ value: 'estate' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVATE', entityType: 'system_settings', entityId: ROW_ID, oldValues: { whatsapp_rollout_mode: 'pilot' } }));
  });

  it('refuses an estate-wide promotion when no pilot is active', async () => {
    const current = query({ data: { value: 'disabled' }, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(current) } as never);
    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: false, error: 'Only an active pilot can be promoted estate-wide' });
    expect(logAudit).not.toHaveBeenCalled();
  });
});

describe('WhatsApp master switch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(replayHeldWhatsAppMessages).mockResolvedValue({ replayed: 0 });
  });

  function switchClient() {
    const previous = query({ data: { value: 'false' }, error: null });
    const saved = { upsert: vi.fn(), select: vi.fn(), single: vi.fn().mockResolvedValue({ data: { id: ROW_ID }, error: null }) };
    saved.upsert.mockReturnValue(saved);
    saved.select.mockReturnValue(saved);
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValueOnce(previous).mockReturnValueOnce(saved) } as never);
  }

  it('answers the held messages when the switch is turned on (#1075)', async () => {
    switchClient();
    await expect(setWhatsAppEnabled(true)).resolves.toEqual({ success: true, error: null });
    expect(replayHeldWhatsAppMessages).toHaveBeenCalledTimes(1);
  });

  it('does not replay when the switch is turned off', async () => {
    switchClient();
    await expect(setWhatsAppEnabled(false)).resolves.toEqual({ success: true, error: null });
    expect(replayHeldWhatsAppMessages).not.toHaveBeenCalled();
  });

  it('keeps the switch on when the replay fails', async () => {
    switchClient();
    vi.mocked(replayHeldWhatsAppMessages).mockRejectedValue(new Error('down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(setWhatsAppEnabled(true)).resolves.toEqual({ success: true, error: null });
  });
});

const validInput: PilotSettings = {
  mode: 'pilot',
  residentIds: ['resident-1'],
  streetId: '',
  outboundDailyCap: 100,
  outboundBurstCap: 20,
  outboundBurstWindowMinutes: 10,
  financialLookupDailyCap: 50,
  sessionRetentionDays: 1,
  processedMessageRetentionDays: 2,
  surveyResponseRetentionDays: 90,
  outboundSendRetentionDays: 90,
};

describe('updateWhatsAppPilotSettings', () => {
  let chain: ReturnType<typeof query> & { upsert: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(logAudit).mockResolvedValue(undefined);
    chain = Object.assign(query({ data: null, error: null }), {
      upsert: vi.fn().mockReturnValue({ select: vi.fn().mockResolvedValue({ data: [{ id: ROW_ID }], error: null }) }),
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as never);
  });

  async function expectRejected(input: PilotSettings, error: string | RegExp) {
    const result = await updateWhatsAppPilotSettings(input);
    expect(result.success).toBe(false);
    if (typeof error === 'string') expect(result.error).toBe(error);
    else expect(result.error).toMatch(error);
    expect(chain.upsert).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  }

  it('authorizes with WHATSAPP_MANAGE first and touches nothing when denied', async () => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(updateWhatsAppPilotSettings(validInput)).resolves.toEqual({ success: false, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith('whatsapp.manage');
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it('saves valid settings, upserts every key as strings and audits', async () => {
    await expect(updateWhatsAppPilotSettings(validInput)).resolves.toEqual({ success: true, error: null });
    const rows = chain.upsert.mock.calls[0][0] as Array<{ key: string; value: string }>;
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    expect(byKey.whatsapp_rollout_mode).toBe('pilot');
    expect(byKey.whatsapp_session_retention_days).toBe('1');
    expect(byKey.whatsapp_processed_message_retention_days).toBe('2');
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'system_settings', entityId: ROW_ID }));
  });

  it('rejects an unknown mode', async () => {
    await expectRejected({ ...validInput, mode: 'everyone' as never }, 'Invalid rollout mode');
  });

  it('rejects pilot mode with no residents and no street', async () => {
    await expectRejected({ ...validInput, residentIds: [], streetId: '' }, /Pilot mode requires/);
  });

  describe('estate guard', () => {
    it('refuses to set estate when the current mode is pilot', async () => {
      chain.maybeSingle.mockResolvedValue({ data: { value: 'pilot' }, error: null });
      await expectRejected({ ...validInput, mode: 'estate' }, /audited pilot promotion control/);
    });

    it('refuses to set estate when no mode row exists', async () => {
      chain.maybeSingle.mockResolvedValue({ data: null, error: null });
      await expectRejected({ ...validInput, mode: 'estate' }, /audited pilot promotion control/);
    });

    it('refuses to set estate when the current-mode read errors', async () => {
      chain.maybeSingle.mockResolvedValue({ data: { value: 'estate' }, error: { message: 'boom' } });
      await expectRejected({ ...validInput, mode: 'estate' }, /audited pilot promotion control/);
    });

    it('allows re-saving settings while already in estate mode', async () => {
      chain.maybeSingle.mockResolvedValue({ data: { value: 'estate' }, error: null });
      await expect(updateWhatsAppPilotSettings({ ...validInput, mode: 'estate' })).resolves.toEqual({ success: true, error: null });
      expect(chain.upsert).toHaveBeenCalledTimes(1);
    });
  });

  describe('cap validation', () => {
    const caps = ['outboundDailyCap', 'outboundBurstCap', 'financialLookupDailyCap'] as const;
    for (const cap of caps) {
      it(`rejects a negative ${cap}`, async () => {
        await expectRejected({ ...validInput, [cap]: -1 }, 'Caps must be non-negative whole numbers');
      });
      it(`rejects a fractional ${cap}`, async () => {
        await expectRejected({ ...validInput, [cap]: 1.5 }, 'Caps must be non-negative whole numbers');
      });
      it(`accepts zero for ${cap}`, async () => {
        await expect(updateWhatsAppPilotSettings({ ...validInput, [cap]: 0 })).resolves.toEqual({ success: true, error: null });
      });
    }

    it('rejects a burst window below 1 minute', async () => {
      await expectRejected({ ...validInput, outboundBurstWindowMinutes: 0 }, 'Caps must be non-negative whole numbers');
    });

    it('accepts a burst window of exactly 1 minute', async () => {
      await expect(updateWhatsAppPilotSettings({ ...validInput, outboundBurstWindowMinutes: 1 })).resolves.toEqual({ success: true, error: null });
    });
  });

  describe('retention bounds', () => {
    const fields = ['sessionRetentionDays', 'processedMessageRetentionDays'] as const;
    for (const field of fields) {
      it(`rejects ${field} below 1`, async () => {
        await expectRejected({ ...validInput, [field]: 0 }, /between 1 and 30 days/);
      });
      it(`rejects ${field} above 30`, async () => {
        await expectRejected({ ...validInput, [field]: 31 }, /between 1 and 30 days/);
      });
      it(`rejects a fractional ${field}`, async () => {
        await expectRejected({ ...validInput, [field]: 2.5 }, /between 1 and 30 days/);
      });
      it(`accepts the boundary values 1 and 30 for ${field}`, async () => {
        await expect(updateWhatsAppPilotSettings({ ...validInput, [field]: 1 })).resolves.toEqual({ success: true, error: null });
        await expect(updateWhatsAppPilotSettings({ ...validInput, [field]: 30 })).resolves.toEqual({ success: true, error: null });
      });
    }
    it('bounds outboundSendRetentionDays to 1-365', async () => {
      await expectRejected({ ...validInput, outboundSendRetentionDays: 0 }, /between 1 and 365 days/);
      await expectRejected({ ...validInput, outboundSendRetentionDays: 366 }, /between 1 and 365 days/);
      await expect(updateWhatsAppPilotSettings({ ...validInput, outboundSendRetentionDays: 365 })).resolves.toEqual({ success: true, error: null });
    });

    it('bounds surveyResponseRetentionDays to 1-365', async () => {
      await expectRejected({ ...validInput, surveyResponseRetentionDays: 0 }, /between 1 and 365 days/);
      await expectRejected({ ...validInput, surveyResponseRetentionDays: 366 }, /between 1 and 365 days/);
      await expect(updateWhatsAppPilotSettings({ ...validInput, surveyResponseRetentionDays: 365 })).resolves.toEqual({ success: true, error: null });
    });
  });
});

describe('getWhatsAppPilotRoster (#801)', () => {
  function tableQuery(result: { data?: unknown; error?: unknown }, terminal: 'limit' | 'order') {
    const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
    chain.select = vi.fn().mockReturnValue(chain);
    if (terminal === 'limit') {
      chain.order = vi.fn().mockReturnValue(chain);
      chain.limit = vi.fn().mockResolvedValue(result);
    } else {
      chain.order = vi.fn().mockResolvedValue(result);
    }
    return chain;
  }

  function mockTables(residents: { data?: unknown; error?: unknown }, optIns: { data?: unknown; error?: unknown }, streets: { data?: unknown; error?: unknown }) {
    const chains = { residents: tableQuery(residents, 'limit'), whatsapp_optins: tableQuery(optIns, 'order'), streets: tableQuery(streets, 'order') };
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn((table: keyof typeof chains) => chains[table]) } as never);
    return chains;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
  });

  it('authorizes with WHATSAPP_VIEW first and reads nothing when denied', async () => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(getWhatsAppPilotRoster()).resolves.toEqual({ data: { residents: [], streets: [] }, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith('whatsapp.view');
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it('returns active houses with roles, masked consent numbers and the streets', async () => {
    mockTables(
      {
        data: [{
          id: 'res-1', first_name: 'Ada', last_name: 'Okoro', resident_code: 'RES001',
          resident_houses: [
            { is_active: false, resident_role: 'tenant', house: { house_number: '3', street_id: 'st-old', street: { name: 'Old Road' } } },
            { is_active: true, resident_role: 'resident_landlord', house: { house_number: '12', street_id: 'st-1', street: { name: 'Palm Close' } } },
          ],
        }],
        error: null,
      },
      { data: [{ resident_id: 'res-1', phone_number: '+2348031234567', opted_in: true, deactivated_at: null }], error: null },
      { data: [{ id: 'st-1', name: 'Palm Close' }], error: null },
    );

    await expect(getWhatsAppPilotRoster()).resolves.toEqual({
      data: {
        residents: [{
          id: 'res-1', name: 'Ada Okoro', code: 'RES001',
          houses: [{ label: '12 Palm Close', streetId: 'st-1', role: 'Owner-Occupier' }],
          optIn: 'opted_in', phone: '+234****567',
        }],
        streets: [{ id: 'st-1', name: 'Palm Close' }],
      },
      error: null,
    });
  });

  it('surfaces a read error with an empty roster', async () => {
    mockTables({ data: [], error: null }, { data: null, error: { message: 'boom' } }, { data: [], error: null });
    await expect(getWhatsAppPilotRoster()).resolves.toEqual({ data: { residents: [], streets: [] }, error: 'boom' });
  });
});
