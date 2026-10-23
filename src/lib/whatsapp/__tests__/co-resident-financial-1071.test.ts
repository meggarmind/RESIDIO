import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAdminClient } from '@/lib/supabase/server';
import { createSupabaseWhatsAppFinancialRepository, handleFinancialMessage } from '@/lib/whatsapp/financial';
import type {
  FinancialHouse,
  WhatsAppFinancialHandlerOptions,
  WhatsAppFinancialRepository,
  WhatsAppFinancialSession,
} from '@/lib/whatsapp/financial';
import { createSupabaseWhatsAppIdentityRepository } from '@/lib/whatsapp/identity';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp/master-switch', () => ({ isWhatsAppMasterSwitchOn: vi.fn() }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn(), getRawSettingsAsService: vi.fn() }));

const SPONSOR = 'sponsor-1';
const CO = 'co-1';

const coResident: WhatsAppResidentIdentity = {
  id: CO,
  firstName: 'Bola',
  lastName: 'Example',
  residentCode: 'RES002',
  phonePrimary: '+2348000000001',
  phoneSecondary: null,
  financialEligible: true,
  accessAllowed: true,
};

/** A house the asker sees through their sponsor. */
const PALM_VIA_SPONSOR: FinancialHouse = { id: 'house-1', label: '12 Palm Close', role: 'co_resident', accountResidentId: SPONSOR, onBehalf: true };
const CEDAR_OWN: FinancialHouse = { id: 'house-2', label: '4 Cedar Way', role: 'tenant' };

const OWED = {
  invoiceCount: 1,
  outstanding: 50000,
  overdue: null,
  next: { amount: 50000, dueDate: '2026-11-01', invoiceNumber: 'INV-1' },
  awaitingVerification: 0,
};

let counter = 0;
function message(text: string): WhatsAppInboundMessage {
  counter += 1;
  return { id: `wamid-${counter}`, from: '2348000000001', timestamp: '1760000000', type: 'text', text };
}

function repository(houses: FinancialHouse[]) {
  let session: WhatsAppFinancialSession | null = null;
  return {
    getSession: vi.fn(async () => (session ? { ...session } : null)),
    saveSession: vi.fn(async (next: WhatsAppFinancialSession) => {
      session = { ...next };
    }),
    getForcePin: vi.fn().mockResolvedValue(false),
    getPinHash: vi.fn().mockResolvedValue(null),
    getBillableHouses: vi.fn().mockResolvedValue(houses),
    getAssistantSettings: vi.fn().mockResolvedValue({ estatePhone: null, estateEmail: null, officeHours: null, paymentInstructions: 'Pay to account 0123.', keywordSynonyms: {} }),
    getLatestAnnouncements: vi.fn().mockResolvedValue([]),
    getOwed: vi.fn().mockResolvedValue(OWED),
    getRecentPayments: vi.fn().mockResolvedValue([]),
    getWalletBalance: vi.fn().mockResolvedValue(15000),
    createPaymentReport: vi.fn().mockResolvedValue({ status: 'created', paymentId: 'payment-1', requestId: 'request-1' }),
    getReceiptPayments: vi.fn().mockResolvedValue([]),
    loadReceipt: vi.fn().mockResolvedValue(null),
    requestClearance: vi.fn().mockResolvedValue({ status: 'requested', requestId: 'request-1' }),
    getStatementPeriods: vi.fn(async (residentId: string) => (residentId === SPONSOR ? ['this_month', 'since_move_in'] : ['this_month', 'all_time'])),
    loadStatement: vi.fn().mockResolvedValue({
      fromDate: '2026-10-01',
      toDate: '2026-10-20',
      statement: { transactions: [{}] },
    }),
    storeStatementPdf: vi.fn().mockResolvedValue('https://storage.test/statement.pdf'),
    getResidentEmail: vi.fn().mockResolvedValue(null),
    logDisclosure: vi.fn().mockResolvedValue(undefined),
    askSurvey: vi.fn().mockResolvedValue(null),
  };
}

