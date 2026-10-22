import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ sendWhatsAppMessage: vi.fn() }));

vi.mock('@/lib/whatsapp/provider', () => ({ sendWhatsAppMessage: mocks.sendWhatsAppMessage }));
vi.mock('@/lib/whatsapp/master-switch', () => ({
  isWhatsAppMasterSwitchOn: vi.fn().mockResolvedValue({ on: true }),
}));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn() }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn() }));

import { handleResidentMessage } from '@/lib/whatsapp/identity';
import { handleFinancialMessage } from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const inbound: WhatsAppInboundMessage = {
  id: 'wamid-1',
  from: '2348000000000',
  timestamp: '1760000000',
  type: 'text',
  text: 'hello',
};

const resident = {
  id: 'resident-1',
  firstName: 'Ada',
  lastName: 'Example',
  residentCode: 'RES001',
  phonePrimary: '+2348000000000',
  phoneSecondary: null,
  financialEligible: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sendWhatsAppMessage.mockResolvedValue({ success: true });
});

describe('inbound WhatsApp Assistant replies are exempt from the redirect (decision 8)', () => {
  it('an unmatched sender\'s reply is tracked with no resident', async () => {
    const repository = {
      findRosterMatches: vi.fn().mockResolvedValue([]),
      findLinkedResidents: vi.fn().mockResolvedValue([]),
      rememberPendingContact: vi.fn(),
    };
    await handleResidentMessage(inbound, { repository: repository as never });

    expect(mocks.sendWhatsAppMessage.mock.calls[0][3]).toEqual({ residentId: null, inboundMessageId: 'wamid-1' });
  });

  it('identity replies to message.from with purpose inbound_reply', async () => {
    const repository = {
      findRosterMatches: vi.fn().mockResolvedValue([resident]),
      findLinkedResidents: vi.fn().mockResolvedValue([]),
      getOptIn: vi.fn().mockResolvedValue(false),
      setOptIn: vi.fn(),
      rememberPendingContact: vi.fn(),
      consumeLinkToken: vi.fn().mockResolvedValue(null),
      claimLinkAttempt: vi.fn().mockResolvedValue(true),
      clearLinkAttempts: vi.fn().mockResolvedValue(undefined),
      attachPendingContact: vi.fn(),
      // #871: the first message gets the identity read-back.
      isDisputed: vi.fn().mockResolvedValue(false),
      getConsentState: vi.fn().mockResolvedValue({ confirmedFingerprint: null, privacy: null, step: null, pendingRequest: null }),
      getStreetName: vi.fn().mockResolvedValue('Palm Avenue'),
      saveConsentStep: vi.fn(),
    };
    await handleResidentMessage(inbound, { repository: repository as never });

    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [outbound, provider, context, tracking] = mocks.sendWhatsAppMessage.mock.calls[0];
    expect(outbound.to).toBe('2348000000000');
    expect(provider).toBeUndefined();
    expect(context).toEqual({ purpose: 'inbound_reply' });
    // #839: the send is tied to the resident and the message it answers.
    expect(tracking).toEqual({ residentId: 'resident-1', inboundMessageId: 'wamid-1' });
  });

  it('financial replies to message.from with purpose inbound_reply', async () => {
    await handleFinancialMessage(inbound, resident, { repository: {} as never, optedIn: true });

    expect(mocks.sendWhatsAppMessage).toHaveBeenCalledTimes(1);
    const [outbound, provider, context, tracking] = mocks.sendWhatsAppMessage.mock.calls[0];
    expect(outbound.to).toBe('2348000000000');
    expect(provider).toBeUndefined();
    expect(context).toEqual({ purpose: 'inbound_reply' });
    expect(tracking).toEqual({ residentId: 'resident-1', inboundMessageId: 'wamid-1' });
  });
});
