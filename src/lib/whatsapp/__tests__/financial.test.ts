import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canPerformWhatsAppFinancialLookup,
  composeOweAnswer,
  composeRecentPaymentsAnswer,
  composeStatementAnswer,
  createSupabaseWhatsAppFinancialRepository,
  handleFinancialMessage,
  hashPin,
  statementRange,
  verifyPin,
} from '@/lib/whatsapp/financial';
import type {
  AssistantSettings,
  FinancialHouse,
  OwedFigures,
  WhatsAppFinancialHandlerOptions,
  WhatsAppFinancialRepository,
  WhatsAppFinancialSession,
} from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import type { AccountStatementData } from '@/lib/billing/account-statement-data';
import { getSettingResultAsService } from '@/lib/settings/service';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import { createAdminClient } from '@/lib/supabase/server';

vi.mock('@/lib/supabase/server', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/whatsapp/master-switch', () => ({
  isWhatsAppMasterSwitchOn: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
});

vi.mock('@/lib/whatsapp/rollout', () => ({
  isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true),
}));

vi.mock('@/lib/settings/service', () => ({
  getSettingResultAsService: vi.fn(),
}));

const identity: WhatsAppResidentIdentity = {
  id: 'resident-1',
  firstName: 'Ada',
  lastName: 'Example',
  residentCode: 'RES001',
  phonePrimary: '+2348000000000',
  phoneSecondary: null,
  financialEligible: true,
};
const community: WhatsAppResidentIdentity = { ...identity, firstName: 'Tunde', financialEligible: false };

const CONTACT = 'Contact the estate office on 0803 699 6725.';
const FOOTER = 'Reply 0 for menu or 9 to contact the estate office.';
const UNRECOGNISED = "I didn't catch that. Reply with a number from the menu, or MENU to see it again.";
const PALM: FinancialHouse = { id: 'house-1', label: '12 Palm Close' };
const CEDAR: FinancialHouse = { id: 'house-2', label: '4 Cedar Way' };

const OWED: OwedFigures = {
  invoiceCount: 3,
  outstanding: 125000,
  overdue: { total: 75000, count: 2, oldestDue: '2026-08-01' },
  next: { amount: 50000, dueDate: '2026-11-01', invoiceNumber: 'INV-2026-0412' },
  awaitingVerification: 25000,
};

function settings(overrides: Partial<AssistantSettings> = {}): AssistantSettings {
  return {
    estatePhone: '0803 699 6725',
    estateEmail: null,
    officeHours: null,
    paymentInstructions: 'Pay into Palm Estate, account 0123456789.',
    keywordSynonyms: {},
    ...overrides,
  };
}

function statementData(rows: number): AccountStatementData {
  return {
    resident: { id: 'resident-1', name: 'Ada Example', resident_code: 'RES001', email: null, phone: null, entity_type: 'individual', company_name: null },
    house: { id: 'house-1', address: '12, Palm Close', short_name: null },
    period: { from: '2026-10-01', to: '2026-10-20' },
    openingBalance: 45000,
    closingBalance: 510000,
    summary: { totalInvoiced: 0, totalPaid: 0, totalCredits: 0, totalDebits: 0, netChange: 0 },
    transactions: Array.from({ length: rows }, (_, index) => ({ id: `t${index}`, date: '2026-10-01', type: 'invoice' as const, description: 'x', reference: null, debit: 1, credit: 0, balance: 1 })),
    generatedAt: '2026-10-20T10:00:00Z',
    generatedBy: null,
  };
}

let counter = 0;
function message(text: string, type = 'text'): WhatsAppInboundMessage {
  counter += 1;
  return { id: `wamid-${counter}`, from: '2348000000000', timestamp: '1760000000', type, text };
}

/** A repository whose session store keeps what the handler saves, so a test can run a transcript. */
function repository(houses: FinancialHouse[] = [PALM], overrides: Partial<WhatsAppFinancialRepository> = {}) {
  let session: WhatsAppFinancialSession | null = null;
  const repo = {
    getSession: vi.fn(async () => (session ? { ...session } : null)),
    saveSession: vi.fn(async (next: WhatsAppFinancialSession) => {
      session = { ...next };
    }),
    getForcePin: vi.fn().mockResolvedValue(false),
    getPinHash: vi.fn().mockResolvedValue(null),
    setPinHash: vi.fn().mockResolvedValue(undefined),
    claimPinAttempt: vi.fn().mockResolvedValue(1),
    clearPinAttempts: vi.fn().mockResolvedValue(undefined),
    getBillableHouses: vi.fn().mockResolvedValue(houses),
    getAssistantSettings: vi.fn().mockResolvedValue(settings()),
    getLatestAnnouncements: vi.fn().mockResolvedValue([]),
    getOwed: vi.fn().mockResolvedValue(OWED),
    getRecentPayments: vi.fn().mockResolvedValue([]),
    getWalletBalance: vi.fn().mockResolvedValue(15000),
    getStatementRows: vi.fn().mockResolvedValue({ invoices: [], payments: [] }),
    setAlertsOn: vi.fn().mockResolvedValue(undefined),
    loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(3) }),
    storeStatementPdf: vi.fn().mockResolvedValue('https://storage.test/signed/statement.pdf'),
    getResidentEmail: vi.fn().mockResolvedValue('ada.example@gmail.com'),
    createStatementRequest: vi.fn().mockResolvedValue('request-1'),
    queueStatementEmail: vi.fn().mockResolvedValue(undefined),
    logDisclosure: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  return Object.assign(repo, {
    setStoredSession(next: WhatsAppFinancialSession | null) {
      session = next;
    },
  });
}