type Repo = ReturnType<typeof repository>;

async function chat(repo: Repo, texts: string[], canLookup?: WhatsAppFinancialHandlerOptions['canLookup']): Promise<string[]> {
  const send = vi.fn().mockResolvedValue({ success: true });
  for (const text of texts) {
    await handleFinancialMessage(message(text), coResident, {
      repository: repo as unknown as WhatsAppFinancialRepository,
      optedIn: true,
      send,
      canLookup,
    });
  }
  return send.mock.calls.map((call) => call[0].body as string);
}

beforeEach(() => {
  vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
});

describe('co-resident financial menu (#1071)', () => {
  it('shows What I owe, Recent payments, Statement, Receipt and Report a payment, and hides Wallet and Clearance', async () => {
    const [, menu] = await chat(repository([PALM_VIA_SPONSOR]), ['hi', '1']);
    expect(menu).toContain('1. What I owe');
    expect(menu).toContain('2. Recent payments');
    expect(menu).toContain('3. Statement');
    expect(menu).toContain('5. Receipt');
    expect(menu).toContain('6. Report a payment');
    expect(menu).not.toContain('Wallet');
    expect(menu).not.toContain('Clearance');
  });

  it('keeps Wallet and Clearance on the menu of a house the asker is billed for', async () => {
    const [, menu] = await chat(repository([CEDAR_OWN]), ['hi', '1']);
    expect(menu).toContain('4. Wallet');
    expect(menu).toContain('7. Clearance certificate');
  });

  it("reads the sponsor's figures for the house, never the co-resident's own", async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    await chat(repo, ['1', '1', '1', '2']);
    expect(repo.getOwed).toHaveBeenCalledWith(SPONSOR, 'house-1');
    expect(repo.getRecentPayments).toHaveBeenCalledWith(SPONSOR, 'house-1', 5);
    expect(repo.getOwed).not.toHaveBeenCalledWith(CO, expect.anything());
    expect(repo.getRecentPayments).not.toHaveBeenCalledWith(CO, expect.anything(), expect.anything());
  });

  it("sums All my properties from the sponsor's account for a sponsored house and the asker's own for the rest", async () => {
    const repo = repository([PALM_VIA_SPONSOR, CEDAR_OWN]);
    await chat(repo, ['owe', '3']);
    expect(repo.getOwed).toHaveBeenCalledWith(SPONSOR, 'house-1');
    expect(repo.getOwed).toHaveBeenCalledWith(CO, 'house-2');
    expect(repo.getOwed).not.toHaveBeenCalledWith(CO, 'house-1');
    expect(repo.logDisclosure).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: CO, houseId: null, accountResidentId: SPONSOR, metadata: { scope: 'all_properties', houses: 2 } })
    );
  });

  it("offers and reads the sponsor's statement periods", async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    const prompt = (await chat(repo, ['1', '1', '3', '2'])).find((reply) => reply.startsWith('Which period?'));
    expect(prompt).toMatch(/since move-in/i);
    expect(prompt).not.toMatch(/all time/i);
    expect(repo.loadStatement).toHaveBeenCalledWith(SPONSOR, 'house-1', 'since_move_in', expect.any(Date));
  });

  it("builds the statement and the receipt list from the sponsor's account", async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    await chat(repo, ['1', '1', '3', '1', '5']);
    expect(repo.loadStatement).toHaveBeenCalledWith(SPONSOR, 'house-1', 'this_month', expect.any(Date));
    expect(repo.getStatementPeriods).toHaveBeenCalledWith(SPONSOR, 'house-1');
    expect(repo.getStatementPeriods).not.toHaveBeenCalledWith(CO, expect.anything());
    expect(repo.getReceiptPayments).toHaveBeenCalledWith(SPONSOR, 'house-1', 5);
  });

  it('refuses the Wallet by number and by keyword without reading the wallet', async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    const replies = await chat(repo, ['1', '4', 'wallet']);
    expect(replies.slice(1).every((reply) => reply.includes("isn't available for a co-resident"))).toBe(true);
    expect(repo.getWalletBalance).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('refuses the Clearance certificate by number and by keyword without filing a request', async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    const replies = await chat(repo, ['1', '7', 'clearance']);
    expect(replies.slice(1).every((reply) => reply.includes("isn't available for a co-resident"))).toBe(true);
    expect(repo.requestClearance).not.toHaveBeenCalled();
    expect(repo.getOwed).not.toHaveBeenCalled();
  });

  it('shows PAY instructions', async () => {
    const [reply] = await chat(repository([PALM_VIA_SPONSOR]), ['pay']);
    expect(reply).toContain('Pay to account 0123.');
  });

  it('logs the co-resident as the asker and the sponsor as the account owner', async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    await chat(repo, ['1', '1', '1']);
    expect(repo.logDisclosure).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: CO, houseId: 'house-1', menuItem: 'what_i_owe', accountResidentId: SPONSOR })
    );
  });

  it('counts lookups against the co-resident, not the sponsor', async () => {
    const canLookup = vi.fn().mockResolvedValue('ok');
    await chat(repository([PALM_VIA_SPONSOR]), ['1', '1', '1'], canLookup);
    expect(canLookup).toHaveBeenCalledWith(CO);
    expect(canLookup).not.toHaveBeenCalledWith(SPONSOR);
  });

  it("stops at the co-resident's own daily cap", async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    const replies = await chat(repo, ['1', '1', '1'], vi.fn().mockResolvedValue('resident_cap'));
    expect(replies[2]).toContain("today's limit");
    expect(repo.getOwed).not.toHaveBeenCalled();
  });

  it('files a payment report against the sponsor with the co-resident as reporter', async () => {
    const repo = repository([PALM_VIA_SPONSOR]);
    await chat(repo, ['1', '1', '6', '50000', 'today', 'GTB TRF', '1']);
    expect(repo.createPaymentReport).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: SPONSOR, reportedByResidentId: CO, houseId: 'house-1', amount: 50000 })
    );
  });

  it('leaves the reporter off a report about the asker\'s own house', async () => {
    const repo = repository([CEDAR_OWN]);
    await chat(repo, ['1', '1', '6', '50000', 'today', 'GTB TRF', '1']);
    const input = repo.createPaymentReport.mock.calls[0][0];
    expect(input.residentId).toBe(CO);
    expect(input).not.toHaveProperty('reportedByResidentId');
  });

  it('closes the financial menu at once when the sponsor link has ended', async () => {
    const repo = repository([]);
    const replies = await chat(repo, ['1', '1']);
    expect(replies[0]).toContain('only available to residents billed for a property');
    expect(repo.getOwed).not.toHaveBeenCalled();
  });
});

