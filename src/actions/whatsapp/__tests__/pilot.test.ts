import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { promoteWhatsAppPilotToEstate, updateWhatsAppPilotSettings, type PilotSettings } from '../pilot';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/auth/action-roles', () => ({ PERMISSIONS: { WHATSAPP_MANAGE: 'whatsapp.manage' } }));

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
    const update = query({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValueOnce(current).mockReturnValueOnce(update) } as never);

    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: true, error: null });
    expect(update.update).toHaveBeenCalledWith({ value: 'estate' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ACTIVATE', oldValues: { whatsapp_rollout_mode: 'pilot' } }));
  });

  it('refuses an estate-wide promotion when no pilot is active', async () => {
    const current = query({ data: { value: 'disabled' }, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(current) } as never);
    await expect(promoteWhatsAppPilotToEstate()).resolves.toEqual({ success: false, error: 'Only an active pilot can be promoted estate-wide' });
    expect(logAudit).not.toHaveBeenCalled();
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
};

describe('updateWhatsAppPilotSettings', () => {
  let chain: ReturnType<typeof query> & { upsert: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
    vi.mocked(logAudit).mockResolvedValue(undefined);
    chain = Object.assign(query({ data: null, error: null }), {
      upsert: vi.fn().mockResolvedValue({ error: null }),
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
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'system_settings' }));
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
  });
});