type Repo = ReturnType<typeof repository>;

/** Sends each text in turn and returns the reply bodies. */
async function chat(
  repo: Repo,
  texts: string[],
  who: WhatsAppResidentIdentity = identity,
  options: Partial<WhatsAppFinancialHandlerOptions> = {}
): Promise<string[]> {
  const send = vi.fn().mockResolvedValue({ success: true });
  for (const text of texts) {
    await handleFinancialMessage(message(text), who, { repository: repo, optedIn: true, send, ...options });
  }
  return send.mock.calls.map((call) => call[0].body as string);
}

const MAIN_MENU = [
  'Hi Ada, what would you like to do?',
  '1. Financial standing',
  '3. How to pay',
  '4. Alert settings',
  '9. Contact the estate office',
  'Reply with a number.',
].join('\n');

const FINANCIAL_MENU = [
  'Financial standing',
  '1. What I owe',
  '2. Recent payments',
  '3. Statement',
  '4. Wallet',
  FOOTER,
].join('\n');

describe('WhatsApp Assistant menus (#804 harmonised)', () => {
  it('greets a single-house resident and walks Financial standing to What I owe and back', async () => {
    const repo = repository();
    const replies = await chat(repo, ['hi', '1', '1', '0', '0']);

    expect(replies[0]).toBe(MAIN_MENU);
    expect(replies[1]).toBe(FINANCIAL_MENU);
    expect(replies[2]).toBe([
      '*What you owe, 12 Palm Close*',
      'Outstanding: ₦125,000.00',
      'Overdue: ₦75,000.00 across 2 invoices (oldest due 1 Aug 2026)',
      'Next due: ₦50,000.00 on 1 Nov 2026 (invoice INV-2026-0412)',
      'Awaiting verification: ₦25,000.00',
      'Reply PAY for how to pay',
      FOOTER,
    ].join('\n'));
    // 0 goes back one level: answer to Financial standing, then to the main menu.
    expect(replies[3]).toBe(FINANCIAL_MENU);
    expect(replies[4]).toBe(MAIN_MENU);
    expect(repo.getOwed).toHaveBeenCalledWith('resident-1', 'house-1');
    expect(repo.logDisclosure).toHaveBeenCalledTimes(1);
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'what_i_owe', houseId: 'house-1' }));
  });

  it.each(['MENU', 'Hello', 'yes', 'START'])('shows the main menu for %s', async (text) => {
    expect((await chat(repository(), [text]))[0]).toBe(MAIN_MENU);
  });

  it('never mentions PIN 1234 in the menu or an answer footer', async () => {
    const replies = await chat(repository(), ['hi', '1', '1', '0', '4']);
    for (const reply of replies) expect(reply).not.toMatch(/PIN/);
  });

  it('answers keywords from any menu level', async () => {
    const repo = repository();
    const replies = await chat(repo, ['wallet', 'payments', 'arrears', 'pay']);

    expect(replies[0]).toBe(['*Wallet*', 'Balance: ₦15,000.00', FOOTER].join('\n'));
    expect(replies[1]).toContain('*Recent payments, 12 Palm Close*');
    expect(replies[2]).toContain('*What you owe, 12 Palm Close*');
    expect(replies[3]).toBe(['*How to pay*', 'Pay into Palm Estate, account 0123456789.', FOOTER].join('\n'));
    expect(repo.getRecentPayments).toHaveBeenCalledWith('resident-1', 'house-1', 5);
  });

  it('uses the office keyword synonyms setting', async () => {
    const repo = repository([PALM], { getAssistantSettings: vi.fn().mockResolvedValue(settings({ keywordSynonyms: { 'service charge': 'owe' } })) });
    expect((await chat(repo, ['Service charge']))[0]).toContain('*What you owe, 12 Palm Close*');
  });

  it('asks which of two meanings an invoice keyword has', async () => {
    const replies = await chat(repository(), ['bill', '2']);
    expect(replies[0]).toBe('Did you mean 1. What I owe / 2. Statement?');
    expect(replies[1]).toContain('1. This month');
  });

  it('says it did not understand, and adds the estate office from the 2nd miss in a row', async () => {
    const replies = await chat(repository(), ['banana', 'banana', 'banana', 'hi', 'banana']);

    expect(replies[0]).toBe(UNRECOGNISED);
    expect(replies[1]).toBe(`${UNRECOGNISED}\n${CONTACT}`);
    expect(replies[2]).toBe(`${UNRECOGNISED}\n${CONTACT}`);
    // A recognised reply resets the count.
    expect(replies[4]).toBe(UNRECOGNISED);
  });

  it('hides How to pay, notices and contact when their settings are empty', async () => {
    const repo = repository([PALM], {
      getAssistantSettings: vi.fn().mockResolvedValue(settings({ estatePhone: null, paymentInstructions: null })),
    });
    const replies = await chat(repo, ['hi', '3', 'banana', '1', '1']);

    expect(replies[0]).toBe(['Hi Ada, what would you like to do?', '1. Financial standing', '4. Alert settings', 'Reply with a number.'].join('\n'));
    expect(replies[1]).toBe(UNRECOGNISED);
    // No contact line to add on the 2nd miss.
    expect(replies[2]).toBe(UNRECOGNISED);
    expect(replies[3]).toContain('Reply 0 for menu.');
    expect(replies[4]).not.toContain('Reply PAY');
    expect(replies[4].split('\n').at(-1)).toBe('Reply 0 for menu.');
  });

  it('gives the estate office line for 9, HELP, AGENT and CONTACT', async () => {
    const replies = await chat(repository(), ['9', 'help', 'agent', 'contact']);
    for (const reply of replies) expect(reply).toBe(`${CONTACT}\nReply 0 for menu.`);
  });

  it('cancels a step and locks an unlocked session', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    const replies = await chat(repo, ['statement', 'PIN 482915', 'cancel', 'lock', '1']);

    expect(replies[1]).toContain('PIN verified.\n\nWhich period?');
    expect(replies[2]).toMatch(/^Cancelled\. Nothing was changed\.\n\nHi Ada/);
    expect(replies[2]).toContain('1. Financial standing (unlocked)');
    expect(replies[3]).toMatch(/^Locked\. Your PIN is needed again for financial standing\.\n\nHi Ada/);
    expect(replies[3]).toContain('1. Financial standing (PIN protected)');
    expect(replies[4]).toContain('reply PIN followed by your 4–6 digit PIN');
  });

  it('answers media with the text-only reply', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });
    await handleFinancialMessage({ ...message(''), type: 'image', text: null }, identity, { repository: repo, optedIn: true, send });
    expect(send.mock.calls[0][0].body).toBe('I can only read text messages here. Please type your request.');
  });

  it('turns all estate WhatsApp messages off from Alert settings', async () => {
    const repo = repository();
    const replies = await chat(repo, ['4', '1']);

    expect(replies[0]).toBe(['Alert settings', '1. All estate WhatsApp messages: ON', 'Reply 1 to turn them off.', FOOTER].join('\n'));
    expect(repo.setAlertsOn).toHaveBeenCalledWith('resident-1', '+2348000000000', false);
    expect(replies[1]).toContain('unsubscribed');
  });
});