/** A client whose queries resolve from per-table queues, in the order the code asks. */
function fakeDb(results: Record<string, unknown[]>) {
  const from = vi.fn((table: string) => {
    const chain: Record<string, unknown> = {};
    for (const op of ['select', 'eq', 'in', 'not']) chain[op] = vi.fn(() => chain);
    chain.then = (resolve: (value: unknown) => unknown) => resolve((results[table] || []).shift() ?? { data: [], error: null });
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
}

const HOUSE_EMBED = { house_number: '12', short_name: '12 Palm Close', street: { name: 'Palm Close' } };

describe('co-resident houses from the database (#1071)', () => {
  it("maps a sponsored house to the sponsor's account", async () => {
    fakeDb({
      resident_houses: [
        { data: [], error: null },
        { data: [{ house_id: 'house-1', sponsor_resident_id: SPONSOR, house: HOUSE_EMBED }], error: null },
        { data: [{ resident_id: SPONSOR, house_id: 'house-1' }], error: null },
      ],
    });
    await expect(createSupabaseWhatsAppFinancialRepository().getBillableHouses(CO)).resolves.toEqual([
      { id: 'house-1', label: '12 Palm Close', role: 'co_resident', accountResidentId: SPONSOR, onBehalf: true },
    ]);
  });

  it('drops a house whose sponsor no longer holds an active resident role there (move-out)', async () => {
    fakeDb({
      resident_houses: [
        { data: [], error: null },
        { data: [{ house_id: 'house-1', sponsor_resident_id: SPONSOR, house: HOUSE_EMBED }], error: null },
        { data: [], error: null },
      ],
    });
    await expect(createSupabaseWhatsAppFinancialRepository().getBillableHouses(CO)).resolves.toEqual([]);
  });

  it("does not accept another house's sponsor row as the link", async () => {
    fakeDb({
      resident_houses: [
        { data: [], error: null },
        { data: [{ house_id: 'house-1', sponsor_resident_id: SPONSOR, house: HOUSE_EMBED }], error: null },
        { data: [{ resident_id: SPONSOR, house_id: 'house-9' }, { resident_id: 'other', house_id: 'house-1' }], error: null },
      ],
    });
    await expect(createSupabaseWhatsAppFinancialRepository().getBillableHouses(CO)).resolves.toEqual([]);
  });

  it('keeps the own billable entry when the asker is also a co-resident of that house', async () => {
    fakeDb({
      resident_houses: [
        { data: [{ house_id: 'house-1', resident_role: 'tenant', house: HOUSE_EMBED }], error: null },
        { data: [{ house_id: 'house-1', sponsor_resident_id: SPONSOR, house: HOUSE_EMBED }], error: null },
        { data: [{ resident_id: SPONSOR, house_id: 'house-1' }], error: null },
      ],
    });
    await expect(createSupabaseWhatsAppFinancialRepository().getBillableHouses(CO)).resolves.toEqual([
      { id: 'house-1', label: '12 Palm Close', role: 'tenant' },
    ]);
  });

  it('writes the account owner into the disclosure metadata and the asker into resident_id', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(createAdminClient).mockReturnValue({ from: () => ({ insert }) } as unknown as ReturnType<typeof createAdminClient>);
    await createSupabaseWhatsAppFinancialRepository().logDisclosure({
      residentId: CO,
      phoneNumber: '2348000000001',
      houseId: 'house-1',
      menuItem: 'what_i_owe',
      pinAuthenticated: true,
      accountResidentId: SPONSOR,
    });
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ resident_id: CO, metadata: { account_resident_id: SPONSOR } }));
  });
});

