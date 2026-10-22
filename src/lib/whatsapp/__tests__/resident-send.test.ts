import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { isWhatsAppOptedIn } from '@/lib/whatsapp/opt-in';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { evaluateSendPolicy } from '@/lib/whatsapp/send-policy';
import { sendWhatsAppToResident } from '@/lib/whatsapp/resident-send';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/comms-override/resident-flag', () => ({ resolveResidentOverride: vi.fn() }));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: vi.fn() }));
vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: vi.fn() }));
vi.mock('@/lib/whatsapp/send-policy', () => ({ evaluateSendPolicy: vi.fn(), createSendPolicyFacts: vi.fn(() => ({})) }));

function mockResident(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const op of ['select', 'eq']) chain[op] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(result);
  vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn(() => chain) } as unknown as ReturnType<typeof createAdminClient>);
}

beforeEach(() => {
  mockResident({ data: { phone_primary: '+2348000000000' }, error: null });
  vi.mocked(evaluateSendPolicy).mockReset().mockResolvedValue({ outcome: 'allow', normalizedPhone: '+2348000000000', template: { name: '', languageCode: 'en_US', parameters: [] } });
  vi.mocked(isWhatsAppOptedIn).mockReset().mockResolvedValue(true);
  vi.mocked(resolveResidentOverride).mockReset().mockResolvedValue({ ok: true, residentOverride: true });
  vi.mocked(sendWhatsAppMessage).mockReset().mockResolvedValue({ success: true });
});

describe('sendWhatsAppToResident', () => {
  it('sends to the resident\'s number under their override flag, tracked as a notification', async () => {
    const result = await sendWhatsAppToResident('resident-1', 'Hello', { seed: 'seed-1', mediaUrls: ['https://files.test/a.pdf'] });

    expect(result).toEqual({ sent: true });
    expect(isWhatsAppOptedIn).toHaveBeenCalledWith('resident-1', '+2348000000000');
    expect(sendWhatsAppMessage).toHaveBeenCalledWith(
      { to: '+2348000000000', body: 'Hello', idempotencySeed: 'seed-1', mediaUrls: ['https://files.test/a.pdf'] },
      undefined,
      { residentOverride: true },
      { purpose: 'notification', residentId: 'resident-1' }
    );
  });

  it('sends nothing to a resident who has not opted in', async () => {
    vi.mocked(isWhatsAppOptedIn).mockResolvedValue(false);
    expect(await sendWhatsAppToResident('resident-1', 'Hello', { seed: 's' })).toEqual({ sent: false, reason: 'not opted in' });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('sends nothing when there is no number', async () => {
    mockResident({ data: { phone_primary: ' ' }, error: null });
    expect(await sendWhatsAppToResident('resident-1', 'Hello', { seed: 's' })).toEqual({ sent: false, reason: 'no WhatsApp number' });
    expect(isWhatsAppOptedIn).not.toHaveBeenCalled();
  });

  it('sends nothing when the override flag cannot be read', async () => {
    vi.mocked(resolveResidentOverride).mockResolvedValue({ ok: false, error: 'flag unreadable' });
    expect(await sendWhatsAppToResident('resident-1', 'Hello', { seed: 's' })).toEqual({ sent: false, reason: 'flag unreadable' });
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it('reports a provider failure and never throws', async () => {
    vi.mocked(sendWhatsAppMessage).mockResolvedValue({ success: false, error: 'provider down' });
    expect(await sendWhatsAppToResident('resident-1', 'Hello', { seed: 's' })).toEqual({ sent: false, reason: 'provider down' });
    vi.mocked(sendWhatsAppMessage).mockRejectedValue(new Error('network'));
    expect(await sendWhatsAppToResident('resident-1', 'Hello', { seed: 's' })).toEqual({ sent: false, reason: 'network' });
  });
});