describe('WhatsApp Assistant properties (#804 decision 12)', () => {
  it('asks once per session which property, names it, and switches through More', async () => {
    const repo = repository([PALM, CEDAR]);
    const replies = await chat(repo, ['owe', '2', '0', '8', '1', '1', '2']);

    expect(replies[0]).toBe(['Which property?', '1. 12 Palm Close', '2. 4 Cedar Way', 'Reply with the property number.'].join('\n'));
    expect(replies[1]).toContain('*What you owe, 4 Cedar Way*');
    expect(replies[2]).toContain('Financial standing: 4 Cedar Way');
    expect(replies[2]).toContain('8. More');
    expect(replies[3]).toBe(['More', '1. Switch property (now: 4 Cedar Way)', FOOTER].join('\n'));
    expect(replies[4]).toContain('Which property?');
    expect(replies[5]).toContain('Financial standing: 12 Palm Close');
    // The choice is remembered: no second property prompt.
    expect(replies[6]).toContain('*Recent payments, 12 Palm Close*');
  });

  it('never shows property prompts or More to a single-house resident', async () => {
    const replies = await chat(repository(), ['1', '8']);
    expect(replies[0]).not.toContain('More');
    expect(replies[1]).toBe(UNRECOGNISED);
  });
});

describe('WhatsApp Assistant community tier (#804 decision 15)', () => {
  const notices = [
    { title: 'Water outage', summary: 'Supply will be off from 9am to 2pm for pipe repairs.', content: 'Full text of the outage notice.', publishedAt: '2026-10-22T08:00:00Z' },
    { title: 'AGM', summary: null, content: 'The AGM is on Saturday.\nAgenda attached.', publishedAt: '2026-10-20T08:00:00Z' },
  ];

  it('shows the menu without Financial standing and reads a notice in full', async () => {
    const repo = repository([], { getLatestAnnouncements: vi.fn().mockResolvedValue(notices) });
    const replies = await chat(repo, ['hello', '1', '2', '1'], community);

    expect(replies[0]).toBe([
      'Hi Tunde, what would you like to do?',
      '2. Latest estate notices',
      '3. How to pay',
      '4. Alert settings',
      '9. Contact the estate office',
      'Reply with a number.',
    ].join('\n'));
    expect(replies[1]).toBe(UNRECOGNISED);
    expect(replies[2]).toBe([
      '*Latest estate notices*',
      '1. Water outage, 22 Oct 2026',
      'Supply will be off from 9am to 2pm for pipe repairs.',
      '2. AGM, 20 Oct 2026',
      'The AGM is on Saturday.',
      'Reply 1–2 to read one in full.',
      FOOTER,
    ].join('\n'));
    expect(replies[3]).toBe(['*Water outage*', '22 Oct 2026', 'Full text of the outage notice.', FOOTER].join('\n'));
    expect(repo.getLatestAnnouncements).toHaveBeenCalledWith(3);
  });

  it('refuses financial keywords without reading any figure', async () => {
    const repo = repository([]);
    const replies = await chat(repo, ['owe'], community);

    expect(replies[0]).toMatch(/^Financial standing is only available to residents billed for a property\.\n\nHi Tunde/);
    expect(repo.getOwed).not.toHaveBeenCalled();
    expect(repo.getBillableHouses).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });
});

