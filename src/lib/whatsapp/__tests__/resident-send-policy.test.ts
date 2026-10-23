import { beforeEach, describe, expect, it, vi } from 'vitest';

/** #1037: the system-initiated resident send obeys the send policy (master switch, caps) before the provider. */
const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveResidentOverride: vi.fn(),
  sendWhatsAppMessage: vi.fn(),
  evaluateSendPolicy: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: mocks.resolveResidentOverride }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: mocks.sendWhatsAppMessage }));
vi.mock('@/lib/whatsapp/send-policy', () => ({
  evaluateSendPolicy: mocks.evaluateSendPolicy,
  createSendPolicyFacts: vi.fn(() => ({})),
}));

import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockReturnValue({
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { phone_primary: '0801' }, error: null }) }) }) }),
  });
  mocks.resolveResidentOverride.mockResolvedValue({ ok: true, residentOverride: undefined });
  mocks.sendWhatsAppMessage.mockResolvedValue({ success: true });
});

describe('sendWhatsAppToResident policy gate', () => {
  it('does not send when the policy refuses (WhatsApp switched off)', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue({ outcome: 'refuse', reason: 'whatsapp_disabled', message: 'WhatsApp notifications are disabled in system settings' });
    const result = await sendWhatsAppToResident('r1', 'hi', { seed: 's' });
    expect(result).toEqual({ sent: false, reason: 'WhatsApp notifications are disabled in system settings' });
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('does not send when the policy defers (daily cap)', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue({ outcome: 'defer', reason: 'daily_limit_reached', message: 'WhatsApp daily outbound limit reached' });
    const result = await sendWhatsAppToResident('r1', 'hi', { seed: 's' });
    expect(result.sent).toBe(false);
    expect(mocks.sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('sends when the policy allows, as a free-form message', async () => {
    mocks.evaluateSendPolicy.mockResolvedValue({ outcome: 'allow', normalizedPhone: 'n', template: { name: '', languageCode: 'en_US', parameters: [] } });
    const result = await sendWhatsAppToResident('r1', 'hi', { seed: 's' });
    expect(result).toEqual({ sent: true });
    expect(mocks.evaluateSendPolicy).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'r1', freeForm: true }), expect.anything());
  });
});
