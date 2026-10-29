import { describe, expect, it, vi } from 'vitest';
import {
  adminCapReply,
  ADMIN_DAILY_ACTION_CAP,
  ADMIN_ITEM_NODE,
  ADMIN_NOT_ALLOWED_REPLY,
  accountFingerprint,
  handleWhatsAppAdminStep,
  type WhatsAppAdminAccount,
  type WhatsAppAdminBinding,
  type WhatsAppAdminRepository,
} from '@/lib/whatsapp/admin';
import {
  OWES_PICK_MINUTES,
  composeAdminOwesAnswer,
  type OwesCandidate,
  type OwesHouseData,
  type OwesRepository,
} from '@/lib/whatsapp/admin-owes';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';

const NOW = new Date('2026-10-22T10:00:00Z');
const PHONE = '+2348000000001';

const account: WhatsAppAdminAccount = {
  profileId: 'admin-1',
  fullName: 'Ada Admin',
  email: 'ada@example.test',
  approvalStatus: 'active',
  roleId: 'role-fin',
  roleName: 'financial_officer',
  roleDisplayName: 'Financial Officer',
  roleCategory: 'exco',
  permissions: ['whatsapp_admin.query', 'whatsapp_admin.resident_status'],
  totpSecret: 'JBSWY3DPEHPK3PXPJBSWY3DPEHPK3PXP',
};

const liveBinding = (overrides: Partial<WhatsAppAdminBinding> = {}): WhatsAppAdminBinding => ({
  id: 'binding-1',
  profileId: account.profileId,
  phoneNumber: PHONE,
  boundAt: '2026-10-20T10:00:00Z',
  lastUsedAt: '2026-10-21T10:00:00Z',
  lastTotpStep: 1,
  sessionExpiresAt: '2026-10-22T10:10:00Z',
  accountFingerprint: accountFingerprint(account),
  codeRequired: true,
  ...overrides,
});

const house = (overrides: Partial<OwesHouseData> = {}): OwesHouseData => ({
  houseId: 'house-1',
  houseLabel: 'KOA-18A',
  billedTo: { residentId: 'res-1', name: 'Tolu Bello' },
  status: { label: 'Arrears' },
  owed: {
    invoiceCount: 3,
    outstanding: 45000,
    overdue: { total: 30000, count: 2, oldestDue: '2026-08-15', charges: [] },
    next: null,
    awaitingVerification: 0,
  },
  unpaidMonths: { from: '2026-08-01', to: '2026-10-01' },
  lastPayment: { amount: 100000, date: '2025-06-14' },
  walletBalance: 2500,
  ...overrides,
});

const candidate = (code: string, name: string | null = null): OwesCandidate => ({ houseId: `id-${code}`, houseLabel: code, code, name });