describe('WhatsApp Assistant session expiry (#804 amendment 1)', () => {
  function expired(repo: Repo) {
    repo.setStoredSession({
      phoneNumber: '+2348000000000',
      residentId: 'resident-1',
      currentNode: 'answer',
      selectedHouseId: 'house-2',
      pinAuthenticated: true,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
  }

  it('announces the expiry with the PIN clause and forgets the property and unlock', async () => {
    const repo = repository([PALM, CEDAR]);
    vi.mocked(repo.getForcePin).mockResolvedValue(true);
    expired(repo);

    const replies = await chat(repo, ['1']);

    expect(replies[0]).toMatch(/^Your session ended after 15 minutes without activity, so your PIN is needed again\. Nothing was changed\.\n\nHi Ada/);
    expect(repo.getOwed).not.toHaveBeenCalled();
    expect(repo.saveSession).toHaveBeenLastCalledWith(expect.objectContaining({ selectedHouseId: null, pinAuthenticated: false, currentNode: 'main' }));
  });

  it('drops the PIN clause when no PIN gate applies', async () => {
    const repo = repository();
    expired(repo);
    expect((await chat(repo, ['1']))[0]).toMatch(/^Your session ended after 15 minutes without activity\. Nothing was changed\.\n\n/);
  });
});

describe('WhatsApp Assistant guards', () => {
  it('rejects handling when consent is absent', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: false, send });

    expect(repo.getOwed).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('blocks access when the resident is outside the active pilot', async () => {
    const { isWhatsAppRecipientAllowed } = await import('@/lib/whatsapp/rollout');
    vi.mocked(isWhatsAppRecipientAllowed).mockResolvedValueOnce(false);
    const repo = repository();

    const replies = await chat(repo, ['owe']);

    expect(repo.getOwed).not.toHaveBeenCalled();
    expect(replies[0]).toContain('not currently enabled');
  });

  it('requires the estate-wide PIN before Financial standing only', async () => {
    const repo = repository();
    vi.mocked(repo.getForcePin).mockResolvedValue(true);
    const replies = await chat(repo, ['hi', '9', '1', 'PIN 482915']);

    expect(replies[0]).toContain('1. Financial standing (PIN protected)');
    expect(replies[1]).toContain(CONTACT);
    expect(replies[2]).toContain('A security PIN is required');
    expect(replies[2]).not.toContain('1234');
    expect(replies[3]).toBe(`PIN set and verified for this session.\n\n${FINANCIAL_MENU.replace(FOOTER, 'Reply 0 for menu, 9 to contact the estate office, or LOCK to lock now.')}`);
    expect(repo.getOwed).not.toHaveBeenCalled();
  });

  it.each([
    ['resident_cap', "You've reached today's limit of 20 financial lookups. It resets at midnight."],
    ['estate_cap', 'Financial lookups are paused for everyone until midnight. Nothing is wrong with your account.'],
  ] as const)('stops financial readers at the %s', async (allowance, text) => {
    const repo = repository();
    const canLookup = vi.fn().mockResolvedValue(allowance);
    const replies = await chat(repo, ['owe'], identity, { canLookup });

    expect(canLookup).toHaveBeenCalledWith('resident-1');
    expect(replies[0]).toBe(`${text}\n${CONTACT}`);
    expect(repo.getOwed).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('counts only the four financial items toward the cap and the disclosure log', async () => {
    const repo = repository([PALM], { getLatestAnnouncements: vi.fn().mockResolvedValue([{ title: 'T', summary: 'S', content: 'C', publishedAt: null }]) });
    const canLookup = vi.fn().mockResolvedValue('ok');
    await chat(repo, ['pay', 'contact', 'notices', '1', 'hi', '4'], identity, { canLookup });

    expect(canLookup).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();

    await chat(repo, ['owe', 'payments', 'wallet', 'statement', '1'], identity, { canLookup });
    expect(canLookup).toHaveBeenCalledTimes(4);
    expect(vi.mocked(repo.logDisclosure).mock.calls.map((call) => call[0].menuItem)).toEqual(['what_i_owe', 'recent_payments', 'wallet', 'statement']);
  });

  it('replies with the failure line when a lookup fails, and logs nothing', async () => {
    const repo = repository([PALM], { getOwed: vi.fn().mockRejectedValue(new Error('timeout')) });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const replies = await chat(repo, ['owe']);

    expect(replies[0]).toBe(`I can't load your records right now, so nothing was shown or changed. Please try again in a few minutes.\n${CONTACT}`);
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('still throws when the reply itself cannot be sent, so the webhook can retry', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: false, error: 'provider down' });
    await expect(handleFinancialMessage(message('hi'), identity, { repository: repo, optedIn: true, send })).rejects.toThrow('provider down');
    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsApp Assistant statement (#804 decisions 22-23)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('offers the five periods and reads the chosen range in Lagos time', async () => {
    const repo = repository();
    const replies = await chat(repo, ['statement', '3']);

    expect(replies[0]).toBe(['Which period?', '1. This month', '2. This year', '3. Last 6 months', '4. Last 12 months', '5. All time', 'Reply with the period number.'].join('\n'));
    // Current month plus the 5 before: 1 May 2026 00:00 Lagos is 30 Apr 23:00 UTC.
    expect(repo.getStatementRows).toHaveBeenCalledWith('resident-1', 'house-1', '2026-04-30T23:00:00.000Z', '2026-10-20T10:00:00.000Z');
    expect(replies[1]).toContain('*Statement, last 6 months, 12 Palm Close*\n1 May 2026 to 20 Oct 2026');
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'statement', houseId: 'house-1' }));
  });

  it('reads all time with no lower bound', async () => {
    const repo = repository();
    const replies = await chat(repo, ['statement', '5']);
    expect(repo.getStatementRows).toHaveBeenCalledWith('resident-1', 'house-1', null, '2026-10-20T10:00:00.000Z');
    expect(replies[1]).toContain('Up to 20 Oct 2026');
    expect(replies[1]).toContain('No activity for 12 Palm Close in this period.');
  });

  it('starts each period at midnight Lagos', () => {
    const now = new Date('2026-01-31T23:30:00Z'); // 1 Feb 00:30 in Lagos
    expect(statementRange('this_month', now).from?.toISOString()).toBe('2026-01-31T23:00:00.000Z');
    expect(statementRange('this_year', now).from?.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(statementRange('last_twelve_months', now).from?.toISOString()).toBe('2025-02-28T23:00:00.000Z');
  });

  it('composes totals, newest rows first with masked references, and caps older rows', () => {
    const invoices = Array.from({ length: 13 }, (_, index) => ({
      invoice_number: `INV-${index}`,
      amount_due: 100,
      created_at: new Date(Date.UTC(2026, 0, index + 1, 12)).toISOString(),
    }));
    const answer = composeStatementAnswer({
      period: 'this_year',
      houseId: 'house-1',
      houseLabel: '12 Palm Close',
      now: new Date('2026-10-20T10:00:00Z'),
      hasContact: true,
      invoices,
      payments: [{ amount: 250, payment_date: '2026-01-20', reference_number: 'TRF1234' }],
    });

    const lines = answer.body.split('\n');
    expect(lines.slice(0, 4)).toEqual(['*Statement, this year, 12 Palm Close*', '1 Jan 2026 to 20 Oct 2026', 'Charges: ₦1,300.00', 'Payments: ₦250.00']);
    expect(lines[4]).toBe('20 Jan 2026  Payment ref ••••1234  −₦250.00');
    expect(lines[5]).toBe('13 Jan 2026  Invoice INV-12  +₦100.00');
    expect(lines.at(-3)).toBe('+ 2 earlier entries');
    expect(lines.at(-2)).toBe('Reply PDF to download the full statement.');
    expect(lines.at(-1)).toBe(FOOTER);
    expect(answer.metadata).toMatchObject({ house_id: 'house-1', row_count: 14, omitted: 2 });
  });
});

describe('WhatsApp Assistant answers (#804 decisions 20, 21, 28)', () => {
  it('shows empty and paid-up states for What I owe', () => {
    const none: OwedFigures = { invoiceCount: 0, outstanding: 0, overdue: null, next: null, awaitingVerification: 0 };
    expect(composeOweAnswer(none, '12 Palm Close', true, true)).toBe(['*What you owe, 12 Palm Close*', 'No bills on record for 12 Palm Close.', FOOTER].join('\n'));
    expect(composeOweAnswer({ ...none, invoiceCount: 4, awaitingVerification: 5000 }, '12 Palm Close', true, true)).toBe([
      '*What you owe, 12 Palm Close*',
      "You're fully paid up for 12 Palm Close.",
      'Awaiting verification: ₦5,000.00',
      FOOTER,
    ].join('\n'));
  });

  it('omits the overdue and next-due lines when there are none', () => {
    const body = composeOweAnswer({ ...OWED, overdue: null, next: null, awaitingVerification: 0 }, '12 Palm Close', false, false);
    expect(body).toBe(['*What you owe, 12 Palm Close*', 'Outstanding: ₦125,000.00', 'Reply 0 for menu.'].join('\n'));
  });

  it('lists recent payments with method, masked reference and verification tag', () => {
    const body = composeRecentPaymentsAnswer([
      { amount: 50000, payment_date: '2026-10-12', method: 'bank_transfer', reference_number: 'FT2610123456', is_verified: true },
      { amount: 20000, payment_date: '2026-09-01T10:00:00Z', method: null, reference_number: null, is_verified: false },
    ], '12 Palm Close', true);

    expect(body).toBe([
      '*Recent payments, 12 Palm Close*',
      '12 Oct 2026  ₦50,000.00  bank transfer  ref ••••3456',
      '1 Sep 2026  ₦20,000.00  payment  (awaiting verification)',
      FOOTER,
    ].join('\n'));
    expect(composeRecentPaymentsAnswer([], '12 Palm Close', true)).toContain('No payments recorded for 12 Palm Close.');
  });
});

describe('WhatsApp financial lookup caps (#804 decision 26)', () => {
  function mockCounts(estate: number, resident: number) {
    const query = (count: number) => {
      const chain = { select: vi.fn(), eq: vi.fn(), gte: vi.fn(), then: (resolve: (value: unknown) => unknown) => resolve({ count, error: null }) };
      chain.select.mockReturnValue(chain);
      chain.eq.mockImplementation(() => Object.assign(query(resident), {}));
      chain.gte.mockReturnValue(chain);
      return chain;
    };
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn(() => query(estate)) } as unknown as ReturnType<typeof createAdminClient>);
  }

  // #139: this setting gates how many financial disclosures may happen per
  // day, so a query error must deny the lookup rather than silently falling
  // back to the compiled-in default -- "we couldn't check" here must not be
  // treated the same as "unconfigured".
  it('fails closed when the daily cap read errors, rather than falling through to the default cap', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'error', message: 'connection reset' });

    await expect(canPerformWhatsAppFinancialLookup('resident-1')).rejects.toThrow('connection reset');
  });

  it.each([
    ['ok under both caps', 499, 19, 'ok'],
    ['the estate cap of 500 when unset', 500, 0, 'estate_cap'],
    ['the per-resident cap of 20', 30, 20, 'resident_cap'],
  ])('allows or stops a lookup: %s', async (_label, estate, resident, expected) => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'absent' });
    mockCounts(estate, resident);
    await expect(canPerformWhatsAppFinancialLookup('resident-1')).resolves.toBe(expected);
  });

  it('honours a configured estate cap', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'ok', value: 10 });
    mockCounts(10, 0);
    await expect(canPerformWhatsAppFinancialLookup('resident-1')).resolves.toBe('estate_cap');
  });
});

