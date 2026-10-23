import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/recorder';
import { handleFinancialMessage, hashPin } from '@/lib/whatsapp/financial';
import type { FinancialHouse, WhatsAppFinancialRepository, WhatsAppFinancialSession } from '@/lib/whatsapp/financial';
import { createCoResidentLinkCode, getCoResidents } from '@/lib/whatsapp/co-resident';
import { handleResidentMessage, identityFingerprint } from '@/lib/whatsapp/identity';
import type { WhatsAppIdentityRepository, WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: vi.fn().mockResolvedValue({ recorded: true }) }));
vi.mock('@/lib/whatsapp/master-switch', () => ({ isWhatsAppMasterSwitchOn: vi.fn() }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn(), getRawSettingsAsService: vi.fn() }));

const SPONSOR = 'sponsor-1';
const PIN = '4821';

const sponsor: WhatsAppResidentIdentity = {
  id: SPONSOR,
  firstName: 'Ada',
  lastName: 'Example',
  residentCode: 'RES001',
  phonePrimary: '+2348000000000',
  phoneSecondary: null,
  financialEligible: true,
  accessAllowed: true,
};

const PALM: FinancialHouse = { id: 'house-1', label: '12 Palm Close', role: 'tenant' };
const PEOPLE = [
  { id: 'co-1', firstName: 'Bola', lastName: 'Example' },
  { id: 'co-2', firstName: 'Chidi', lastName: 'Example' },
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
});

let counter = 0;
function message(text: string, from = '2348000000000'): WhatsAppInboundMessage {
  counter += 1;
  return { id: `wamid-${counter}`, from, timestamp: '1760000000', type: 'text', text };
}

function repository(houses: FinancialHouse[], overrides: Record<string, unknown> = {}) {
  let session: WhatsAppFinancialSession | null = null;
  return {
    getSession: vi.fn(async () => (session ? { ...session } : null)),
    saveSession: vi.fn(async (next: WhatsAppFinancialSession) => {
      session = { ...next };
    }),
    getForcePin: vi.fn().mockResolvedValue(false),
    getPinHash: vi.fn().mockResolvedValue(hashPin(PIN)),
    claimPinAttempt: vi.fn().mockResolvedValue({ status: 'counted', triesInARow: 1, triesInWindow: 1, lockedUntil: null, hardLocked: false, claimedAt: '2026-10-23T10:00:00Z' }),
    clearPinAttempts: vi.fn().mockResolvedValue(undefined),
    getBillableHouses: vi.fn().mockResolvedValue(houses),
    getAssistantSettings: vi.fn().mockResolvedValue({ estatePhone: null, estateEmail: null, officeHours: null, paymentInstructions: null, keywordSynonyms: {} }),
    getLatestAnnouncements: vi.fn().mockResolvedValue([]),
    getCoResidents: vi.fn().mockResolvedValue(PEOPLE),
    createCoResidentLinkCode: vi.fn().mockResolvedValue({ code: '654321', expiresAt: '2026-10-23T11:00:00Z' }),
    ...overrides,
  };
}

type Repo = ReturnType<typeof repository>;

async function chat(repo: Repo, texts: string[]): Promise<string[]> {
  const send = vi.fn().mockResolvedValue({ success: true });
  for (const text of texts) {
    await handleFinancialMessage(message(text), sponsor, { repository: repo as unknown as WhatsAppFinancialRepository, optedIn: true, send });
  }
  return send.mock.calls.map((call) => call[0].body as string);
}

