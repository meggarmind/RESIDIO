import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleResidentMessage, identityFingerprint } from '@/lib/whatsapp/identity';
import type { WhatsAppIdentityRepository, WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';

vi.mock('@/lib/whatsapp/master-switch', () => ({
  isWhatsAppMasterSwitchOn: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
});

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
    // Identity confirmed and notice accepted: these tests cover what follows consent (#871 is in consent.test.ts).
    getStreetName: vi.fn().mockResolvedValue('Palm Street'),
    getConsentState: vi.fn().mockResolvedValue({
      confirmedFingerprint: identityFingerprint(resident, 'Palm Street'),
      privacy: { decision: 'privacy_accepted', version: 'v1' },
      step: null,
      pendingRequest: null,
    }),
    recordConsentDecision: vi.fn().mockResolvedValue(undefined),
    saveConsentStep: vi.fn().mockResolvedValue(undefined),
    isDisputed: vi.fn().mockResolvedValue(false),
    markDisputed: vi.fn().mockResolvedValue(undefined),
    notifyDisputed: vi.fn().mockResolvedValue(undefined),
    getPrivacyNotice: vi.fn().mockResolvedValue({ version: 'v1', text: 'Notice' }),
    getOfficeContactLine: vi.fn().mockResolvedValue(''),
    optOutOfSurveys: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('WhatsApp identity and consent', () => {
  it('hands an exact ADMIN command to admin mode without reading resident records (#972)', async () => {
    const repo = repository();
    const adminRepository = { getLockedUntil: vi.fn().mockResolvedValue(null), findActiveBinding: vi.fn().mockResolvedValue(null) };
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('ADMIN STATUS'), {
      repository: repo,
      adminRepository: adminRepository as never,
      send,
    });

    expect(result.status).toBe('admin');
    expect(repo.findLinkedResidents).not.toHaveBeenCalled();
    expect(repo.findRosterMatches).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toMatch(/not linked to an admin account/);
  });

  it('hands a street choice to admin mode only when an admin question is waiting (#982)', async () => {
    const binding = { id: 'b1', profileId: 'p1', phoneNumber: '+2348000000000', boundAt: '2026-10-20T10:00:00Z', lastUsedAt: null, lastTotpStep: null, sessionExpiresAt: null, accountFingerprint: 'x' };
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });
    const waiting = { findActiveBinding: vi.fn().mockResolvedValue(binding), findPendingChoice: vi.fn().mockResolvedValue(null) };

    // Linked number, nothing waiting: the reply stays with the resident assistant.
    const idle = await handleResidentMessage(message('2'), { repository: repo, adminRepository: waiting as never, send });
    expect(idle.status).not.toBe('admin');
    expect(repo.findRosterMatches).toHaveBeenCalled();
  });

  it('keeps other text starting with "admin" on the resident path (#972)', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('admin please call me'), { repository: repo, send });

    expect(result.status).toBe('identified');
    expect(repo.findRosterMatches).toHaveBeenCalled();
  });

  it('resolves a registered resident without inferring consent', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('hello'), { repository: repo, send });

    expect(result).toMatchObject({ status: 'identified', residentId: 'resident-1', optedIn: false, accessTier: 'financial' });
    expect(repo.setOptIn).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('Reply YES');
    expect(send.mock.calls[0]?.[0].idempotencySeed).toBe('wamid-hello');
  });

  it('records consent with YES and disables it with STOP', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleResidentMessage(message('YES'), { repository: repo, send });
    await handleResidentMessage(message('STOP'), { repository: repo, send });

    expect(repo.setOptIn).toHaveBeenNthCalledWith(1, 'resident-1', '+2348000000000', true, 'in_chat');
    expect(repo.setOptIn).toHaveBeenNthCalledWith(2, 'resident-1', '+2348000000000', false, 'in_chat');
  });

  it('opts out every resident on a shared number when STOP arrives', async () => {
    const other = { ...resident, id: 'resident-2', residentCode: 'RES002' };
    const repo = repository({ findRosterMatches: vi.fn().mockResolvedValue([resident, other]) });
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleResidentMessage(message('STOP'), { repository: repo, send });

    expect(repo.setOptIn).toHaveBeenCalledWith('resident-1', '+2348000000000', false, 'in_chat');
    expect(repo.setOptIn).toHaveBeenCalledWith('resident-2', '+2348000000000', false, 'in_chat');
  });

  it('stores STOP SURVEYS as a survey opt-out and leaves the alerts opt-in alone (#872)', async () => {
    const repo = repository({ getOptIn: vi.fn().mockResolvedValue(true) });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('stop surveys'), { repository: repo, send });

    expect(repo.optOutOfSurveys).toHaveBeenCalledWith('resident-1');
    expect(repo.setOptIn).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'identified', optedIn: true });
    expect(send.mock.calls[0]?.[0].body).toBe("Done. I won't ask you for feedback again.");
  });

  it('still treats a plain STOP as an alerts opt-out, not a survey opt-out (#872)', async () => {
    const repo = repository();
    await handleResidentMessage(message('STOP'), { repository: repo, send: vi.fn().mockResolvedValue({ success: true }) });

    expect(repo.optOutOfSurveys).not.toHaveBeenCalled();
    expect(repo.setOptIn).toHaveBeenCalledWith('resident-1', '+2348000000000', false, 'in_chat');
  });

  it('re-enables consent with START after an opt-out', async () => {
    const repo = repository({ getOptIn: vi.fn().mockResolvedValue(false) });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('START'), { repository: repo, send });

    expect(result.optedIn).toBe(true);
    expect(repo.setOptIn).toHaveBeenCalledWith('resident-1', '+2348000000000', true, 'in_chat');
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

  it('creates a pending record for an unregistered number', async () => {
    const repo = repository({ findRosterMatches: vi.fn().mockResolvedValue([]) });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('hello', '2348111111111'), { repository: repo, send });

    expect(result.status).toBe('pending');
    expect(repo.rememberPendingContact).toHaveBeenCalledWith('+2348111111111');
    expect(send.mock.calls[0]?.[0].body).not.toContain('balance');
  });

  it('adds the estate office contact line to the invalid link code reply', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const estateContactLine = vi.fn().mockResolvedValue('Contact the estate office on 0803 699 6725.');

    await handleResidentMessage(message('LINK 123456', '2348111111111'), { repository: repository({ findRosterMatches: vi.fn().mockResolvedValue([]) }), send, estateContactLine });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].body).toBe(
      'That link code is invalid or expired. Ask the estate office for a new code.\nContact the estate office on 0803 699 6725.'
    );
  });

  it('adds the estate office contact line to the unmatched number reply', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    const estateContactLine = vi.fn().mockResolvedValue('Contact the estate office on 0803 699 6725.');

    await handleResidentMessage(message('hello', '2348111111111'), { repository: repository({ findRosterMatches: vi.fn().mockResolvedValue([]) }), send, estateContactLine });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].body).toBe(
      'Welcome to the Residio Assistant. We could not safely match this number to one Resident. Ask the estate office for a link code, or reply STOP.\nContact the estate office on 0803 699 6725.'
    );
  });

  it('links an unrostered number with a one-time code but waits for consent', async () => {
    const repo = repository({ consumeLinkToken: vi.fn().mockResolvedValue('resident-1') });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('LINK 123456', '2348111111111'), { repository: repo, send });

    expect(result).toMatchObject({ status: 'linked', residentId: 'resident-1', optedIn: false });
    expect(repo.setOptIn).toHaveBeenCalledWith('resident-1', '+2348111111111', false, 'in_chat', true);
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

    expect(result).toMatchObject({ financialEligible: false, accessTier: 'community' });
    expect(send.mock.calls[0]?.[0].body).toContain('announcements and notices');
    expect(send.mock.calls[0]?.[0].body).not.toContain('balance');
  });

  it.each([
    ['an opted-in community-tier resident', false, 'hello', true],
    ['YES from a resident already opted in', true, 'YES', true],
    ['YES from a community-tier resident opting in', false, 'YES', false],
  ])('hands %s to the Assistant menu (#804)', async (_label, financialEligible, text, optedIn) => {
    const repo = repository({
      findRosterMatches: vi.fn().mockResolvedValue([{ ...resident, financialEligible }]),
      getOptIn: vi.fn().mockResolvedValue(optedIn),
    });
    const send = vi.fn().mockResolvedValue({ success: true });
    const onIdentified = vi.fn().mockResolvedValue(undefined);

    await handleResidentMessage(message(text), { repository: repo, send, onIdentified });

    expect(onIdentified).toHaveBeenCalledWith(expect.objectContaining({ text }), expect.objectContaining({ financialEligible }));
    expect(send).not.toHaveBeenCalled();
  });
});

describe('WhatsApp Assistant master switch (#547)', () => {
  it.each(['absent', 'error', 'disabled'] as const)('does nothing for any message when the switch is off (%s)', async (reason) => {
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: false, reason });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const text of ['hello', 'STOP', 'START', 'LINK 123456', 'YES', '1']) {
      const repo = repository();
      const send = vi.fn().mockResolvedValue({ success: true });
      const onIdentified = vi.fn();

      const result = await handleResidentMessage(message(text), { repository: repo, send, onIdentified });

      expect(result).toEqual({ status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' });
      for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(onIdentified).not.toHaveBeenCalled();
    }
  });
});