function owesRepo(overrides: Partial<OwesRepository> = {}): OwesRepository {
  return {
    searchHouseCodes: vi.fn().mockResolvedValue([]),
    searchResidents: vi.fn().mockResolvedValue([]),
    loadHouse: vi.fn().mockImplementation(async (houseId: string) => house({ houseId })),
    saveChoices: vi.fn().mockResolvedValue(undefined),
    loadChoices: vi.fn().mockResolvedValue(null),
    clearChoices: vi.fn().mockResolvedValue(undefined),
    logDisclosure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function adminRepo(overrides: Partial<WhatsAppAdminRepository> = {}): WhatsAppAdminRepository {
  return {
    getLockedUntil: vi.fn().mockResolvedValue(null),
    recordWrongCode: vi.fn().mockResolvedValue({ lockedUntil: null }),
    clearWrongCodes: vi.fn().mockResolvedValue(undefined),
    findLinkCode: vi.fn().mockResolvedValue(null),
    activateBinding: vi.fn().mockResolvedValue(true),
    findActiveBinding: vi.fn().mockResolvedValue(liveBinding()),
    getCodeRequired: vi.fn().mockResolvedValue(true),
    getDailyCap: vi.fn().mockResolvedValue(ADMIN_DAILY_ACTION_CAP),
    findAutoLinkProfile: vi.fn().mockResolvedValue(null),
    createBinding: vi.fn().mockResolvedValue(null),
    setSessionExpiry: vi.fn().mockResolvedValue(undefined),
    revokeBinding: vi.fn().mockResolvedValue(undefined),
    loadAccount: vi.fn().mockResolvedValue(account),
    acceptCode: vi.fn().mockResolvedValue(true),
    touchBinding: vi.fn().mockResolvedValue(undefined),
    createRequest: vi.fn().mockResolvedValue('request-1'),
    takePendingRequest: vi.fn().mockResolvedValue(null),
    // Resident status is on screen (#1292): the reply is the query or a number from the list.
    findPendingChoice: vi.fn().mockResolvedValue({ action: 'owes', state: {} }),
    countDoneSince: vi.fn().mockResolvedValue(0),
    audit: vi.fn().mockResolvedValue(undefined),
    emailAdmin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

/** A reply on the Resident status step (Admin tools item 1, #1292). */
async function send(text: string, repository: WhatsAppAdminRepository, owesRepository: OwesRepository) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const message: WhatsAppInboundMessage = { id: `wamid-${text}`, from: PHONE.slice(1), timestamp: '1760000000', type: 'text', text };
  await handleWhatsAppAdminStep(message, ADMIN_ITEM_NODE, { repository, owesRepository, reply, setStep: vi.fn(), now: () => NOW });
  return reply;
}

describe('Resident status (owes lookup)', () => {
  it('answers at once for a house code and logs the disclosure and the audit', async () => {
    const owes = owesRepo({ searchHouseCodes: vi.fn().mockResolvedValue([candidate('KOA-18A'), candidate('KOA-18AB')]) });
    const repo = adminRepo();
    const reply = await send('koa-18a', repo, owes);

    const text = reply.mock.calls[0][0] as string;
    expect(text.startsWith([
      '*KOA-18A, Tolu Bello*: Arrears',
      'Owes ₦45,000.00 for Aug 2026 to Oct 2026. Last payment was ₦100,000.00 (Jun 2025).',
      'Credit: ₦2,500.00 (not for these bills)',
    ].join('\n'))).toBe(true);
    expect(owes.logDisclosure).toHaveBeenCalledWith({ residentId: 'res-1', phoneNumber: PHONE, houseId: 'id-KOA-18A', adminProfileId: 'admin-1' });
    expect(repo.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VERIFY', entityType: 'houses', entityId: 'id-KOA-18A' }),
      'admin-1'
    );
  });

  it('answers at once for one name match', async () => {
    const owes = owesRepo({ searchResidents: vi.fn().mockResolvedValue([candidate('KOA-18A', 'Tolu Bello')]) });
    const reply = await send('tolu', adminRepo(), owes);
    expect(owes.searchResidents).toHaveBeenCalledWith(['tolu']);
    expect(reply.mock.calls[0][0]).toContain('*KOA-18A, Tolu Bello*: Arrears');
  });

  it('lists several name matches, numbered, and keeps the list for five minutes', async () => {
    const owes = owesRepo({ searchResidents: vi.fn().mockResolvedValue([candidate('KOA-1', 'Ada Obi'), candidate('KOA-2', 'Ada Bello')]) });
    const reply = await send('ada', adminRepo(), owes);

    expect(reply.mock.calls[0][0]).toContain('1. Ada Obi, KOA-1');
    expect(reply.mock.calls[0][0]).toContain('2. Ada Bello, KOA-2');
    expect(owes.logDisclosure).not.toHaveBeenCalled();
    const [requestId, choices, expiresAt] = (owes.saveChoices as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(requestId).toBe('request-1');
    expect(choices).toHaveLength(2);
    expect(expiresAt).toBe(new Date(NOW.getTime() + OWES_PICK_MINUTES * 60 * 1000).toISOString());
  });

  it('audits the query and the houses listed', async () => {
    const owes = owesRepo({ searchResidents: vi.fn().mockResolvedValue([candidate('KOA-1', 'Ada Obi'), candidate('KOA-2', 'Ada Bello')]) });
    const repo = adminRepo();
    await send('ada', repo, owes);
    expect(repo.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        entityType: 'whatsapp_admin_requests',
        entityId: 'request-1',
        metadata: expect.objectContaining({ query: 'ada', listed: [{ house_id: 'id-KOA-1', name: 'Ada Obi' }, { house_id: 'id-KOA-2', name: 'Ada Bello' }] }),
      }),
      'admin-1'
    );
  });

  it('asks to narrow when more than five match', async () => {
    const many = ['A', 'B', 'C', 'D', 'E', 'F'].map((code) => candidate(`KOA-${code}`, `Ada ${code}`));
    const owes = owesRepo({ searchResidents: vi.fn().mockResolvedValue(many) });
    const reply = await send('ada', adminRepo(), owes);
    expect(reply.mock.calls[0][0]).toMatch(/More than 5 matches/);
    expect(owes.saveChoices).not.toHaveBeenCalled();
  });

  it('answers the house picked from a live list and drops the list', async () => {
    const expiresAt = new Date(NOW.getTime() + 1000).toISOString();
    const owes = owesRepo({ loadChoices: vi.fn().mockResolvedValue({ choices: [candidate('KOA-1', 'Ada Obi'), candidate('KOA-2', 'Ada Bello')], expiresAt }) });
    const reply = await send('2', adminRepo(), owes);
    expect(owes.loadHouse).toHaveBeenCalledWith('id-KOA-2');
    expect(owes.clearChoices).toHaveBeenCalledWith('binding-1');
    expect(reply.mock.calls[0][0]).toContain('*KOA-18A, Tolu Bello*: Arrears');
  });

  it('refuses a pick when the list has expired', async () => {
    const owes = owesRepo({ loadChoices: vi.fn().mockResolvedValue({ choices: [candidate('KOA-1', 'Ada Obi')], expiresAt: NOW.toISOString() }) });
    const reply = await send('1', adminRepo(), owes);
    expect(owes.loadChoices).toHaveBeenCalledWith('binding-1');
    expect(reply.mock.calls[0][0]).toMatch(/no list to pick from, or it ran out after 5 minutes/);
    expect(owes.loadHouse).not.toHaveBeenCalled();
  });

  it('refuses a pick when there is no list', async () => {
    const owes = owesRepo();
    const reply = await send('1', adminRepo(), owes);
    expect(reply.mock.calls[0][0]).toMatch(/no list to pick from/);
    expect(owes.loadHouse).not.toHaveBeenCalled();
  });

  it('says so when nothing matches', async () => {
    const reply = await send('zzz', adminRepo(), owesRepo());
    expect(reply.mock.calls[0][0]).toMatch(/^No house or resident matches "zzz"\./);
  });

  it('stops at the daily cap without searching', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ countDoneSince: vi.fn().mockResolvedValue(ADMIN_DAILY_ACTION_CAP) });
    const reply = await send('KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toMatch(new RegExp(`^${adminCapReply(ADMIN_DAILY_ACTION_CAP)}`));
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });

  it('refuses an admin without whatsapp_admin.resident_status, even with finance view (#1292)', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ loadAccount: vi.fn().mockResolvedValue({ ...account, permissions: ['whatsapp_admin.query', 'billing.view'] }) });
    const reply = await send('KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toMatch(new RegExp(`^${ADMIN_NOT_ALLOWED_REPLY}`));
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });

  it('keeps the step open for the next house after an answer', async () => {
    const owes = owesRepo({ searchHouseCodes: vi.fn().mockResolvedValue([candidate('KOA-18A')]) });
    const repo = adminRepo();
    const reply = await send('KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toMatch(/Send another house code or name, or reply 0 for Admin tools\.$/);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'owes:choose', status: 'pending' }));
  });

  it('leaves a number that is not an admin number to the resident assistant', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ findActiveBinding: vi.fn().mockResolvedValue(null) });
    const reply = await send('KOA-18A', repo, owes);
    expect(reply).not.toHaveBeenCalled();
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });

  it('asks for the code again when the session has ended, without searching', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ findActiveBinding: vi.fn().mockResolvedValue(liveBinding({ sessionExpiresAt: null })) });
    const reply = await send('KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toMatch(/session has ended[\s\S]*6-digit code/);
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });
});

