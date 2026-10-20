import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ACCEPT_ANY_TIME,
  DECLINED_REPLY,
  NOT_ME_REPLY,
  handleResidentMessage,
  identityFingerprint,
} from '@/lib/whatsapp/identity';
import type { WhatsAppConsentState, WhatsAppIdentityRepository, WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';

/** #871: identity read-back, privacy notice, consent log, dispute and resume. */
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
const PHONE = '+2348000000000';
const FINGERPRINT = identityFingerprint(resident, 'Palm Street');
const CONTACT = 'Contact the estate office on 08011111111.';
const NOTICE_URL = 'https://storage.test/notice.pdf';

function message(text: string): WhatsAppInboundMessage {
  return { id: `wamid-${text}`, from: '2348000000000', timestamp: '1760000000', type: 'text', text };
}

function state(overrides: Partial<WhatsAppConsentState> = {}): WhatsAppConsentState {
  return { confirmedFingerprint: null, privacy: null, step: null, pendingRequest: null, ...overrides };
}

const confirmed = (overrides: Partial<WhatsAppConsentState> = {}) => state({ confirmedFingerprint: FINGERPRINT, ...overrides });

function repository(consent: WhatsAppConsentState, overrides: Partial<WhatsAppIdentityRepository> = {}): WhatsAppIdentityRepository {
  return {
    findRosterMatches: vi.fn().mockResolvedValue([resident]),
    findLinkedResidents: vi.fn().mockResolvedValue([]),
    getOptIn: vi.fn().mockResolvedValue(false),
    setOptIn: vi.fn().mockResolvedValue(undefined),
    rememberPendingContact: vi.fn().mockResolvedValue(undefined),
    consumeLinkToken: vi.fn().mockResolvedValue(null),
    attachPendingContact: vi.fn().mockResolvedValue(undefined),
    getStreetName: vi.fn().mockResolvedValue('Palm Street'),
    getConsentState: vi.fn().mockResolvedValue(consent),
    recordConsentDecision: vi.fn().mockResolvedValue(undefined),
    saveConsentStep: vi.fn().mockResolvedValue(undefined),
    isDisputed: vi.fn().mockResolvedValue(false),
    markDisputed: vi.fn().mockResolvedValue(undefined),
    notifyDisputed: vi.fn().mockResolvedValue(undefined),
    getPrivacyNotice: vi.fn().mockResolvedValue({ version: 'v1', text: 'Full notice' }),
    getPrivacyNoticeUrl: vi.fn().mockResolvedValue(NOTICE_URL),
    getOfficeContactLine: vi.fn().mockResolvedValue(CONTACT),
    ...overrides,
  };
}

async function run(text: string, repo: WhatsAppIdentityRepository, send = vi.fn().mockResolvedValue({ success: true })) {
  const onIdentified = vi.fn().mockResolvedValue(undefined);
  const result = await handleResidentMessage(message(text), { repository: repo, send, onIdentified });
  return { result, send, onIdentified, bodies: send.mock.calls.map((call) => call[0].body as string) };
}

describe('identity read-back (#871 step 1)', () => {
  it('reads back first name, last initial and street before anything else, and holds the request', async () => {
    const repo = repository(state());
    const { result, bodies, onIdentified } = await run('OWE', repo);

    expect(result.status).toBe('consent_pending');
    expect(bodies).toEqual(["This number is registered to Ada E. on Palm Street. Is that you?\n1. Yes, that's me\n2. No, not me"]);
    expect(bodies[0]).not.toContain('Example');
    expect(repo.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', `identity:${FINGERPRINT}`, 'OWE');
    expect(repo.recordConsentDecision).not.toHaveBeenCalled();
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('omits the street when the resident has none on record', async () => {
    const repo = repository(state(), { getStreetName: vi.fn().mockResolvedValue(null) });
    const { bodies } = await run('hi', repo);

    expect(bodies[0]).toMatch(/^This number is registered to Ada E\. Is that you\?/);
  });

  it('does not take a bare "1" as confirmation unless the read-back was shown', async () => {
    const repo = repository(state());
    const { bodies } = await run('1', repo);

    expect(repo.recordConsentDecision).not.toHaveBeenCalled();
    expect(bodies[0]).toContain('Is that you?');
    expect(repo.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', `identity:${FINGERPRINT}`, null);
  });

  it('records the confirmation with the message id and then shows the privacy notice with its PDF', async () => {
    const repo = repository(state({ step: `identity:${FINGERPRINT}`, pendingRequest: 'OWE' }));
    const { result, send, onIdentified } = await run('1', repo);

    expect(repo.recordConsentDecision).toHaveBeenCalledWith({
      residentId: 'resident-1',
      phoneNumber: PHONE,
      decision: 'identity_confirmed',
      identityFingerprint: FINGERPRINT,
      providerMessageId: 'wamid-1',
    });
    expect(result.status).toBe('consent_pending');
    expect(send.mock.calls[0][0]).toMatchObject({ mediaUrls: [NOTICE_URL] });
    expect(send.mock.calls[0][0].body).toContain('privacy notice (version v1)');
    expect(send.mock.calls[0][0].body).toContain('1. Accept\n2. Decline');
    expect(repo.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', 'privacy:resident-1:v1', 'OWE');
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('asks again when the roster record changes', async () => {
    const repo = repository(confirmed({ privacy: { decision: 'privacy_accepted', version: 'v1' } }), {
      getStreetName: vi.fn().mockResolvedValue('Oak Avenue'),
    });
    const { bodies, onIdentified } = await run('OWE', repo);

    expect(bodies[0]).toContain('on Oak Avenue. Is that you?');
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('resumes the held request when a re-confirmation follows an accepted notice', async () => {
    const changed = identityFingerprint(resident, 'Oak Avenue');
    const repo = repository(
      state({ confirmedFingerprint: FINGERPRINT, privacy: { decision: 'privacy_accepted', version: 'v1' }, step: `identity:${changed}`, pendingRequest: 'OWE' }),
      { getStreetName: vi.fn().mockResolvedValue('Oak Avenue') }
    );
    const { onIdentified } = await run('1', repo);

    expect(onIdentified).toHaveBeenCalledWith(expect.objectContaining({ text: 'OWE' }), resident);
  });

  it('does not opt in to alerts on START before the holder is confirmed', async () => {
    const repo = repository(state());
    const { bodies } = await run('START', repo);

    expect(repo.setOptIn).not.toHaveBeenCalled();
    expect(bodies[0]).toContain('Is that you?');
  });

  it('shows the read-back to admin-imported opt-ins too (#871 step 6)', async () => {
    const repo = repository(state(), { getOptIn: vi.fn().mockResolvedValue(true) });
    const { bodies, onIdentified } = await run('hello', repo);

    expect(bodies[0]).toContain('Is that you?');
    expect(onIdentified).not.toHaveBeenCalled();
  });
});

describe('a failed send is retried as the same inbound', () => {
  const failing = () => vi.fn().mockResolvedValue({ success: false, error: 'down' });

  it('does not save the identity step when the read-back was not delivered', async () => {
    const repo = repository(state());
    await expect(run('1', repo, failing())).rejects.toThrow('down');

    expect(repo.saveConsentStep).not.toHaveBeenCalled();
  });

  it('does not save the privacy step when the notice was not delivered, so a retried "1" is not acceptance', async () => {
    const repo = repository(state({ step: `identity:${FINGERPRINT}` }));
    await expect(run('1', repo, failing())).rejects.toThrow('down');
    expect(repo.saveConsentStep).not.toHaveBeenCalled();

    const retry = repository(confirmed({ step: `identity:${FINGERPRINT}` }));
    const { bodies } = await run('1', retry);
    expect(retry.recordConsentDecision).not.toHaveBeenCalled();
    expect(bodies[0]).toContain('1. Accept');
  });

  it('does not save the privacy step when the notice PDF cannot be produced', async () => {
    const repo = repository(confirmed(), { getPrivacyNoticeUrl: vi.fn().mockRejectedValue(new Error('upload failed')) });
    await expect(run('hi', repo)).rejects.toThrow('upload failed');

    expect(repo.saveConsentStep).not.toHaveBeenCalled();
  });

  it('keeps the held request when the resume after acceptance fails, and resumes it on the retry', async () => {
    const repo = repository(confirmed({ step: 'privacy:resident-1:v1', pendingRequest: 'OWE' }));
    const onIdentified = vi.fn().mockRejectedValue(new Error('handler send failed'));
    await expect(handleResidentMessage(message('1'), {
      repository: repo, send: vi.fn().mockResolvedValue({ success: true }), onIdentified,
    })).rejects.toThrow('handler send failed');
    expect(repo.recordConsentDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: 'privacy_accepted' }));
    expect(repo.saveConsentStep).not.toHaveBeenCalled();

    const retry = repository(confirmed({
      step: 'privacy:resident-1:v1', pendingRequest: 'OWE', privacy: { decision: 'privacy_accepted', version: 'v1' },
    }));
    const again = await run('1', retry);
    expect(again.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ text: 'OWE' }), resident);
    expect(retry.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', null, null);
  });

  it('keeps the held request when a re-confirmation resume fails, and a retried "yes" is not START', async () => {
    const changed = identityFingerprint(resident, 'Oak Avenue');
    const leftover = { privacy: { decision: 'privacy_accepted' as const, version: 'v1' }, step: `identity:${changed}`, pendingRequest: 'OWE' };
    const oak = { getStreetName: vi.fn().mockResolvedValue('Oak Avenue') };
    const repo = repository(state({ confirmedFingerprint: FINGERPRINT, ...leftover }), oak);
    await expect(handleResidentMessage(message('yes'), {
      repository: repo, send: vi.fn().mockResolvedValue({ success: true }), onIdentified: vi.fn().mockRejectedValue(new Error('down')),
    })).rejects.toThrow('down');
    expect(repo.saveConsentStep).not.toHaveBeenCalled();

    const retry = repository(state({ confirmedFingerprint: changed, ...leftover }), oak);
    const again = await run('yes', retry);
    expect(again.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ text: 'OWE' }), resident);
    expect(retry.setOptIn).not.toHaveBeenCalled();
    expect(retry.recordConsentDecision).not.toHaveBeenCalled();
  });

  it('alerts admins of a dispute even when the reply fails', async () => {
    const repo = repository(state({ step: `identity:${FINGERPRINT}` }));
    await expect(run('2', repo, failing())).rejects.toThrow('down');

    expect(repo.notifyDisputed).toHaveBeenCalledWith(PHONE, 'resident-1');
  });
});

describe('"No, not me" (#871 step 2)', () => {
  it('records the dispute, marks the number, alerts admins and shows nothing', async () => {
    const repo = repository(state({ step: `identity:${FINGERPRINT}`, pendingRequest: 'OWE' }));
    const { result, bodies, onIdentified } = await run('2', repo);

    expect(result.status).toBe('disputed');
    expect(repo.recordConsentDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: 'identity_disputed', providerMessageId: 'wamid-2' }));
    expect(repo.markDisputed).toHaveBeenCalledWith(PHONE, 'resident-1');
    expect(repo.notifyDisputed).toHaveBeenCalledWith(PHONE, 'resident-1');
    expect(repo.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', null, null);
    expect(bodies).toEqual([`${NOT_ME_REPLY}\n${CONTACT}`]);
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('blocks every answer for a disputed number until an admin clears it', async () => {
    const repo = repository(confirmed({ privacy: { decision: 'privacy_accepted', version: 'v1' } }), {
      isDisputed: vi.fn().mockResolvedValue(true),
    });
    const { result, bodies, onIdentified } = await run('OWE', repo);

    expect(result.status).toBe('disputed');
    expect(bodies[0]).toBe(`${NOT_ME_REPLY}\n${CONTACT}`);
    expect(bodies[0]).not.toContain('Ada');
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('still honours STOP on a disputed number', async () => {
    const repo = repository(state(), { isDisputed: vi.fn().mockResolvedValue(true) });
    const { result } = await run('STOP', repo);

    expect(result.status).toBe('opted_out');
    expect(repo.setOptIn).toHaveBeenCalledWith('resident-1', PHONE, false, 'in_chat');
  });
});

describe('privacy notice (#871 steps 3-7)', () => {
  const prompted = (overrides: Partial<WhatsAppConsentState> = {}) => confirmed({ step: 'privacy:resident-1:v1', ...overrides });

  it('records acceptance with the notice version and resumes the held request through the financial handler', async () => {
    const repo = repository(prompted({ pendingRequest: 'OWE' }));
    const { result, bodies, onIdentified } = await run('1', repo);

    expect(repo.recordConsentDecision).toHaveBeenCalledWith({
      residentId: 'resident-1',
      phoneNumber: PHONE,
      decision: 'privacy_accepted',
      noticeVersion: 'v1',
      providerMessageId: 'wamid-1',
    });
    expect(repo.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', null, null);
    expect(bodies[0]).toContain('acceptance of privacy notice v1 is recorded');
    expect(onIdentified).toHaveBeenCalledWith(expect.objectContaining({ id: 'wamid-1', text: 'OWE' }), resident);
    expect(result.status).toBe('identified');
  });

  it('opens the menu after acceptance when nothing was held', async () => {
    const repo = repository(prompted());
    const { onIdentified } = await run('ACCEPT', repo);

    expect(onIdentified).toHaveBeenCalledWith(expect.objectContaining({ text: 'MENU' }), resident);
  });

  it('does not take a bare "1" as acceptance unless the notice was shown', async () => {
    const repo = repository(confirmed());
    const { bodies, send, onIdentified } = await run('1', repo);

    expect(repo.recordConsentDecision).not.toHaveBeenCalled();
    expect(bodies[0]).toContain('1. Accept');
    expect(send.mock.calls[0][0].mediaUrls).toEqual([NOTICE_URL]);
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it.each(['yes', 'START'])('does not read "%s" at the notice prompt as the alerts opt-in, and re-sends the notice', async (text) => {
    const repo = repository(prompted());
    const { result, bodies, send } = await run(text, repo);

    expect(repo.setOptIn).not.toHaveBeenCalled();
    expect(repo.recordConsentDecision).not.toHaveBeenCalled();
    expect(result).toMatchObject({ status: 'consent_pending', optedIn: false });
    expect(bodies[0]).not.toContain('alerts are now enabled');
    expect(bodies[0]).toContain('1. Accept\n2. Decline');
    expect(send.mock.calls[0][0].mediaUrls).toEqual([NOTICE_URL]);
  });

  it('records a decline, gives the office contact and uses no records', async () => {
    const repo = repository(prompted({ pendingRequest: 'OWE' }));
    const { result, bodies, onIdentified } = await run('2', repo);

    expect(result.status).toBe('declined');
    expect(repo.recordConsentDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: 'privacy_declined', noticeVersion: 'v1' }));
    expect(repo.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', null, null);
    expect(bodies).toEqual([`${DECLINED_REPLY}\n${CONTACT}\n${ACCEPT_ANY_TIME}`]);
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('after a decline, keeps no request and answers nothing until ACCEPT', async () => {
    const declined = confirmed({ privacy: { decision: 'privacy_declined', version: 'v1' } });
    const later = await run('OWE', repository(declined));
    expect(later.result.status).toBe('declined');
    expect(later.onIdentified).not.toHaveBeenCalled();

    const repo = repository(declined);
    const accept = await run('ACCEPT', repo);
    expect(repo.recordConsentDecision).toHaveBeenCalledWith(expect.objectContaining({ decision: 'privacy_accepted', noticeVersion: 'v1' }));
    expect(accept.onIdentified).toHaveBeenCalled();
  });

  it('re-shows the notice only when its version changes', async () => {
    const accepted = confirmed({ privacy: { decision: 'privacy_accepted', version: 'v1' } });
    const same = await run('OWE', repository(accepted));
    expect(same.onIdentified).toHaveBeenCalledWith(expect.objectContaining({ text: 'OWE' }), resident);

    const bumped = repository(accepted, { getPrivacyNotice: vi.fn().mockResolvedValue({ version: 'v2', text: 'New notice' }) });
    const changed = await run('OWE', bumped);
    expect(changed.onIdentified).not.toHaveBeenCalled();
    expect(changed.bodies[0]).toContain('version v2');
    expect(bumped.saveConsentStep).toHaveBeenCalledWith(PHONE, 'resident-1', 'privacy:resident-1:v2', 'OWE');
  });

  it('uses no records while no notice is published', async () => {
    const repo = repository(confirmed(), { getPrivacyNotice: vi.fn().mockResolvedValue(null) });
    const { result, onIdentified } = await run('OWE', repo);

    expect(result.status).toBe('consent_pending');
    expect(onIdentified).not.toHaveBeenCalled();
  });

  it('gates financial answers on the privacy decision, not the alerts opt-in (#871 step 9)', async () => {
    const repo = repository(confirmed({ privacy: { decision: 'privacy_accepted', version: 'v1' } }), {
      getOptIn: vi.fn().mockResolvedValue(false),
    });
    const { onIdentified } = await run('OWE', repo);

    expect(onIdentified).toHaveBeenCalled();
    expect(repo.setOptIn).not.toHaveBeenCalled();
  });
});
