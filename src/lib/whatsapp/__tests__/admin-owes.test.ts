import { describe, expect, it, vi } from 'vitest';
import {
  ADMIN_CAP_REPLY,
  ADMIN_DAILY_ACTION_CAP,
  ADMIN_NOT_ALLOWED_REPLY,
  ADMIN_NOT_LINKED_REPLY,
  accountFingerprint,
  handleWhatsAppAdminMessage,
  parseWhatsAppAdminCommand,
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
  permissions: ['whatsapp_admin.query', 'billing.view'],
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
    overdue: { total: 30000, count: 2, oldestDue: '2026-08-15' },
    next: null,
    awaitingVerification: 0,
  },
  oldestUnpaid: { periodStart: '2026-08-01', periodEnd: '2026-08-31', dueDate: '2026-08-15', invoiceNumber: 'INV-1' },
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
    revokeBinding: vi.fn().mockResolvedValue(undefined),
    loadAccount: vi.fn().mockResolvedValue(account),
    acceptCode: vi.fn().mockResolvedValue(true),
    touchBinding: vi.fn().mockResolvedValue(undefined),
    createRequest: vi.fn().mockResolvedValue('request-1'),
    takePendingRequest: vi.fn().mockResolvedValue(null),
    countDoneSince: vi.fn().mockResolvedValue(0),
    audit: vi.fn().mockResolvedValue(undefined),
    emailAdmin: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function send(text: string, repository: WhatsAppAdminRepository, owesRepository: OwesRepository) {
  const reply = vi.fn().mockResolvedValue(undefined);
  const command = parseWhatsAppAdminCommand(text);
  if (!command) throw new Error(`not an admin command: ${text}`);
  const message: WhatsAppInboundMessage = { id: `wamid-${text}`, from: PHONE.slice(1), timestamp: '1760000000', type: 'text', text };
  await handleWhatsAppAdminMessage(message, command, { repository, owesRepository, reply, now: () => NOW });
  return reply;
}

describe('parseWhatsAppAdminCommand for the owes lookup', () => {
  it('reads the query and the picked number', () => {
    expect(parseWhatsAppAdminCommand('admin owes KOA-18A')).toEqual({ kind: 'action', action: 'owes', params: { query: 'KOA-18A' } });
    expect(parseWhatsAppAdminCommand('ADMIN OWES  Ada  Obi ')).toEqual({ kind: 'action', action: 'owes', params: { query: 'Ada  Obi' } });
    expect(parseWhatsAppAdminCommand('ADMIN 2')).toEqual({ kind: 'action', action: 'owes', params: { pick: 2 } });
    expect(parseWhatsAppAdminCommand('ADMIN OWES')).toEqual({ kind: 'action', action: 'owes' });
    expect(parseWhatsAppAdminCommand('ADMIN 6')).toBeNull();
  });
});