describe('WhatsApp financial master switch (#547)', () => {
  it.each(['absent', 'error', 'disabled'] as const)('sends nothing, changes nothing, logs no disclosure when off (%s)', async (reason) => {
    vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: false, reason });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 1234'), identity, { repository: repo, optedIn: true, send });

    expect(send).not.toHaveBeenCalled();
    for (const [name, fn] of Object.entries(repo)) if (name !== 'setStoredSession') expect(fn).not.toHaveBeenCalled();
  });
});

describe('WhatsApp disclosure log (#795)', () => {
  it('inserts the disclosure with the snake_case columns of whatsapp_disclosure_logs', async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    const from = vi.fn().mockReturnValue({ insert });
    vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);

    await createSupabaseWhatsAppFinancialRepository().logDisclosure({
      residentId: 'resident-1',
      phoneNumber: '+2348000000000',
      houseId: 'house-1',
      menuItem: 'what_i_owe',
      pinAuthenticated: true,
      metadata: { period: 'this_month' },
    });

    expect(from).toHaveBeenCalledWith('whatsapp_disclosure_logs');
    expect(insert).toHaveBeenCalledWith({
      resident_id: 'resident-1',
      phone_number: '+2348000000000',
      house_id: 'house-1',
      menu_item: 'what_i_owe',
      pin_authenticated: true,
      channel: 'chat',
      metadata: { period: 'this_month' },
    });
  });

  it('throws when the insert fails, so the handler never treats an unlogged disclosure as done', async () => {
    const insert = vi.fn().mockResolvedValue({ error: { code: 'PGRST204', message: 'column not found' } });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue({ insert }) } as unknown as ReturnType<typeof createAdminClient>);

    await expect(createSupabaseWhatsAppFinancialRepository().logDisclosure({
      residentId: 'resident-1',
      phoneNumber: '+2348000000000',
      houseId: null,
      menuItem: 'statement',
      pinAuthenticated: false,
    })).rejects.toMatchObject({ code: 'PGRST204' });
  });

  it.each([
    ['a menu answer', ['owe']],
    ['a statement', ['statement', '1']],
  ])('logs %s before sending it, and sends only the failure reply when the log fails', async (_label, texts) => {
    const repo = repository();
    vi.mocked(repo.logDisclosure).mockRejectedValueOnce(new Error('insert failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const replies = await chat(repo, texts);

    expect(repo.logDisclosure).toHaveBeenCalledTimes(1);
    expect(replies.at(-1)).toMatch(/^I can't load your records right now/);
    expect(replies.join('\n')).not.toContain('Outstanding');
    expect(replies.join('\n')).not.toContain('Charges');
  });
});

describe('WhatsApp PIN lockout and hashing (#850)', () => {
  const legacyHash = (pin: string) => createHash('sha256').update(pin).digest('hex');

  it('hashes PINs with a per-PIN salt and verifies both salted and legacy hashes', () => {
    const first = hashPin('482915');
    const second = hashPin('482915');
    expect(first).toMatch(/^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/);
    expect(first).not.toBe(second);
    expect(verifyPin('482915', first)).toBe(true);
    expect(verifyPin('482916', first)).toBe(false);
    expect(verifyPin('482915', legacyHash('482915'))).toBe(true);
    expect(verifyPin('482916', legacyHash('482915'))).toBe(false);
  });

  it('stores a salted hash when a resident sets a PIN', async () => {
    const repo = repository();
    await chat(repo, ['PIN 482915']);

    const stored = vi.mocked(repo.setPinHash).mock.calls[0]?.[1];
    expect(stored).toMatch(/^scrypt:/);
    expect(verifyPin('482915', stored!)).toBe(true);
    expect(repo.claimPinAttempt).not.toHaveBeenCalled();
  });

  it('does not take a PIN from a community-tier resident', async () => {
    const repo = repository([]);
    await chat(repo, ['PIN 482915'], community);
    expect(repo.setPinHash).not.toHaveBeenCalled();
  });

  it('counts a wrong PIN, says how many attempts are left and does not authenticate', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(3);

    const replies = await chat(repo, ['PIN 000000']);

    expect(repo.claimPinAttempt).toHaveBeenCalledWith('resident-1');
    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(replies[0]).toContain('2 attempt(s) left');
  });

  it('locks on the fifth wrong PIN and gives the estate office line', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(5);

    const replies = await chat(repo, ['PIN 000000']);

    expect(repo.saveSession).not.toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(replies[0]).toBe(`Too many wrong PINs. Financial answers are locked for 24 hours. Try again after that.\n${CONTACT}`);
  });

  it('refuses even the correct PIN while locked', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(null);

    const replies = await chat(repo, ['PIN 482915']);

    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(replies[0]).toContain('locked for 24 hours');
  });

  it('clears the counter and authenticates on a correct PIN, then shows Financial standing', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(4);

    const replies = await chat(repo, ['PIN 482915']);

    expect(repo.clearPinAttempts).toHaveBeenCalledWith('resident-1');
    expect(repo.setPinHash).not.toHaveBeenCalled();
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(replies[0]).toMatch(/^PIN verified\.\n\nFinancial standing\n1\. What I owe/);
  });

  it('rehashes a legacy unsalted PIN with a salt on its next correct use', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(legacyHash('482915'));

    await chat(repo, ['PIN 482915']);

    const stored = vi.mocked(repo.setPinHash).mock.calls[0]?.[1];
    expect(stored).toMatch(/^scrypt:/);
    expect(verifyPin('482915', stored!)).toBe(true);
  });

  it('claims attempts through the claim_whatsapp_pin_attempt RPC and treats no row as locked', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: 2, error: null }).mockResolvedValueOnce({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
    const repo = createSupabaseWhatsAppFinancialRepository();

    await expect(repo.claimPinAttempt('resident-1')).resolves.toBe(2);
    await expect(repo.claimPinAttempt('resident-1')).resolves.toBeNull();
    expect(rpc).toHaveBeenCalledWith('claim_whatsapp_pin_attempt', {
      p_resident_id: 'resident-1',
      p_max_attempts: 5,
      p_lock_minutes: 1440,
    });
  });

  it.each([
    ['absent', null, true],
    ['true', { value: true }, true],
    ['false', { value: false }, false],
  ])('reads the force-PIN setting as on by default (%s row)', async (_label, row, expected) => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: row, error: null });
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createAdminClient>);

    await expect(createSupabaseWhatsAppFinancialRepository().getForcePin()).resolves.toBe(expected);
  });
});

