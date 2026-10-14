import { describe, expect, it, vi } from 'vitest';
import {
  evaluateSendPolicy,
  type SendPolicyFacts,
  type SendPolicyInput,
} from '@/lib/whatsapp/send-policy';

// The module under test also exports the real adapter, which imports these.
// The policy itself is exercised only through the fake facts below.
vi.mock('@/lib/settings/service', () => ({
  getSettingResultAsService: vi.fn(),
  getSettingValueAsService: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp', () => ({ isApprovedWhatsAppTemplateName: vi.fn() }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn() }));
vi.mock('@/lib/sms/termii', () => ({ normalizePhoneNumber: vi.fn() }));

const NOW = new Date('2026-10-14T12:30:00.000Z');

interface FakeConfig {
  enabled?: Awaited<ReturnType<SendPolicyFacts['getWhatsAppEnabled']>>;
  inRollout?: boolean;
  settings?: Record<string, unknown>;
  dailyCount?: { count: number | null; failed: boolean };
  burstCount?: { count: number | null; failed: boolean };
  optIn?: { found: boolean; failed: boolean };
  templateApproved?: boolean;
}

function makeFacts(cfg: FakeConfig = {}) {
  const facts = {
    getWhatsAppEnabled: vi.fn(async () => cfg.enabled ?? { status: 'ok' as const, value: true }),
    isRecipientInRollout: vi.fn(async () => cfg.inRollout ?? true),
    getNumberSetting: vi.fn(async (key: string) => cfg.settings?.[key] ?? null),
    // First call is the daily window (UTC midnight), second the burst window.
    countWhatsAppSentSince: vi.fn(async (sinceIso: string) =>
      sinceIso === '2026-10-14T00:00:00.000Z'
        ? (cfg.dailyCount ?? { count: 0, failed: false })
        : (cfg.burstCount ?? { count: 0, failed: false })
    ),
    findOptIn: vi.fn(async () => cfg.optIn ?? { found: true, failed: false }),
    normalizePhone: vi.fn((phone: string) => `norm:${phone}`),
    isApprovedTemplateName: vi.fn(() => cfg.templateApproved ?? true),
    now: vi.fn(() => NOW),
  };
  return facts satisfies SendPolicyFacts;
}

const baseInput: SendPolicyInput = {
  recipientId: 'resident-1',
  recipientPhone: '08012345678',
  metadata: { whatsapp_template: { name: 'invoice_reminder' } },
};

describe('evaluateSendPolicy', () => {
  describe('kill switch', () => {
    it('refuses when the setting is absent', async () => {
      const d = await evaluateSendPolicy(baseInput, makeFacts({ enabled: { status: 'absent' } }));
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'WhatsApp is not enabled in system settings',
      });
    });

    it('refuses with a distinct message when the read errored', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ enabled: { status: 'error', message: 'boom' } })
      );
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'WhatsApp enablement could not be verified',
      });
    });

    it('refuses with a distinct message when switched off', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ enabled: { status: 'ok', value: false } })
      );
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'WhatsApp notifications are disabled in system settings',
      });
    });

    it('treats a non-true value as disabled', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ enabled: { status: 'ok', value: 'yes' } })
      );
      expect(d.outcome).toBe('refuse');
    });
  });

  it('refuses when there is no recipient phone', async () => {
    const d = await evaluateSendPolicy({ ...baseInput, recipientPhone: null }, makeFacts());
    expect(d).toMatchObject({
      outcome: 'refuse',
      message: 'No recipient phone number provided',
    });
  });

  it('refuses when the recipient is outside the rollout audience', async () => {
    const facts = makeFacts({ inRollout: false });
    const d = await evaluateSendPolicy(baseInput, facts);
    expect(d).toMatchObject({
      outcome: 'refuse',
      message: 'WhatsApp recipient is outside the active rollout audience',
    });
    expect(facts.isRecipientInRollout).toHaveBeenCalledWith('resident-1');
  });

  describe('daily cap', () => {
    it('refuses when the cap is configured as zero', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ settings: { whatsapp_outbound_daily_cap: 0 } })
      );
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'WhatsApp outbound notifications are capped at zero',
      });
    });

    it('refuses a negative cap', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ settings: { whatsapp_outbound_daily_cap: -1 } })
      );
      expect(d.outcome).toBe('refuse');
    });

    it('refuses when the count lookup fails', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ dailyCount: { count: null, failed: true } })
      );
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'Unable to verify WhatsApp outbound limit',
      });
    });

    it('defers when the count reaches the cap', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({
          settings: { whatsapp_outbound_daily_cap: 5 },
          dailyCount: { count: 5, failed: false },
        })
      );
      expect(d).toEqual({
        outcome: 'defer',
        reason: 'daily_limit_reached',
        message: 'WhatsApp daily outbound limit reached',
      });
    });

    it('allows one below the cap', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({
          settings: { whatsapp_outbound_daily_cap: 5 },
          dailyCount: { count: 4, failed: false },
        })
      );
      expect(d.outcome).toBe('allow');
    });

    it('defaults the cap to 100 when the setting is not an integer', async () => {
      const at99 = await evaluateSendPolicy(
        baseInput,
        makeFacts({
          settings: { whatsapp_outbound_daily_cap: 'lots' },
          dailyCount: { count: 99, failed: false },
        })
      );
      const at100 = await evaluateSendPolicy(
        baseInput,
        makeFacts({
          settings: { whatsapp_outbound_daily_cap: 1.5 },
          dailyCount: { count: 100, failed: false },
        })
      );
      expect(at99.outcome).toBe('allow');
      expect(at100.outcome).toBe('defer');
    });

    it('counts from UTC midnight of the facts clock', async () => {
      const facts = makeFacts();
      await evaluateSendPolicy(baseInput, facts);
      expect(facts.countWhatsAppSentSince).toHaveBeenNthCalledWith(1, '2026-10-14T00:00:00.000Z');
    });
  });

  describe('burst cap', () => {
    it('refuses with the burst message when the cap is configured as zero', async () => {
      const facts = makeFacts({ settings: { whatsapp_outbound_burst_cap: 0 } });
      const d = await evaluateSendPolicy(baseInput, facts);
      expect(d).toEqual({
        outcome: 'refuse',
        reason: 'burst_cap_zero',
        message: 'WhatsApp outbound burst limit reached',
      });
      // Zero cap short-circuits before the burst count read.
      expect(facts.countWhatsAppSentSince).toHaveBeenCalledTimes(1);
    });

    it('refuses when the burst count lookup fails', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ burstCount: { count: null, failed: true } })
      );
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'Unable to verify WhatsApp burst limit',
      });
    });

    it('defers when the burst count reaches the cap', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({
          settings: { whatsapp_outbound_burst_cap: 3 },
          burstCount: { count: 3, failed: false },
        })
      );
      expect(d).toEqual({
        outcome: 'defer',
        reason: 'burst_limit_reached',
        message: 'WhatsApp outbound burst limit reached',
      });
    });

    it('defaults the cap to 20 and the window to 10 minutes', async () => {
      const facts = makeFacts({
        settings: { whatsapp_outbound_burst_window_minutes: 0 },
        burstCount: { count: 20, failed: false },
      });
      const d = await evaluateSendPolicy(baseInput, facts);
      expect(d.outcome).toBe('defer');
      expect(facts.countWhatsAppSentSince).toHaveBeenNthCalledWith(2, '2026-10-14T12:20:00.000Z');
    });

    it('uses a configured integer window', async () => {
      const facts = makeFacts({ settings: { whatsapp_outbound_burst_window_minutes: 30 } });
      await evaluateSendPolicy(baseInput, facts);
      expect(facts.countWhatsAppSentSince).toHaveBeenNthCalledWith(2, '2026-10-14T12:00:00.000Z');
    });
  });

  describe('opt-in', () => {
    it('refuses when the lookup fails', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({ optIn: { found: false, failed: true } })
      );
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'Unable to verify WhatsApp consent',
      });
    });

    it('refuses when the recipient has not opted in, looked up by normalized phone', async () => {
      const facts = makeFacts({ optIn: { found: false, failed: false } });
      const d = await evaluateSendPolicy(baseInput, facts);
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'WhatsApp recipient has not opted in',
      });
      expect(facts.findOptIn).toHaveBeenCalledWith('resident-1', 'norm:08012345678');
    });
  });

  describe('template', () => {
    it('refuses when metadata has no template', async () => {
      const d = await evaluateSendPolicy({ ...baseInput, metadata: null }, makeFacts());
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'WhatsApp proactive sends require an approved template',
      });
    });

    it('refuses a non-object template', async () => {
      const d = await evaluateSendPolicy(
        { ...baseInput, metadata: { whatsapp_template: 'invoice_reminder' } },
        makeFacts()
      );
      expect(d.outcome).toBe('refuse');
    });

    it('refuses an unapproved template name', async () => {
      const facts = makeFacts({ templateApproved: false });
      const d = await evaluateSendPolicy(baseInput, facts);
      expect(d).toMatchObject({
        outcome: 'refuse',
        message: 'WhatsApp template is not approved for proactive delivery',
      });
      expect(facts.isApprovedTemplateName).toHaveBeenCalledWith('invoice_reminder');
    });
  });

  describe('allow', () => {
    it('returns the normalized phone and template with defaults', async () => {
      const d = await evaluateSendPolicy(
        {
          ...baseInput,
          metadata: { whatsapp_template: { name: 'invoice_reminder', parameters: 'nope' } },
        },
        makeFacts()
      );
      expect(d).toEqual({
        outcome: 'allow',
        normalizedPhone: 'norm:08012345678',
        template: { name: 'invoice_reminder', languageCode: 'en_US', parameters: [] },
      });
    });

    it('stringifies parameters and honours languageCode', async () => {
      const d = await evaluateSendPolicy(
        {
          ...baseInput,
          metadata: {
            whatsapp_template: { name: 'invoice_reminder', languageCode: 'en_GB', parameters: [1, 'a'] },
          },
        },
        makeFacts()
      );
      expect(d).toMatchObject({
        outcome: 'allow',
        template: { languageCode: 'en_GB', parameters: ['1', 'a'] },
      });
    });
  });

  describe('ordering and short-circuiting', () => {
    it('a kill-switch refusal reads nothing else', async () => {
      const facts = makeFacts({ enabled: { status: 'ok', value: false } });
      await evaluateSendPolicy(baseInput, facts);
      expect(facts.isRecipientInRollout).not.toHaveBeenCalled();
      expect(facts.getNumberSetting).not.toHaveBeenCalled();
      expect(facts.countWhatsAppSentSince).not.toHaveBeenCalled();
      expect(facts.findOptIn).not.toHaveBeenCalled();
      expect(facts.normalizePhone).not.toHaveBeenCalled();
      expect(facts.isApprovedTemplateName).not.toHaveBeenCalled();
    });

    it('a missing phone does not reach rollout', async () => {
      const facts = makeFacts();
      await evaluateSendPolicy({ ...baseInput, recipientPhone: '' }, facts);
      expect(facts.isRecipientInRollout).not.toHaveBeenCalled();
    });

    it('a rollout refusal does not read cap settings or counts', async () => {
      const facts = makeFacts({ inRollout: false });
      await evaluateSendPolicy(baseInput, facts);
      expect(facts.getNumberSetting).not.toHaveBeenCalled();
      expect(facts.countWhatsAppSentSince).not.toHaveBeenCalled();
    });

    it('a daily deferral does not read burst settings or opt-in', async () => {
      const facts = makeFacts({
        settings: { whatsapp_outbound_daily_cap: 1 },
        dailyCount: { count: 1, failed: false },
      });
      await evaluateSendPolicy(baseInput, facts);
      expect(facts.getNumberSetting).toHaveBeenCalledTimes(1);
      expect(facts.getNumberSetting).toHaveBeenCalledWith('whatsapp_outbound_daily_cap');
      expect(facts.countWhatsAppSentSince).toHaveBeenCalledTimes(1);
      expect(facts.findOptIn).not.toHaveBeenCalled();
    });

    it('daily is checked before burst when both are exhausted', async () => {
      const d = await evaluateSendPolicy(
        baseInput,
        makeFacts({
          settings: { whatsapp_outbound_daily_cap: 1, whatsapp_outbound_burst_cap: 1 },
          dailyCount: { count: 1, failed: false },
          burstCount: { count: 1, failed: false },
        })
      );
      expect(d).toMatchObject({ reason: 'daily_limit_reached' });
    });

    it('a burst refusal does not read opt-in', async () => {
      const facts = makeFacts({ burstCount: { count: null, failed: true } });
      await evaluateSendPolicy(baseInput, facts);
      expect(facts.findOptIn).not.toHaveBeenCalled();
    });

    it('an opt-in refusal does not check the template', async () => {
      const facts = makeFacts({ optIn: { found: false, failed: false } });
      await evaluateSendPolicy({ ...baseInput, metadata: null }, facts);
      expect(facts.isApprovedTemplateName).not.toHaveBeenCalled();
    });
  });
});