describe('ADMIN OWES', () => {
  it('answers at once for a house code and logs the disclosure and the audit', async () => {
    const owes = owesRepo({ searchHouseCodes: vi.fn().mockResolvedValue([candidate('KOA-18A'), candidate('KOA-18AB')]) });
    const repo = adminRepo();
    const reply = await send('ADMIN OWES koa-18a', repo, owes);

    const text = reply.mock.calls[0][0] as string;
    expect(text).toContain('What KOA-18A owes');
    expect(text).toContain('Billed to: Tolu Bello');
    expect(text).toContain('Outstanding: ₦45,000.00');
    expect(text).toContain('Status: Arrears');
    expect(text).toContain('Oldest unpaid: 1 Aug 2026 to 31 Aug 2026');
    expect(text).toContain('Wallet: ₦2,500.00');
    expect(owes.logDisclosure).toHaveBeenCalledWith({ residentId: 'res-1', phoneNumber: PHONE, houseId: 'id-KOA-18A', adminProfileId: 'admin-1' });
    expect(repo.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'VERIFY', entityType: 'houses', entityId: 'id-KOA-18A' }),
      'admin-1'
    );
  });

  it('answers at once for one name match', async () => {
    const owes = owesRepo({ searchResidents: vi.fn().mockResolvedValue([candidate('KOA-18A', 'Tolu Bello')]) });
    const reply = await send('ADMIN OWES tolu', adminRepo(), owes);
    expect(owes.searchResidents).toHaveBeenCalledWith(['tolu']);
    expect(reply.mock.calls[0][0]).toContain('What KOA-18A owes');
  });

  it('lists several name matches, numbered, and keeps the list for five minutes', async () => {
    const owes = owesRepo({ searchResidents: vi.fn().mockResolvedValue([candidate('KOA-1', 'Ada Obi'), candidate('KOA-2', 'Ada Bello')]) });
    const reply = await send('ADMIN OWES ada', adminRepo(), owes);

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
    await send('ADMIN OWES ada', repo, owes);
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
    const reply = await send('ADMIN OWES ada', adminRepo(), owes);
    expect(reply.mock.calls[0][0]).toMatch(/More than 5 matches/);
    expect(owes.saveChoices).not.toHaveBeenCalled();
  });

  it('answers the house picked from a live list and drops the list', async () => {
    const expiresAt = new Date(NOW.getTime() + 1000).toISOString();
    const owes = owesRepo({ loadChoices: vi.fn().mockResolvedValue({ choices: [candidate('KOA-1', 'Ada Obi'), candidate('KOA-2', 'Ada Bello')], expiresAt }) });
    const reply = await send('ADMIN 2', adminRepo(), owes);
    expect(owes.loadHouse).toHaveBeenCalledWith('id-KOA-2');
    expect(owes.clearChoices).toHaveBeenCalledWith('binding-1');
    expect(reply.mock.calls[0][0]).toContain('What KOA-18A owes');
  });

  it('refuses a pick when the list has expired', async () => {
    const owes = owesRepo({ loadChoices: vi.fn().mockResolvedValue({ choices: [candidate('KOA-1', 'Ada Obi')], expiresAt: NOW.toISOString() }) });
    const reply = await send('ADMIN 1', adminRepo(), owes);
    expect(owes.loadChoices).toHaveBeenCalledWith('binding-1');
    expect(reply.mock.calls[0][0]).toMatch(/no list to pick from, or it ran out after 5 minutes/);
    expect(owes.loadHouse).not.toHaveBeenCalled();
  });

  it('refuses a pick when there is no list', async () => {
    const owes = owesRepo();
    const reply = await send('ADMIN 1', adminRepo(), owes);
    expect(reply.mock.calls[0][0]).toMatch(/no list to pick from/);
    expect(owes.loadHouse).not.toHaveBeenCalled();
  });

  it('says so when nothing matches', async () => {
    const reply = await send('ADMIN OWES zzz', adminRepo(), owesRepo());
    expect(reply.mock.calls[0][0]).toBe('No house or resident matches "zzz".');
  });

  it('stops at the daily cap without searching', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ countDoneSince: vi.fn().mockResolvedValue(ADMIN_DAILY_ACTION_CAP) });
    const reply = await send('ADMIN OWES KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toBe(ADMIN_CAP_REPLY);
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });

  it('refuses an admin without a finance view permission', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ loadAccount: vi.fn().mockResolvedValue({ ...account, permissions: ['whatsapp_admin.query'] }) });
    const reply = await send('ADMIN OWES KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toBe(ADMIN_NOT_ALLOWED_REPLY);
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });

  it('accepts the financial report permission instead of billing.view', async () => {
    const owes = owesRepo({ searchHouseCodes: vi.fn().mockResolvedValue([candidate('KOA-18A')]) });
    const repo = adminRepo({ loadAccount: vi.fn().mockResolvedValue({ ...account, permissions: ['whatsapp_admin.query', 'reports.view_financial'] }) });
    const reply = await send('ADMIN OWES KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toContain('What KOA-18A owes');
  });

  it('refuses a number that is not linked', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ findActiveBinding: vi.fn().mockResolvedValue(null) });
    const reply = await send('ADMIN OWES KOA-18A', repo, owes);
    expect(reply.mock.calls[0][0]).toBe(ADMIN_NOT_LINKED_REPLY);
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });

  it('waits for an authenticator code outside a session and keeps the query', async () => {
    const owes = owesRepo();
    const repo = adminRepo({ findActiveBinding: vi.fn().mockResolvedValue(liveBinding({ sessionExpiresAt: null })) });
    const reply = await send('ADMIN OWES KOA-18A', repo, owes);
    expect(repo.createRequest).toHaveBeenCalledWith(expect.objectContaining({ action: 'owes', params: { query: 'KOA-18A' }, status: 'pending' }));
    expect(reply.mock.calls[0][0]).toMatch(/To approve/);
    expect(owes.searchHouseCodes).not.toHaveBeenCalled();
  });
});

describe('composeAdminOwesAnswer', () => {
  it('shows the signed roll-forward figure and keeps the wallet separate', () => {
    const text = composeAdminOwesAnswer(house({ owed: { invoiceCount: 1, outstanding: -1000, rollForward: true, overdue: null, next: null, awaitingVerification: 0 }, oldestUnpaid: null }));
    expect(text).toContain('Outstanding: ₦1,000.00 in credit');
    expect(text).toContain('Oldest unpaid: none');
    expect(text).toContain('Wallet: ₦2,500.00 (not netted');
  });

  it('says so when no resident is billed', () => {
    expect(composeAdminOwesAnswer(house({ billedTo: null, owed: null }))).toContain('No resident is billed');
  });
});