describe('WhatsApp What I owe figures (#811, #804 decision 20)', () => {
  type InvoiceRow = { invoice_number: string; amount_due: number; amount_paid: number; due_date: string; status?: string };

  /** Behaves like PostgREST per table: applies filters, caps a response at max_rows (1000), counts for head selects. */
  function mockTables(rows: InvoiceRow[], unverifiedPayments: number[] = []) {
    const all = rows.map((row) => ({ status: row.amount_paid >= row.amount_due ? 'paid' : 'unpaid', ...row }));
    const from = vi.fn((table: string) => {
      let filtered = [...all];
      let head = false;
      const result = () => table === 'payment_records'
        ? { data: unverifiedPayments.map((amount) => ({ amount })), error: null }
        : head
          ? { count: filtered.length, data: null, error: null }
          : { data: filtered.slice(0, 1000), error: null };
      const chain = {
        select: vi.fn((_columns: string, options?: { head?: boolean }) => {
          head = !!options?.head;
          return chain;
        }),
        eq: vi.fn(() => chain),
        neq: vi.fn((column: 'status', value: string) => {
          filtered = filtered.filter((row) => row[column] !== value);
          return chain;
        }),
        in: vi.fn((column: 'status', values: string[]) => {
          filtered = filtered.filter((row) => values.includes(row[column]));
          return chain;
        }),
        order: vi.fn(() => chain),
        then: (resolve: (value: unknown) => unknown) => resolve(result()),
      };
      return chain;
    });
    vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  }

  function paidMonthly(count: number): InvoiceRow[] {
    return Array.from({ length: count }, (_, i) => ({
      invoice_number: `INV-${i}`,
      amount_due: 5000,
      amount_paid: 5000,
      due_date: `${2020 + Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, '0')}-01`,
    }));
  }

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('finds an unpaid invoice newer than more than 1000 fully paid ones', async () => {
    mockTables([...paidMonthly(1100), { invoice_number: 'INV-NEW', amount_due: 5000, amount_paid: 0, due_date: '2120-01-01' }]);

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed).toMatchObject({ invoiceCount: 1101, outstanding: 5000, overdue: null, next: { amount: 5000, dueDate: '2120-01-01', invoiceNumber: 'INV-NEW' } });
  });

  it('ignores void invoices and keeps the amount guard on stale statuses', async () => {
    mockTables([
      { invoice_number: 'INV-VOID', amount_due: 5000, amount_paid: 0, due_date: '2026-09-01', status: 'void' },
      { invoice_number: 'INV-STALE', amount_due: 5000, amount_paid: 5000, due_date: '2026-09-15', status: 'partially_paid' },
      { invoice_number: 'INV-C', amount_due: 6000, amount_paid: 1000, due_date: '2026-11-01', status: 'partially_paid' },
    ]);

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed).toMatchObject({ invoiceCount: 2, outstanding: 5000, overdue: null, next: { amount: 5000, invoiceNumber: 'INV-C' } });
  });

  it('reports overdue invoices separately from the next one due, and sums unverified payments', async () => {
    mockTables([
      ...paidMonthly(22),
      { invoice_number: 'INV-A', amount_due: 5000, amount_paid: 2000, due_date: '2026-08-01' },
      { invoice_number: 'INV-B', amount_due: 5000, amount_paid: 0, due_date: '2026-09-01' },
      { invoice_number: 'INV-C', amount_due: 6000, amount_paid: 0, due_date: '2026-11-01' },
      { invoice_number: 'INV-D', amount_due: 7000, amount_paid: 0, due_date: '2026-12-01' },
    ], [1000, 2500]);

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed).toEqual({
      invoiceCount: 26,
      outstanding: 21000,
      overdue: { total: 8000, count: 2, oldestDue: '2026-08-01' },
      next: { amount: 6000, dueDate: '2026-11-01', invoiceNumber: 'INV-C' },
      awaitingVerification: 3500,
    });
  });

  it('reports nothing outstanding when every invoice is paid', async () => {
    mockTables(paidMonthly(30));

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed).toMatchObject({ invoiceCount: 30, outstanding: 0, overdue: null, next: null });
  });
});