describe('co-resident eligibility (#1071)', () => {
  function roster(access: Array<Record<string, unknown>>, sponsorRows: Array<Record<string, unknown>>) {
    fakeDb({
      residents: [{ data: [{ id: CO, first_name: 'Bola', last_name: 'Example', resident_code: 'RES002', phone_primary: '+2348000000001', phone_secondary: null }], error: null }],
      resident_houses: [
        { data: access, error: null },
        { data: access.filter((row) => row.resident_role === 'co_resident').map(() => ({ house_id: 'house-1', sponsor_resident_id: SPONSOR, house: HOUSE_EMBED })), error: null },
        { data: sponsorRows, error: null },
      ],
    });
  }

  it('gives a sponsored co-resident the financial tier', async () => {
    roster([{ resident_role: 'co_resident' }], [{ resident_id: SPONSOR, house_id: 'house-1' }]);
    const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches('2348000000001');
    expect(match).toMatchObject({ financialEligible: true, accessAllowed: true });
  });

  it('keeps a co-resident whose sponsor moved out on the community tier', async () => {
    roster([{ resident_role: 'co_resident' }], []);
    const [match] = await createSupabaseWhatsAppIdentityRepository().findRosterMatches('2348000000001');
    expect(match).toMatchObject({ financialEligible: false, accessAllowed: true });
  });
});