describe('Link a co-resident in the Assistant (#1072)', () => {
  it('offers Link a co-resident under More to a single-house sponsor', async () => {
    for (const role of ['tenant', 'resident_landlord']) {
      const replies = await chat(repository([{ ...PALM, role }]), ['1', PIN, '8']);
      expect(replies[1]).toContain('8. More');
      expect(replies[2]).toBe(['More', '1. Link a co-resident', 'Reply 0 for menu.'].join('\n'));
    }
  });

  it('does not offer it for a house the person does not live in as resident landlord or tenant', async () => {
    for (const house of [{ ...PALM, role: 'non_resident_landlord' }, { ...PALM, role: 'developer' }, { ...PALM, role: 'co_resident', accountResidentId: 'other', onBehalf: true }]) {
      const replies = await chat(repository([house]), ['1', PIN, '8']);
      expect(replies[1]).not.toContain('More');
    }
  });

  it('lists the co-residents of the selected house from More, after the PIN', async () => {
    const repo = repository([PALM]);
    const replies = await chat(repo, ['1', PIN, '8', '1']);
    expect(replies[3]).toBe(['Which co-resident?', '1. Bola Example', '2. Chidi Example', 'Reply with the number.'].join('\n'));
    expect(repo.getCoResidents).toHaveBeenCalledWith(SPONSOR, 'house-1');
  });

  it('asks for the PIN first when the keyword is typed while locked', async () => {
    const repo = repository([PALM]);
    const replies = await chat(repo, ['link co-resident', PIN]);
    expect(replies[0]).toContain('Enter your 4–6 digit PIN');
    expect(repo.getCoResidents).toHaveBeenCalledTimes(1);
    expect(replies[1]).toContain('PIN verified.');
    expect(replies[1]).toContain('1. Bola Example');
  });

  it('refuses without a PIN even where the estate does not require one to view figures', async () => {
    const repo = repository([PALM], { getPinHash: vi.fn().mockResolvedValue(null) });
    const replies = await chat(repo, ['link co-resident']);
    expect(replies[0]).toContain('A security PIN is required before linking a co-resident');
    expect(repo.getCoResidents).not.toHaveBeenCalled();
  });

  it('refuses a person who is not the resident landlord or tenant of the house', async () => {
    for (const house of [{ ...PALM, role: 'non_resident_landlord' }, { ...PALM, role: 'co_resident', accountResidentId: 'other', onBehalf: true }]) {
      const repo = repository([house]);
      const replies = await chat(repo, ['link co-resident', PIN]);
      expect(replies[1]).toContain('Only the resident landlord or tenant of 12 Palm Close can link a co-resident.');
      expect(repo.getCoResidents).not.toHaveBeenCalled();
    }
  });

  it('creates the code for the co-resident picked by number and shows it once', async () => {
    const repo = repository([PALM]);
    const replies = await chat(repo, ['1', PIN, 'link co-resident', '2']);
    expect(repo.createCoResidentLinkCode).toHaveBeenCalledWith({ sponsorId: SPONSOR, coResidentId: 'co-2', houseId: 'house-1' });
    expect(replies[3]).toContain('Link code for Chidi Example: *654321*');
    expect(replies[3]).toContain('expires in 60 minutes');
    expect(replies[3]).toContain('send LINK 654321');
  });

  it('never creates a resident: with no co-resident on record it points to the estate office', async () => {
    const repo = repository([PALM], { getCoResidents: vi.fn().mockResolvedValue([]) });
    const replies = await chat(repo, ['1', PIN, 'link co-resident', '1']);
    expect(replies[2]).toContain('There is no co-resident on record for 12 Palm Close');
    expect(repo.createCoResidentLinkCode).not.toHaveBeenCalled();
  });

  it('reads a number outside the list as unrecognised', async () => {
    const repo = repository([PALM]);
    const replies = await chat(repo, ['1', PIN, 'link co-resident', '3']);
    expect(replies[3]).toContain("I didn't catch that");
    expect(repo.createCoResidentLinkCode).not.toHaveBeenCalled();
  });

  it('does not create a code once the PIN is locked again', async () => {
    const repo = repository([PALM]);
    await chat(repo, ['1', PIN, 'link co-resident']);
    const session = await repo.getSession();
    await repo.saveSession({ ...session!, pinAuthenticated: false });
    await chat(repo, ['1']);
    expect(repo.createCoResidentLinkCode).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Issuing the code

function chain(result: unknown) {
  const query: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'in', 'is', 'not', 'filter', 'update', 'insert']) query[method] = vi.fn(() => query);
  query.single = vi.fn().mockResolvedValue(result);
  query.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return query as Record<string, ReturnType<typeof vi.fn>>;
}

const LIST_ROWS = { data: [{ resident: { id: 'co-2', first_name: 'Chidi', last_name: 'Example' } }, { resident: { id: 'co-1', first_name: 'Bola', last_name: 'Example' } }], error: null };

describe('createCoResidentLinkCode (#1072)', () => {
  function client(...queries: ReturnType<typeof chain>[]) {
    const from = vi.fn();
    queries.forEach((query) => from.mockReturnValueOnce(query));
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);
    return from;
  }

  it("lists only the sponsor's active co-residents of the house, sorted by name", async () => {
    const list = chain(LIST_ROWS);
    client(list);
    expect((await getCoResidents(SPONSOR, 'house-1')).map((person) => person.id)).toEqual(['co-1', 'co-2']);
    expect(list.eq).toHaveBeenCalledWith('house_id', 'house-1');
    expect(list.eq).toHaveBeenCalledWith('sponsor_resident_id', SPONSOR);
    expect(list.eq).toHaveBeenCalledWith('resident_role', 'co_resident');
    expect(list.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('issues nothing for someone who is not the sponsor’s co-resident on that house', async () => {
    const from = client(chain(LIST_ROWS));
    expect(await createCoResidentLinkCode({ sponsorId: SPONSOR, coResidentId: 'stranger', houseId: 'house-1' })).toBeNull();
    expect(from).toHaveBeenCalledTimes(1);
    expect(recordAudit).not.toHaveBeenCalled();
  });

  it('cancels the live link codes, stores a 60-minute single-use code by hash, and audits the sponsor as actor', async () => {
    const supersede = chain({ error: null });
    const insert = chain({ data: { id: 'token-1' }, error: null });
    client(chain(LIST_ROWS), supersede, insert);
    const before = Date.now();

    const issued = await createCoResidentLinkCode({ sponsorId: SPONSOR, coResidentId: 'co-1', houseId: 'house-1' });

    expect(issued?.code).toMatch(/^\d{6}$/);
    expect(supersede.update).toHaveBeenCalledWith({ used_at: expect.any(String) });
    expect(supersede.eq).toHaveBeenCalledWith('resident_id', 'co-1');
    expect(supersede.filter).toHaveBeenCalledWith('purpose', 'eq', 'link');
    expect(supersede.is).toHaveBeenCalledWith('used_at', null);
    expect(supersede.update.mock.invocationCallOrder[0]).toBeLessThan(insert.insert.mock.invocationCallOrder[0]);

    const row = insert.insert.mock.calls[0][0];
    expect(row).toMatchObject({ resident_id: 'co-1', purpose: 'link', issued_by_resident_id: SPONSOR, house_id: 'house-1', created_by: null });
    expect(row.token_hash).toBe(createHash('sha256').update(issued!.code).digest('hex'));
    const minutes = (Date.parse(row.expires_at) - before) / 60000;
    expect(minutes).toBeGreaterThan(59.9);
    expect(minutes).toBeLessThan(60.1);

    expect(recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'whatsapp_link_tokens', entityId: 'token-1' }),
      { userId: null, residentId: SPONSOR }
    );
    expect(JSON.stringify(vi.mocked(recordAudit).mock.calls[0])).not.toContain(issued!.code);
  });
});

// ---------------------------------------------------------------------------
// Redeeming the code

const coResident: WhatsAppResidentIdentity = { ...sponsor, id: 'co-1', firstName: 'Bola', phonePrimary: '+2348111111111' };
const ISSUER = { residentId: SPONSOR, coResidentFirstName: 'Bola', houseLabel: '12 Palm Close' };

function identityRepository(overrides: Partial<WhatsAppIdentityRepository> = {}): WhatsAppIdentityRepository {
  return {
    findRosterMatches: vi.fn().mockResolvedValue([]),
    findLinkedResidents: vi.fn().mockResolvedValue([]),
    getOptIn: vi.fn().mockResolvedValue(false),
    setOptIn: vi.fn().mockResolvedValue(undefined),
    rememberPendingContact: vi.fn().mockResolvedValue(undefined),
    consumeLinkToken: vi.fn().mockResolvedValue('co-1'),
    findLinkCodeIssuer: vi.fn().mockResolvedValue(ISSUER),
    sendLinkNotice: vi.fn().mockResolvedValue(undefined),
    claimLinkAttempt: vi.fn().mockResolvedValue(true),
    clearLinkAttempts: vi.fn().mockResolvedValue(undefined),
    attachPendingContact: vi.fn().mockResolvedValue(undefined),
    getStreetName: vi.fn().mockResolvedValue('Palm Street'),
    getConsentState: vi.fn().mockResolvedValue({ confirmedFingerprint: identityFingerprint(coResident, 'Palm Street'), privacy: null, step: null, pendingRequest: null }),
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
    ...overrides,
  };
}

describe('LINK with a code from a sponsor (#1072)', () => {
  it("links a number that is on nobody's roster and tells the sponsor", async () => {
    const repo = identityRepository();
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('LINK 654321', '2348222222222'), { repository: repo, send });

    expect(result).toMatchObject({ status: 'linked', residentId: 'co-1' });
    expect(repo.setOptIn).toHaveBeenCalledWith('co-1', '+2348222222222', false, 'in_chat', true);
    expect(repo.sendLinkNotice).toHaveBeenCalledWith(SPONSOR, 'Bola is now linked to 12 Palm Close on WhatsApp.', expect.any(String));
  });

  it("refuses it from a number linked to the sponsor, without using the code", async () => {
    const repo = identityRepository({ findLinkedResidents: vi.fn().mockResolvedValue([sponsor]) });
    const send = vi.fn().mockResolvedValue({ success: true });

    const result = await handleResidentMessage(message('LINK 654321'), { repository: repo, send });

    expect(result.status).toBe('pending');
    expect(send.mock.calls[0][0].body).toContain('They need to send it from their own WhatsApp number.');
    expect(repo.consumeLinkToken).not.toHaveBeenCalled();
    expect(repo.setOptIn).not.toHaveBeenCalled();
    expect(repo.sendLinkNotice).not.toHaveBeenCalled();
  });

  it("refuses it from the sponsor's roster number, even when that number is linked to someone else", async () => {
    for (const linked of [[], [{ ...sponsor, id: 'someone-else' }]]) {
      const repo = identityRepository({ findLinkedResidents: vi.fn().mockResolvedValue(linked), findRosterMatches: vi.fn().mockResolvedValue([sponsor]) });
      await handleResidentMessage(message('LINK 654321'), { repository: repo, send: vi.fn().mockResolvedValue({ success: true }) });
      expect(repo.consumeLinkToken).not.toHaveBeenCalled();
    }
  });

  it('sends no notice for a code from the estate office', async () => {
    const repo = identityRepository({ findLinkCodeIssuer: vi.fn().mockResolvedValue(null), findRosterMatches: vi.fn().mockResolvedValue([sponsor]) });
    const result = await handleResidentMessage(message('LINK 654321'), { repository: repo, send: vi.fn().mockResolvedValue({ success: true }) });
    expect(result.status).toBe('linked');
    expect(repo.sendLinkNotice).not.toHaveBeenCalled();
  });
});