describe('WhatsApp statement PDF delivery (#804 decision 24, amended by #863)', () => {
  const PDF_TEXT = [
    '*Statement, this month, 12 Palm Close*',
    'Opening balance: ₦45,000.00',
    'Closing balance: ₦510,000.00',
    'Your PDF is attached.',
    FOOTER,
  ].join('\n');

  it('attaches a PDF of up to 40 rows in chat through a signed URL, logged as a pdf disclosure', async () => {
    const repo = repository([PALM], { loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(40) }) });
    const send = vi.fn().mockResolvedValue({ success: true });
    for (const text of ['statement', '1']) await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send });
    const pdfMessage = message('PDF');
    await handleFinancialMessage(pdfMessage, identity, { repository: repo, optedIn: true, send });

    expect(send.mock.calls[1][0].body).toContain('Reply PDF to download the full statement.');
    expect(send.mock.calls[2][0]).toMatchObject({ body: PDF_TEXT, mediaUrls: ['https://storage.test/signed/statement.pdf'] });
    expect(repo.loadStatement).toHaveBeenCalledWith('resident-1', 'house-1', 'this_month', expect.any(Date));
    expect(repo.storeStatementPdf).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: 'resident-1', houseId: 'house-1', period: 'this_month', fromDate: '2026-10-01', toDate: '2026-10-20', rowCount: 40, inboundMessageId: pdfMessage.id, replyText: PDF_TEXT }),
      expect.objectContaining({ openingBalance: 45000 })
    );
    expect(vi.mocked(repo.logDisclosure).mock.calls.map((call) => call[0].channel)).toEqual([undefined, 'pdf']);
    expect(repo.getResidentEmail).not.toHaveBeenCalled();
  });

  it('offers email to the masked address over 40 rows, and queues it on Yes', async () => {
    const repo = repository([PALM], { loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(41) }) });
    const replies = await chat(repo, ['statement', '1', 'pdf', '1']);

    expect(replies[2]).toBe('This statement is too long for chat. Send it to a***@gmail.com? Reply 1 Yes, 2 No.');
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
    expect(replies[3]).toBe(`Queued. It will arrive within 15 minutes.\n${FOOTER}`);
    expect(repo.createStatementRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', rowCount: 41, houseId: 'house-1' }));
    expect(repo.queueStatementEmail).toHaveBeenCalledWith('request-1', 'resident-1', 'ada.example@gmail.com');
    expect(vi.mocked(repo.logDisclosure).mock.calls.at(-1)?.[0]).toMatchObject({ menuItem: 'statement', channel: 'email' });
  });

  it('sends nothing on No', async () => {
    const repo = repository([PALM], { loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(41) }) });
    const replies = await chat(repo, ['statement', '1', 'pdf', '2']);

    expect(replies[3]).toBe(`Nothing was sent.\n${FOOTER}`);
    expect(repo.queueStatementEmail).not.toHaveBeenCalled();
    expect(repo.logDisclosure).toHaveBeenCalledTimes(1);
  });

  it('raises the no-email flag and gives the estate office line when there is no email', async () => {
    const repo = repository([PALM], {
      loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(41) }),
      getResidentEmail: vi.fn().mockResolvedValue(null),
    });
    const replies = await chat(repo, ['statement', '1', 'pdf']);

    expect(replies[2]).toBe(`We don't have an email for you. Reply EMAIL to add one now.\n${CONTACT}\n${FOOTER}`);
    expect(repo.createStatementRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 'awaiting_email', rowCount: 41 }));
    expect(repo.queueStatementEmail).not.toHaveBeenCalled();
    // Nothing has left the estate yet: only the text statement is logged.
    expect(repo.logDisclosure).toHaveBeenCalledTimes(1);
  });

  it('counts a PDF toward the cap and makes no file once it is reached', async () => {
    const repo = repository();
    const canLookup = vi.fn().mockResolvedValueOnce('ok').mockResolvedValueOnce('resident_cap');
    const replies = await chat(repo, ['statement', '1', 'pdf'], identity, { canLookup });

    expect(replies[2]).toContain("You've reached today's limit");
    expect(repo.loadStatement).not.toHaveBeenCalled();
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
  });

  it('makes no file when the disclosure log fails', async () => {
    const repo = repository();
    vi.mocked(repo.logDisclosure).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('insert failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const replies = await chat(repo, ['statement', '1', 'pdf']);

    expect(replies[2]).toMatch(/^I can't load your records right now/);
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
  });

  it('treats PDF outside a statement as unrecognised, and asks for the PIN again after LOCK', async () => {
    expect((await chat(repository(), ['pdf']))[0]).toBe(UNRECOGNISED);

    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    await chat(repo, ['PIN 482915', '3', '1']);
    const session = vi.mocked(repo.saveSession).mock.lastCall![0];
    repo.setStoredSession({ ...session, pinAuthenticated: false });
    const replies = await chat(repo, ['pdf']);
    expect(replies[0]).toContain('reply PIN followed by your 4–6 digit PIN');
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
  });
});
