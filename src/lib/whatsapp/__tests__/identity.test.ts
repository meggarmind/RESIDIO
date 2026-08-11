import { describe, expect, it, vi } from 'vitest';
import { handleResidentMessage } from '@/lib/whatsapp/identity';
import type { WhatsAppIdentityRepository, WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const resident: WhatsAppResidentIdentity = {
  id: 'resident-1',
  firstName: 'Ada',
  lastName: 'Example',
  residentCode: 'RES001',
  phonePrimary: '+2348000000000',
  phoneSecondary: null,
  financialEligible: true,
};

function message(text: string, from = '2348000000000'): WhatsAppInboundMessage {
  return {
    id: `wamid-${text}`,
    from,
    timestamp: '1760000000',
    type: 'text',
    text,
  };
}

function repository(overrides: Partial<WhatsAppIdentityRepository> = {}): WhatsAppIdentityRepository {
  return {
    findRosterMatches: vi.fn().mockResolvedValue([resident]),
    findLinkedResidents: vi.fn().mockResolvedValue([]),
    getOptIn: vi.fn().mockResolvedValue(false),
    setOptIn: vi.fn().mockResolvedValue(undefined),
    rememberPendingContact: vi.fn().mockResolvedValue(undefined),
    consumeLinkToken: vi.fn().mockResolvedValue(null),
    attachPendingContact: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WhatsApp identity and consent', () => {
  it('resolves a registered resident without inferring consent', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('hello'), { repository: repo, send });

    expect(result).toMatchObject({ status: 'identified', residentId: 'resident-1', optedIn: false });
    expect(repo.setOptIn).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('Reply YES');
  });

  it('records consent with YES and disables it with STOP', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleResidentMessage(message('YES'), { repository: repo, send });
    await handleResidentMessage(message('STOP'), { repository: repo, send });

    expect(repo.setOptIn).toHaveBeenNthCalledWith(1, 'resident-1', '+2348000000000', true, 'in_chat');
    expect(repo.setOptIn).toHaveBeenNthCalledWith(2, 'resident-1', '+2348000000000', false, 'in_chat');
  });

  it('does not identify a shared number automatically', async () => {
    const repo = repository({
      findRosterMatches: vi.fn().mockResolvedValue([resident, { ...resident, id: 'resident-2' }]),
    });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('hello'), { repository: repo, send });

    expect(result.status).toBe('ambiguous');
    expect(repo.rememberPendingContact).toHaveBeenCalledWith('+2348000000000');
    expect(send.mock.calls[0]?.[0].body).not.toContain('Ada Example');
  });

  it('links an unrostered number with a one-time code but waits for consent', async () => {
    const repo = repository({ consumeLinkToken: vi.fn().mockResolvedValue('resident-1') });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('LINK 123456', '2348111111111'), { repository: repo, send });

    expect(result).toMatchObject({ status: 'linked', residentId: 'resident-1', optedIn: false });
    expect(repo.setOptIn).toHaveBeenCalledWith('resident-1', '+2348111111111', false, 'in_chat');
    expect(repo.attachPendingContact).toHaveBeenCalledWith('+2348111111111', 'resident-1');
    expect(send.mock.calls[0]?.[0].body).toContain('Reply YES');
  });

  it('keeps non-billable residents in the community tier without financial data', async () => {
    const repo = repository({
      findRosterMatches: vi.fn().mockResolvedValue([{ ...resident, financialEligible: false }]),
      getOptIn: vi.fn().mockResolvedValue(true),
    });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('hello'), { repository: repo, send });

    expect(result.financialEligible).toBe(false);
    expect(send.mock.calls[0]?.[0].body).toContain('announcements and notices');
    expect(send.mock.calls[0]?.[0].body).not.toContain('balance');
  });
});