describe('composeAdminOwesAnswer', () => {
  it('shows the signed roll-forward figure and the wallet credit', () => {
    const text = composeAdminOwesAnswer(house({ owed: { invoiceCount: 1, outstanding: -1000, rollForward: true, overdue: null, next: null, awaitingVerification: 0 }, unpaidMonths: null }));
    expect(text).toContain('Owes nothing, ₦1,000.00 in credit. Last payment was ₦100,000.00 (Jun 2025).');
    expect(text).not.toContain('not for these bills');
    expect(text).not.toContain('netted');
  });

  it('says which months the credit pays when nothing is owed (owner decision 29 Oct 2026)', () => {
    const owed = { invoiceCount: 4, outstanding: 0, overdue: null, next: null, nextPaymentDue: '2027-01-01', awaitingVerification: 0, credit: { amount: 20000, months: ['2026-11-01', '2026-12-01'] } };
    const text = composeAdminOwesAnswer(house({ owed, unpaidMonths: null, walletBalance: 20000, status: { label: 'Credit' } }));
    expect(text).toBe([
      '*KOA-18A, Tolu Bello*: Credit',
      'Fully paid up. Last payment was ₦100,000.00 (Jun 2025).',
      'Credit: ₦20,000.00. This pays Nov and Dec 2026.',
    ].join('\n'));
  });

  it('names one month alone, and says so when there is no payment or bill', () => {
    const owed = { invoiceCount: 1, outstanding: 10000, overdue: null, next: null, awaitingVerification: 5000 };
    const one = composeAdminOwesAnswer(house({ owed, unpaidMonths: { from: '2026-10-01', to: '2026-10-01' }, lastPayment: null, walletBalance: 0 }));
    expect(one).toContain('Owes ₦10,000.00 for Oct 2026. No payment on record.');
    expect(one).toContain('Awaiting verification: ₦5,000.00');
    const none = composeAdminOwesAnswer(house({ owed: { ...owed, invoiceCount: 0, outstanding: 0, awaitingVerification: 0 }, unpaidMonths: null, walletBalance: 0 }));
    expect(none).toContain('No bills on record.');
  });

  it('says so when no resident is billed', () => {
    expect(composeAdminOwesAnswer(house({ billedTo: null, owed: null }))).toContain('No resident is billed');
  });
});
