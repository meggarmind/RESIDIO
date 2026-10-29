import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handleResidentMessage, identityFingerprint } from '@/lib/whatsapp/identity';
import type { WhatsAppIdentityRepository, WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import type { WhatsAppFinancialRepository, WhatsAppFinancialSession } from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import { accountFingerprint, type WhatsAppAdminAccount } from '@/lib/whatsapp/admin';

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
  accessAllowed: true,
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
    findLinkCodeIssuer: vi.fn().mockResolvedValue(null),
    sendLinkNotice: vi.fn().mockResolvedValue(undefined),
    claimLinkAttempt: vi.fn().mockResolvedValue(true),
    clearLinkAttempts: vi.fn().mockResolvedValue(undefined),
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
    claimBlockedReply: vi.fn().mockResolvedValue(true),
    getEstateName: vi.fn().mockResolvedValue('Palm Estate'),
    getAssistantName: vi.fn().mockResolvedValue('Palm Estate Assistant'),
    ...overrides,
  };
}

describe('WhatsApp identity and consent', () => {
  const linkAttempt = () => ({
    getLockedUntil: vi.fn().mockResolvedValue(null),
    findLinkCode: vi.fn().mockResolvedValue(null),
    recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: null }),
  });
  const adminNumber = (fingerprint = '') => ({
    getLockedUntil: vi.fn().mockResolvedValue(null),
    getCodeRequired: vi.fn().mockResolvedValue(true),
    findActiveBinding: vi.fn().mockResolvedValue({
      id: 'b1', profileId: 'p1', phoneNumber: '+2348000000000', boundAt: '2026-10-20T10:00:00Z', lastUsedAt: null,
      lastTotpStep: null, sessionExpiresAt: null, accountFingerprint: fingerprint, codeRequired: true,
    }),
    loadAccount: vi.fn().mockResolvedValue(null),
    revokeBinding: vi.fn().mockResolvedValue(undefined),
    audit: vi.fn().mockResolvedValue(undefined),
  });
  const sessionAt = (currentNode: string, overrides: Partial<WhatsAppFinancialSession> = {}): WhatsAppFinancialSession => ({
    phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode, selectedHouseId: null, pinAuthenticated: false,
    expiresAt: '2099-01-01T00:00:00Z', ...overrides,
  });
  const financialWith = (stored: WhatsAppFinancialSession | null) => {
    const saveSession = vi.fn().mockResolvedValue(undefined);
    const getSession = vi.fn().mockResolvedValue(stored);
    return { saveSession, getSession, financialRepository: { getSession, saveSession } as unknown as WhatsAppFinancialRepository };
  };

  it('hands ADMIN LINK to admin mode without reading resident records (#972)', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('ADMIN LINK 123456'), {
      repository: repo, adminRepository: linkAttempt() as never, financialRepository: financialWith(null).financialRepository, send,
    });

    expect(result.status).toBe('admin');
    expect(repo.findLinkedResidents).not.toHaveBeenCalled();
    expect(repo.findRosterMatches).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toMatch(/link code is invalid/);
  });

  it.each(['ADMIN', 'ADMIN 123456'])('answers %s from a number that is not an admin number as the resident assistant would (#1292)', async (text) => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });
    const adminRepository = { getCodeRequired: vi.fn().mockResolvedValue(true), findActiveBinding: vi.fn().mockResolvedValue(null), findAutoLinkProfile: vi.fn().mockResolvedValue(null), getLockedUntil: vi.fn() };

    const result = await handleResidentMessage(message(text), {
      repository: repo, adminRepository: adminRepository as never, financialRepository: financialWith(null).financialRepository, send,
    });

    expect(result.status).not.toBe('admin');
    expect(repo.findRosterMatches).toHaveBeenCalled();
    expect(adminRepository.getLockedUntil).not.toHaveBeenCalled();
    expect(send.mock.calls.map(([outbound]) => outbound.body).join('\n')).not.toMatch(/admin/i);
  });

  describe('ends the open resident menu step on an admin turn (#1291)', () => {
    const openSession = (): WhatsAppFinancialSession => ({ ...sessionAt('alerts'), selectedHouseId: 'house-1', pinAuthenticated: true, draft: { report: 'x' } });

    it('puts the stored node back to main after an admin command and keeps the PIN unlock', async () => {
      const { saveSession, financialRepository } = financialWith(openSession());

      const result = await handleResidentMessage(message('ADMIN LINK 123456'), {
        repository: repository(), adminRepository: linkAttempt() as never, financialRepository, send: vi.fn().mockResolvedValue({ success: true }),
      });

      expect(result.status).toBe('admin');
      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ currentNode: 'main', pinAuthenticated: true, draft: null }));
    });

    it('leaves a session already on main alone, and a number with no session', async () => {
      for (const stored of [{ ...openSession(), currentNode: 'main' }, null]) {
        const { saveSession, financialRepository } = financialWith(stored);
        await handleResidentMessage(message('ADMIN LINK 123456'), {
          repository: repository(), adminRepository: linkAttempt() as never, financialRepository, send: vi.fn().mockResolvedValue({ success: true }),
        });
        expect(saveSession).not.toHaveBeenCalled();
      }
    });

    it('still answers the admin command when the session reset fails', async () => {
      const financialRepository = { getSession: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as WhatsAppFinancialRepository;
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const result = await handleResidentMessage(message('ADMIN LINK 123456'), {
        repository: repository(), adminRepository: linkAttempt() as never, financialRepository, send: vi.fn().mockResolvedValue({ success: true }),
      });
      expect(result.status).toBe('admin');
    });
  });

  describe('one conversation node for admin and resident steps (#1292)', () => {
    it('sends a reply to the admin step on screen, not to the resident assistant', async () => {
      const repo = repository();
      const adminRepository = adminNumber();
      const { saveSession, financialRepository } = financialWith(sessionAt('admin_menu'));

      const result = await handleResidentMessage(message('1'), { repository: repo, adminRepository: adminRepository as never, financialRepository, send: vi.fn().mockResolvedValue({ success: true }) });

      expect(result.status).toBe('admin');
      expect(adminRepository.findActiveBinding).toHaveBeenCalled();
      expect(repo.findRosterMatches).not.toHaveBeenCalled();
      // The account is gone, so the binding ends and the node goes back to main.
      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ currentNode: 'main' }));
    });

    it('opens Admin tools from ADMIN and puts the code step on the node', async () => {
      const admin: WhatsAppAdminAccount = {
        profileId: 'p1', fullName: 'Ada Admin', email: null, approvalStatus: 'active', roleId: 'r1', roleName: 'chairman', roleDisplayName: 'Chairman',
        // The RFC test secret used by the other admin tests. secret-scan:allow
        roleCategory: 'exco', permissions: ['whatsapp_admin.query'], totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP', // secret-scan:allow
      };
      const adminRepository = { ...adminNumber(accountFingerprint(admin)), loadAccount: vi.fn().mockResolvedValue(admin) };
      const { saveSession, financialRepository } = financialWith(sessionAt('alerts', { pinAuthenticated: true }));
      const send = vi.fn().mockResolvedValue({ success: true });

      const result = await handleResidentMessage(message('ADMIN'), { repository: repository(), adminRepository: adminRepository as never, financialRepository, send });

      expect(result.status).toBe('admin');
      expect(send.mock.calls[0][0].body).toMatch(/6-digit code/);
      expect(saveSession).toHaveBeenCalledWith(expect.objectContaining({ currentNode: 'admin_code', pinAuthenticated: true, residentId: 'resident-1' }));
    });

    it('keeps a bare number on a resident step with the resident assistant', async () => {
      const repo = repository();
      const adminRepository = adminNumber();
      const { financialRepository } = financialWith(sessionAt('alerts'));

      const result = await handleResidentMessage(message('1'), { repository: repo, adminRepository: adminRepository as never, financialRepository, send: vi.fn().mockResolvedValue({ success: true }) });

      expect(result.status).not.toBe('admin');
      expect(adminRepository.findActiveBinding).not.toHaveBeenCalled();
      expect(repo.findRosterMatches).toHaveBeenCalled();
    });

    it('ignores an admin step whose conversation has expired', async () => {
      const repo = repository();
      const adminRepository = adminNumber();
      const { financialRepository } = financialWith(sessionAt('admin_menu', { expiresAt: '2000-01-01T00:00:00Z' }));

      const result = await handleResidentMessage(message('1'), { repository: repo, adminRepository: adminRepository as never, financialRepository, send: vi.fn().mockResolvedValue({ success: true }) });

      expect(result.status).not.toBe('admin');
      expect(adminRepository.findActiveBinding).not.toHaveBeenCalled();
    });

    it('carries a message on to the resident assistant when the step cannot be read', async () => {
      const repo = repository();
      const financialRepository = { getSession: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as WhatsAppFinancialRepository;
      vi.spyOn(console, 'error').mockImplementation(() => {});

      const result = await handleResidentMessage(message('2'), { repository: repo, adminRepository: adminNumber() as never, financialRepository, send: vi.fn().mockResolvedValue({ success: true }) });

      expect(result.status).not.toBe('admin');
      expect(repo.findRosterMatches).toHaveBeenCalled();
    });
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
      'Welcome to Palm Estate Assistant. We could not safely match this number to one Resident. Ask the estate office for a link code, or reply STOP.\nContact the estate office on 0803 699 6725.'
    );
  });

  it('names the Assistant from the repository in the unmatched number welcome', async () => {
    const send = vi.fn().mockResolvedValue({ success: true });
    await handleResidentMessage(message('hello', '2348111111111'), {
      repository: repository({ findRosterMatches: vi.fn().mockResolvedValue([]), getAssistantName: vi.fn().mockResolvedValue('Ada') }),
      send,
    });
    expect(send.mock.calls[0]?.[0].body).toMatch(/^Welcome to Ada\. We could not/);
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

  it('clears the wrong-try count after a valid link code', async () => {
    const repo = repository({ consumeLinkToken: vi.fn().mockResolvedValue('resident-1') });
    await handleResidentMessage(message('LINK 123456', '2348111111111'), { repository: repo, send: vi.fn().mockResolvedValue({ success: true }) });
    expect(repo.claimLinkAttempt).toHaveBeenCalledWith('+2348111111111');
    expect(repo.clearLinkAttempts).toHaveBeenCalledWith('+2348111111111');
  });

  it('refuses a LINK code without checking it once the number is locked out (#1058)', async () => {
    const repo = repository({
      claimLinkAttempt: vi.fn().mockResolvedValue(false),
      consumeLinkToken: vi.fn().mockResolvedValue('resident-1'),
    });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('LINK 123456', '2348111111111'), { repository: repo, send });

    expect(result.status).toBe('pending');
    expect(repo.consumeLinkToken).not.toHaveBeenCalled();
    expect(repo.setOptIn).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('Too many wrong link codes');
  });

  describe('access only for in-scope residents (#1070)', () => {
    const BLOCKED_BODY = 'This service is for current residents of Palm Estate. Please contact the estate office.';
    const blocked = { ...resident, financialEligible: false, accessAllowed: false };

    it('sends the fixed reply to a blocked number once and reads nothing else about it', async () => {
      const repo = repository({ findRosterMatches: vi.fn().mockResolvedValue([blocked]) });
      const send = vi.fn().mockResolvedValue({ success: true });
      const onIdentified = vi.fn();

      const result = await handleResidentMessage(message('hello'), { repository: repo, send, onIdentified });

      expect(result).toMatchObject({ status: 'blocked', financialEligible: false, accessTier: 'community' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0]?.[0].body).toBe(BLOCKED_BODY);
      expect(repo.claimBlockedReply).toHaveBeenCalledWith('+2348000000000', 'resident-1');
      expect(onIdentified).not.toHaveBeenCalled();
      expect(repo.getConsentState).not.toHaveBeenCalled();
    });

    it('stays silent while the 24-hour reply has already been sent', async () => {
      const repo = repository({
        findRosterMatches: vi.fn().mockResolvedValue([blocked]),
        claimBlockedReply: vi.fn().mockResolvedValue(false),
      });
      const send = vi.fn().mockResolvedValue({ success: true });

      const result = await handleResidentMessage(message('what do I owe'), { repository: repo, send });

      expect(result.status).toBe('blocked');
      expect(send).not.toHaveBeenCalled();
    });

    it('still lets a blocked number opt out with STOP, and does not send the blocked reply', async () => {
      const repo = repository({ findRosterMatches: vi.fn().mockResolvedValue([blocked]) });
      const send = vi.fn().mockResolvedValue({ success: true });

      const result = await handleResidentMessage(message('STOP'), { repository: repo, send });

      expect(result.status).toBe('opted_out');
      expect(repo.setOptIn).toHaveBeenCalledWith('resident-1', '+2348000000000', false, 'in_chat');
      expect(repo.claimBlockedReply).not.toHaveBeenCalled();
      expect(send.mock.calls[0]?.[0].body).toContain('unsubscribed');
    });

    it('does not touch the admin flow for a blocked number', async () => {
      const repo = repository({ findRosterMatches: vi.fn().mockResolvedValue([blocked]) });
      const adminRepository = { getLockedUntil: vi.fn().mockResolvedValue(null), findLinkCode: vi.fn().mockResolvedValue(null), recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: null }) };
      const send = vi.fn().mockResolvedValue({ success: true });
      const financialRepository = { getSession: vi.fn().mockResolvedValue(null), saveSession: vi.fn() } as unknown as WhatsAppFinancialRepository;

      const result = await handleResidentMessage(message('ADMIN LINK 123456'), { repository: repo, adminRepository: adminRepository as never, financialRepository, send });

      expect(result.status).toBe('admin');
      expect(repo.claimBlockedReply).not.toHaveBeenCalled();
    });

    it('lets an allowed resident through without a blocked reply', async () => {
      const repo = repository();
      const send = vi.fn().mockResolvedValue({ success: true });

      const result = await handleResidentMessage(message('hello'), { repository: repo, send });

      expect(result.status).toBe('identified');
      expect(repo.claimBlockedReply).not.toHaveBeenCalled();
    });
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
  it.each(['absent', 'error', 'disabled'] as const)('reads no resident record and changes no state when the switch is off (%s)', async (reason) => {
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: false, reason });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const text of ['hello', 'STOP', 'START', 'LINK 123456', 'YES', '1']) {
      const repo = repository();
      const send = vi.fn().mockResolvedValue({ success: true });
      const onIdentified = vi.fn();
      // Holding reply and replay are covered in held-messages.test.ts (#1075).
      const heldMessages = {
        save: vi.fn().mockResolvedValue(undefined),
        claimHoldingReply: vi.fn().mockResolvedValue(false),
        clearHoldingReplies: vi.fn(),
        dropOlderThan: vi.fn(),
        takeOldest: vi.fn(),
      };

      const result = await handleResidentMessage(message(text), { repository: repo, send, onIdentified, heldMessages });

      expect(result).toEqual({ status: 'pending', residentId: null, optedIn: false, financialEligible: false, accessTier: 'community' });
      for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
      expect(send).not.toHaveBeenCalled();
      expect(onIdentified).not.toHaveBeenCalled();
    }
  });
});
