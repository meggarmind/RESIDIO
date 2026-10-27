import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canPerformWhatsAppFinancialLookup,
  composeOweAnswer,
  nextServiceChargeDue,
  composeRecentPaymentsAnswer,
  composeWalletAnswer,
  createSupabaseWhatsAppFinancialRepository,
  handleFinancialMessage,
  hashPin,
  statementRange,
  verifyPin,
} from '@/lib/whatsapp/financial';
import { chargeLabel, offeredPeriods } from '@/lib/whatsapp/assistant-format';
import type {
  AssistantSettings,
  FinancialHouse,
  OwedFigures,
  PinAttemptClaim,
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
  accessAllowed: true,
};
const community: WhatsAppResidentIdentity = { ...identity, firstName: 'Tunde', financialEligible: false };

const CONTACT = 'Contact the estate office on 0803 699 6725.';
const FOOTER = 'Reply 0 for menu or 9 to contact the estate office.';
const UNRECOGNISED = "I didn't catch that. Reply with a number from the menu, or MENU to see it again.";
const PALM: FinancialHouse = { id: 'house-1', label: '12 Palm Close', role: 'tenant' };
const CEDAR: FinancialHouse = { id: 'house-2', label: '4 Cedar Way', role: 'tenant' };

const OWED: OwedFigures = {
  invoiceCount: 3,
  outstanding: 125000,
  overdue: { total: 75000, count: 2, oldestDue: '2026-08-01', charges: [{ label: 'Security dues, AUG 2026', amount: 50000 }, { label: 'Development levy', amount: 25000 }] },
  next: { amount: 50000, dueDate: '2026-11-01', invoiceNumber: 'INV-2026-0412', label: 'Security dues, NOV 2026' },
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
    categories: [],
    generatedAt: '2026-10-20T10:00:00Z',
    generatedBy: null,
  };
}

const CLAIMED_AT = '2026-10-20T09:30:00.123456+00:00';

function counted(fields: Partial<Extract<PinAttemptClaim, { status: 'counted' }>> = {}): PinAttemptClaim {
  return { status: 'counted', triesInARow: 1, triesInWindow: 1, lockedUntil: null, hardLocked: false, claimedAt: CLAIMED_AT, ...fields };
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
    setPinHash: vi.fn().mockResolvedValue(true),
    claimSetupCode: vi.fn().mockResolvedValue({ status: 'none' }),
    sendPinAlert: vi.fn().mockResolvedValue(undefined),
    claimPinAttempt: vi.fn().mockResolvedValue(counted()),
    clearPinAttempts: vi.fn().mockResolvedValue(undefined),
    getBillableHouses: vi.fn().mockResolvedValue(houses),
    getAssistantSettings: vi.fn().mockResolvedValue(settings()),
    getLatestAnnouncements: vi.fn().mockResolvedValue([]),
    getOwed: vi.fn().mockResolvedValue(OWED),
    getRecentPayments: vi.fn().mockResolvedValue([]),
    getWalletBalance: vi.fn().mockResolvedValue(15000),
    setAlertsOn: vi.fn().mockResolvedValue(undefined),
    getRemindersOn: vi.fn().mockResolvedValue(true),
    setRemindersOn: vi.fn().mockResolvedValue(undefined),
    startEmailChange: vi.fn().mockResolvedValue({ status: 'sent', email: 'new.name@example.com' }),
    confirmEmailChange: vi.fn().mockResolvedValue({ status: 'saved', email: 'new.name@example.com', statementsQueued: 0 }),
    createPaymentReport: vi.fn().mockResolvedValue({ status: 'created', paymentId: 'payment-1', requestId: 'request-1' }),
    getReceiptPayments: vi.fn().mockResolvedValue([]),
    loadReceipt: vi.fn().mockResolvedValue(null),
    storeReceiptPdf: vi.fn().mockResolvedValue('https://storage.test/signed/receipt.pdf'),
    requestClearance: vi.fn().mockResolvedValue({ status: 'requested', requestId: 'request-1' }),
    getCoResidents: vi.fn().mockResolvedValue([]),
    hasLinkedCoResident: vi.fn().mockResolvedValue(false),
    createCoResidentLinkCode: vi.fn().mockResolvedValue(null),
    getStatementPeriods: vi.fn().mockResolvedValue(['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'all_time', 'since_move_in']),
    getEstateName: vi.fn().mockResolvedValue('Palm Estate'),
    getAssistantName: vi.fn().mockResolvedValue('Palm Estate Assistant'),
    loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(3) }),
    storeStatementPdf: vi.fn().mockResolvedValue('https://storage.test/signed/statement.pdf'),
    getResidentEmail: vi.fn().mockResolvedValue('ada.example@gmail.com'),
    createStatementRequest: vi.fn().mockResolvedValue('request-1'),
    queueStatementEmail: vi.fn().mockResolvedValue(undefined),
    logDisclosure: vi.fn().mockResolvedValue(undefined),
    // Not due by default, so a thank-you or an accepted request opens no survey (#872).
    askSurvey: vi.fn().mockResolvedValue(null),
    answerSurvey: vi.fn().mockResolvedValue(undefined),
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
  const replies: string[] = [];
  for (const text of texts) {
    send.mockClear();
    await handleFinancialMessage(message(text), who, { repository: repo, optedIn: true, send, ...options });
    // A final answer and its menu are two messages (#1179); join them so a test reads one reply per inbound text.
    replies.push(...(send.mock.calls.length ? [send.mock.calls.map((call) => call[0].body as string).join('\n\n')] : []));
  }
  return replies;
}

const MAIN_MENU = [
  'Hi Ada, what would you like to do?',
  '1. Financial standing',
  '3. How to pay',
  '4. Alert settings',
  '5. Update email',
  '9. Contact the estate office',
  'Reply with a number.',
].join('\n');

const FINANCIAL_MENU = [
  'Financial standing',
  '1. What I owe',
  '2. Recent payments',
  '3. Statement',
  '4. Wallet',
  '5. Receipt',
  '6. Report a payment',
  '7. Clearance certificate',
  // A tenant with no linked co-resident is offered Link a co-resident (#1117).
  '8. Link a co-resident',
  FOOTER,
].join('\n');

/** A final answer ends with a blank line and the Financial menu (#1164). */
// No property is selected after an all-properties summary, so the menu has no property-specific lines.
const ALL_PROPERTIES_MENU = FINANCIAL_MENU.replace('8. Link a co-resident\n', '');
const thenMenu = (...lines: string[]) => `${lines.join('\n')}\n\n${FINANCIAL_MENU}`;

describe('WhatsApp Assistant menus (#804 harmonised)', () => {
  it('greets a single-house resident and walks Financial standing to What I owe and back', async () => {
    const repo = repository();
    const replies = await chat(repo, ['hi', '1', '1', '0', '0']);

    expect(replies[0]).toBe(MAIN_MENU);
    expect(replies[1]).toBe(FINANCIAL_MENU);
    expect(replies[2]).toBe(thenMenu(
      '*What you owe, 12 Palm Close*',
      'Outstanding: ₦125,000.00',
      'Overdue: ₦75,000.00 across 2 invoices (oldest due 1 Aug 2026)',
      '- Security dues, AUG 2026: ₦50,000.00',
      '- Development levy: ₦25,000.00',
      'Next due: ₦50,000.00 on 1 Nov 2026, Security dues, NOV 2026 (invoice INV-2026-0412)',
      'Awaiting verification: ₦25,000.00',
      'Reply PAY for how to pay',
    ));
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

    expect(replies[0]).toBe(thenMenu('*Wallet*', 'Balance: ₦15,000.00'));
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

    expect(replies[0]).toBe(['Hi Ada, what would you like to do?', '1. Financial standing', '4. Alert settings', '5. Update email', 'Reply with a number.'].join('\n'));
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

    expect(replies[1]).toContain('PIN verified. Your financial standing is unlocked for 15 minutes.\n\nWhich period?');
    expect(replies[2]).toMatch(/^Cancelled\. Nothing was changed\.\n\nHi Ada/);
    expect(replies[2]).toContain('1. Financial standing (unlocked)');
    expect(replies[3]).toMatch(/^Locked\. Your PIN is needed again for financial standing\.\n\nHi Ada/);
    expect(replies[3]).toContain('1. Financial standing (PIN protected)');
    expect(replies[4]).toContain('Enter your 4–6 digit PIN to view your financial standing (e.g. 4821).');
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

    expect(replies[0]).toBe(['Alert settings', '1. All estate WhatsApp messages: ON', '2. Payment reminders: ON', 'Reply 1 or 2 to change one.', FOOTER].join('\n'));
    expect(repo.setAlertsOn).toHaveBeenCalledWith('resident-1', '+2348000000000', false);
    expect(replies[1]).toContain('unsubscribed');
  });
});

describe('WhatsApp Assistant properties (#804 decision 12)', () => {
  it('asks once per session which property, names it, and switches through item 10', async () => {
    const repo = repository([PALM, CEDAR]);
    const replies = await chat(repo, ['owe', '2', '0', '10', '1', '2']);

    expect(replies[0]).toBe(['Which property?', '1. 12 Palm Close', '2. 4 Cedar Way', '3. All my properties', 'Reply with the property number.'].join('\n'));
    expect(replies[1]).toContain('*What you owe, 4 Cedar Way*');
    expect(replies[2]).toContain('Financial standing: 4 Cedar Way');
    expect(replies[2]).toContain('10. Switch property (now: 4 Cedar Way)');
    expect(replies[2]).not.toContain('More');
    expect(replies[3]).toContain('Which property?');
    expect(replies[4]).toContain('Financial standing: 12 Palm Close');
    // The choice is remembered: no second property prompt.
    expect(replies[5]).toContain('*Recent payments, 12 Palm Close*');
  });

  it('never shows property prompts, Switch property or Link a co-resident to a single-house resident who sponsors no one', async () => {
    const replies = await chat(repository([{ ...PALM, role: 'non_resident_landlord' }]), ['1', '8']);
    expect(replies[0]).not.toContain('8.');
    expect(replies[0]).not.toContain('10.');
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
      '5. Update email',
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
    // #892: holding the phone does not set a first PIN; a setup code from the estate office does.
    expect(replies[3]).toBe('Enter the 6-digit setup code from the estate office.');
    expect(repo.setPinHash).not.toHaveBeenCalled();
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

  it('offers the six periods and sends the chosen range as a PDF in Lagos time', async () => {
    const repo = repository();
    const replies = await chat(repo, ['statement', '3']);

    expect(replies[0]).toBe(['Which period?', '1. This month', '2. This year', '3. Last 6 months', '4. Last 12 months', '5. All time', '6. Since move-in', 'Reply with the period number.'].join('\n'));
    expect(repo.loadStatement).toHaveBeenCalledWith('resident-1', 'house-1', 'last_six_months', expect.any(Date));
    expect(replies[1]).toBe(thenMenu('*Statement, last 6 months, 12 Palm Close*', '1 Oct 2026 to 20 Oct 2026', 'Your PDF is attached.'));
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'statement', houseId: 'house-1', channel: 'pdf' }));
  });

  it('sends every period as a PDF and never as chat rows', async () => {
    for (const [choice, period] of [['1', 'this_month'], ['2', 'this_year'], ['3', 'last_six_months'], ['4', 'last_twelve_months'], ['5', 'all_time'], ['6', 'since_move_in'], ['since move-in', 'since_move_in'], ['Since move in', 'since_move_in']]) {
      const repo = repository([PALM], { loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(0) }) });
      const send = vi.fn().mockResolvedValue({ success: true });
      for (const text of ['statement', choice]) await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send });

      expect(repo.loadStatement).toHaveBeenCalledWith('resident-1', 'house-1', period, expect.any(Date));
      expect(send.mock.calls[1][0].mediaUrls).toEqual(['https://storage.test/signed/statement.pdf']);
      expect(send.mock.calls[1][0].body).not.toMatch(/Charges|Payments:|Invoice|earlier entries|No activity|Reply PDF/);
    }
  });

  it('heads a since-move-in statement with the move-in date and no period label', async () => {
    const repo = repository([PALM], { loadStatement: vi.fn().mockResolvedValue({ fromDate: '2025-02-03', toDate: '2026-10-20', statement: statementData(0) }) });
    const send = vi.fn().mockResolvedValue({ success: true });
    for (const text of ['statement', '6']) await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send });

    expect(send.mock.calls[1][0].body).toBe(['*Statement, 12 Palm Close*', '3 Feb 2025 (move-in) to 20 Oct 2026', 'Your PDF is attached.'].join('\n'));
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ metadata: { period: 'since_move_in', row_count: 0 } }));
  });

  it('replies with the contact line, and sends nothing, when since move-in has no active billable link', async () => {
    // The email path loads twice: the first load offers email over 40 rows, the confirm finds the link gone.
    const gone = () => vi.fn().mockResolvedValue(null);
    const goneOnConfirm = () => vi.fn().mockResolvedValueOnce({ fromDate: '2025-02-03', toDate: '2026-10-20', statement: statementData(41) }).mockResolvedValue(null);
    for (const [texts, loadStatement] of [[['statement', '6'], gone()], [['statement', '6', '1'], goneOnConfirm()]] as const) {
      const repo = repository([PALM], { loadStatement });
      const send = vi.fn().mockResolvedValue({ success: true });
      for (const text of texts) await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send });

      expect(send.mock.calls[texts.length - 1][0].body).toBe(["We couldn't find an active tenancy for this property, so there is no move-in date to start from.", CONTACT, FOOTER].join('\n'));
      expect(send.mock.calls[texts.length - 1][0].mediaUrls).toBeUndefined();
      expect(repo.logDisclosure).not.toHaveBeenCalled();
      expect(repo.storeStatementPdf).not.toHaveBeenCalled();
      expect(repo.queueStatementEmail).not.toHaveBeenCalled();
    }
  });

  it('starts each period at midnight Lagos', () => {
    const now = new Date('2026-01-31T23:30:00Z'); // 1 Feb 00:30 in Lagos
    expect(statementRange('this_month', now).from?.toISOString()).toBe('2026-01-31T23:00:00.000Z');
    expect(statementRange('this_year', now).from?.toISOString()).toBe('2025-12-31T23:00:00.000Z');
    expect(statementRange('last_twelve_months', now).from?.toISOString()).toBe('2025-02-28T23:00:00.000Z');
  });
});

describe('WhatsApp Assistant answers (#804 decisions 20, 21, 28)', () => {
  it('shows empty and paid-up states for What I owe', () => {
    const none: OwedFigures = { invoiceCount: 0, outstanding: 0, overdue: null, next: null, awaitingVerification: 0 };
    expect(composeOweAnswer(none, '12 Palm Close', true)).toBe(['*What you owe, 12 Palm Close*', 'No bills on record for 12 Palm Close.'].join('\n'));
    expect(composeOweAnswer({ ...none, invoiceCount: 4, awaitingVerification: 5000 }, '12 Palm Close', true)).toBe([
      '*What you owe, 12 Palm Close*',
      'You are fully paid up for 12 Palm Close.',
      'Awaiting verification: ₦5,000.00',
    ].join('\n'));
    expect(composeOweAnswer({ ...none, invoiceCount: 4, nextPaymentDue: '2026-11-30' }, '12 Palm Close', true)).toBe([
      '*What you owe, 12 Palm Close*',
      'You are fully paid up for 12 Palm Close.',
      'Next payment due 30 Nov 2026',
    ].join('\n'));
  });

  it('dates the next payment from the month after the latest billed period', () => {
    expect(nextServiceChargeDue('2026-10-01', '2026-10-27', 30)).toBe('2026-12-01');
    expect(nextServiceChargeDue('2026-10-01', '2026-10-27', 0)).toBe('2026-11-01');
    // Prepaid ahead: the latest billed period is in the future.
    expect(nextServiceChargeDue('2027-03-01', '2026-10-27', 14)).toBe('2027-04-15');
    // Billing stopped: skip months whose due date is already past.
    expect(nextServiceChargeDue('2026-06-01', '2026-10-27', 0)).toBe('2026-11-01');
    expect(nextServiceChargeDue('2026-12-01', '2026-12-05', 0)).toBe('2027-01-01');
  });

  it('omits the overdue and next-due lines when there are none', () => {
    const body = composeOweAnswer({ ...OWED, overdue: null, next: null, awaitingVerification: 0 }, '12 Palm Close', false);
    expect(body).toBe(['*What you owe, 12 Palm Close*', 'Outstanding: ₦125,000.00'].join('\n'));
  });

  it('lists recent payments with method, masked reference and verification tag', () => {
    const body = composeRecentPaymentsAnswer([
      { amount: 50000, payment_date: '2026-10-12', method: 'bank_transfer', reference_number: 'FT2610123456', is_verified: true },
      { amount: 20000, payment_date: '2026-09-01T10:00:00Z', method: null, reference_number: null, is_verified: false },
    ], '12 Palm Close');

    expect(body).toBe([
      '*Recent payments, 12 Palm Close*',
      '1. 12 Oct 2026  ₦50,000.00  bank transfer  ref ••••3456',
      '2. 1 Sep 2026  ₦20,000.00  payment  (awaiting verification)',
    ].join('\n'));
    expect(composeRecentPaymentsAnswer([], '12 Palm Close')).toContain('No payments recorded for 12 Palm Close.');
  });
});

describe('WhatsApp financial lookup caps (#804 decision 26)', () => {
  function mockCounts(estate: number, resident: number) {
    const query = (count: number) => {
      const chain = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), gte: vi.fn(), then: (resolve: (value: unknown) => unknown) => resolve({ count, error: null }) };
      chain.select.mockReturnValue(chain);
      chain.neq.mockReturnValue(chain);
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

  it('does not count admin lookups (#981) against the resident or the estate', async () => {
    const rows = [
      ...Array.from({ length: 500 }, () => ({ resident_id: 'resident-1', menu_item: 'admin_owes' })),
      ...Array.from({ length: 19 }, () => ({ resident_id: 'resident-1', menu_item: 'what_i_owe' })),
    ];
    const from = vi.fn(() => {
      const filters: ((row: (typeof rows)[number]) => boolean)[] = [];
      const chain = {
        select: () => chain,
        gte: () => chain,
        eq: (column: 'resident_id', value: string) => (filters.push((row) => row[column] === value), chain),
        neq: (column: 'menu_item', value: string) => (filters.push((row) => row[column] !== value), chain),
        then: (resolve: (value: unknown) => unknown) => resolve({ count: rows.filter((row) => filters.every((f) => f(row))).length, error: null }),
      };
      return chain;
    });
    vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'absent' });
    await expect(canPerformWhatsAppFinancialLookup('resident-1')).resolves.toBe('ok');
    rows.push({ resident_id: 'resident-1', menu_item: 'what_i_owe' });
    await expect(canPerformWhatsAppFinancialLookup('resident-1')).resolves.toBe('resident_cap');
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

describe('WhatsApp PIN lockout and hashing (#850, #891)', () => {
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

  it('does not set a first PIN from PIN nnnn: it asks for a setup code (#892)', async () => {
    const repo = repository();
    const replies = await chat(repo, ['PIN 482915']);

    expect(replies[0]).toBe('Enter the 6-digit setup code from the estate office.');
    expect(repo.setPinHash).not.toHaveBeenCalled();
    expect(repo.claimPinAttempt).not.toHaveBeenCalled();
    expect(repo.saveSession).toHaveBeenLastCalledWith(expect.objectContaining({ currentNode: 'pin_setup_code', pinAuthenticated: false }));
  });

  it('does not take a PIN from a community-tier resident', async () => {
    const repo = repository([]);
    await chat(repo, ['PIN 482915'], community);
    expect(repo.setPinHash).not.toHaveBeenCalled();
  });

  function wrongPin(claim: PinAttemptClaim, pin = '000000', repo = repository()) {
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(claim);
    return { repo, replies: chat(repo, [`PIN ${pin}`]) };
  }

  it('counts the try before checking it and reports tries left in a row, with the contact line (#891)', async () => {
    const { repo, replies } = wrongPin(counted({ triesInARow: 1, triesInWindow: 1 }));

    expect((await replies)[0]).toBe("That PIN isn't correct. You have 2 tries left before it locks for 15 minutes.\n" + CONTACT);
    expect(repo.claimPinAttempt).toHaveBeenCalledWith('resident-1');
    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
  });

  it('says one try is left on the second wrong PIN in a row', async () => {
    const { replies } = wrongPin(counted({ triesInARow: 2, triesInWindow: 2 }));
    expect((await replies)[0]).toContain('You have 1 try left before it locks for 15 minutes.');
  });

  it.each([
    ['the 24-hour limit comes first', 5, "You have 1 try left before it locks until the estate office resets it."],
    ['both limits arrive on the same try', 4, "You have 2 tries left before it locks until the estate office resets it."],
  ])('names the estate-office lock when %s', async (_label, triesInWindow, text) => {
    const { replies } = wrongPin(counted({ triesInARow: 1, triesInWindow }));
    expect((await replies)[0]).toBe(`That PIN isn't correct. ${text}\n${CONTACT}`);
  });

  it('locks for 15 minutes on the third wrong PIN in a row and shows the Lagos time', async () => {
    const { repo, replies } = wrongPin(counted({ triesInARow: 3, triesInWindow: 3, lockedUntil: '2026-10-20T09:45:00.000Z' }));
    expect((await replies)[0]).toBe(`For security, your PIN is locked until 10:45. Nothing was shown.\n${CONTACT}`);
    expect(repo.saveSession).not.toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
  });

  it('refuses even the correct PIN inside the 15-minute lock', async () => {
    const { repo, replies } = wrongPin({ status: 'locked', lockedUntil: '2026-10-20T09:45:00.000Z' }, '482915');
    expect((await replies)[0]).toBe(`For security, your PIN is locked until 10:45. Nothing was shown.\n${CONTACT}`);
    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
  });

  it('locks until the estate office resets it on the sixth wrong PIN in 24 hours', async () => {
    const { replies } = wrongPin(counted({ triesInARow: 3, triesInWindow: 6, lockedUntil: '2026-10-20T09:45:00.000Z', hardLocked: true }));
    expect((await replies)[0]).toBe(`Your PIN is locked after several wrong tries. The estate office needs to reset it.\n${CONTACT}`);
  });

  it('refuses even the correct PIN after the hard lock', async () => {
    const { repo, replies } = wrongPin({ status: 'hard_locked' }, '482915');
    expect((await replies)[0]).toContain('The estate office needs to reset it.');
    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
  });

  it('leaves the contact line out when none is configured', async () => {
    const repo = repository([PALM], { getAssistantSettings: vi.fn().mockResolvedValue(settings({ estatePhone: null })) });
    const { replies } = wrongPin(counted(), '000000', repo);
    expect((await replies)[0]).toBe("That PIN isn't correct. You have 2 tries left before it locks for 15 minutes.");
  });

  it('clears the claimed try and authenticates on a correct PIN, then shows Financial standing', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(counted({ triesInARow: 2, triesInWindow: 5 }));

    const replies = await chat(repo, ['PIN 482915']);

    expect(repo.clearPinAttempts).toHaveBeenCalledWith('resident-1', CLAIMED_AT);
    expect(repo.setPinHash).not.toHaveBeenCalled();
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(replies[0]).toMatch(/^PIN verified\. Your financial standing is unlocked for 15 minutes\.\n\nFinancial standing\n1\. What I owe/);
  });

  it('rehashes a legacy unsalted PIN with a salt on its next correct use', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(legacyHash('482915'));

    await chat(repo, ['PIN 482915']);

    const stored = vi.mocked(repo.setPinHash).mock.calls[0]?.[1];
    expect(stored).toMatch(/^scrypt:/);
    expect(verifyPin('482915', stored!)).toBe(true);
    // Only over the legacy hash it verified against.
    expect(vi.mocked(repo.setPinHash).mock.calls[0]?.[2]).toBe(legacyHash('482915'));
  });

  it('claims tries through the claim_whatsapp_pin_try RPC with the #891 thresholds', async () => {
    const row = { tries_in_a_row: 1, tries_in_window: 4, locked_until: null, hard_locked: false, claimed_at: CLAIMED_AT };
    const rpc = vi.fn()
      .mockResolvedValueOnce({ data: [{ ...row, status: 'counted' }], error: null })
      .mockResolvedValueOnce({ data: [{ ...row, status: 'locked', locked_until: '2026-10-20T09:45:00.000Z', claimed_at: null }], error: null })
      .mockResolvedValueOnce({ data: [{ ...row, status: 'hard_locked', hard_locked: true, claimed_at: null }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);
    const repo = createSupabaseWhatsAppFinancialRepository();

    await expect(repo.claimPinAttempt('resident-1')).resolves.toEqual(counted({ triesInARow: 1, triesInWindow: 4 }));
    await expect(repo.claimPinAttempt('resident-1')).resolves.toEqual({ status: 'locked', lockedUntil: '2026-10-20T09:45:00.000Z' });
    await expect(repo.claimPinAttempt('resident-1')).resolves.toEqual({ status: 'hard_locked' });
    await expect(repo.claimPinAttempt('resident-1')).rejects.toThrow('not counted');
    expect(rpc).toHaveBeenCalledWith('claim_whatsapp_pin_try', {
      p_resident_id: 'resident-1',
      p_soft_limit: 3,
      p_soft_lock_minutes: 15,
      p_hard_limit: 6,
      p_window_hours: 24,
    });
  });

  it('clears a claimed try through the clear_whatsapp_pin_try RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as unknown as ReturnType<typeof createAdminClient>);

    await createSupabaseWhatsAppFinancialRepository().clearPinAttempts('resident-1', CLAIMED_AT);

    expect(rpc).toHaveBeenCalledWith('clear_whatsapp_pin_try', { p_resident_id: 'resident-1', p_claimed_at: CLAIMED_AT });
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
  type InvoiceRow = { invoice_number: string; amount_due: number; amount_paid: number; due_date: string; status?: string; invoice_type?: string; period_start?: string; billing_profile?: { name: string } | null };

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
        not: vi.fn((column: 'period_start') => {
          filtered = filtered.filter((row) => row[column] != null);
          return chain;
        }),
        limit: vi.fn(() => chain),
        maybeSingle: vi.fn(async () => ({
          data: [...filtered].sort((a, b) => String(b.period_start).localeCompare(String(a.period_start)))[0] ?? null,
          error: null,
        })),
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
    // No balance_roll_forward_resident_enabled row: the allocation figures (#863).
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'absent' });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('counts a payment reported on WhatsApp (pending, unverified) as awaiting verification (#816 decision 11)', async () => {
    const statusFilters: Array<{ table: string; values: string[] }> = [];
    const from = vi.fn((table: string) => {
      const chain: Record<string, unknown> = {};
      for (const op of ['select', 'eq', 'neq', 'not', 'order', 'limit']) chain[op] = vi.fn(() => chain);
      chain.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
      chain.in = vi.fn((column: string, values: string[]) => {
        if (column === 'status') statusFilters.push({ table, values });
        return chain;
      });
      chain.then = (resolve: (value: unknown) => unknown) => resolve(table === 'payment_records' ? { data: [{ amount: 50000 }], error: null } : { data: [], count: 0, error: null });
      return chain;
    });
    vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed.awaitingVerification).toBe(50000);
    expect(statusFilters).toContainEqual({ table: 'payment_records', values: ['paid', 'pending'] });
  });

  it('puts the charge labels on the Overdue and Next due lines read from the database', async () => {
    const rows: InvoiceRow[] = [
      { invoice_number: 'INV-1', amount_due: 5000, amount_paid: 0, due_date: '2026-08-01', invoice_type: 'SERVICE_CHARGE', period_start: '2026-08-01', billing_profile: { name: 'Security dues' } },
      { invoice_number: 'INV-2', amount_due: 9000, amount_paid: 0, due_date: '2120-01-01', invoice_type: 'LEVY', period_start: '2120-01-01', billing_profile: { name: 'Development levy' } },
    ];
    mockTables(rows);
    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');
    expect(owed.overdue?.charges).toEqual([{ label: 'Security dues, AUG 2026', amount: 5000 }]);
    expect(owed.next?.label).toBe('Development levy');
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
      overdue: { total: 8000, count: 2, oldestDue: '2026-08-01', charges: [{ label: 'Charge', amount: 3000 }, { label: 'Charge', amount: 5000 }] },
      next: { amount: 6000, dueDate: '2026-11-01', invoiceNumber: 'INV-C', label: 'Charge' },
      awaitingVerification: 3500,
    });
  });

  it('reports nothing outstanding when every invoice is paid', async () => {
    mockTables(paidMonthly(30));

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed).toMatchObject({ invoiceCount: 30, outstanding: 0, overdue: null, next: null });
    expect(owed.nextPaymentDue).toBeUndefined();
  });

  it('dates the next payment after the latest billed period when every invoice is paid', async () => {
    mockTables([
      { invoice_number: 'INV-SEP', amount_due: 5000, amount_paid: 5000, due_date: '2026-10-01', invoice_type: 'SERVICE_CHARGE', period_start: '2026-09-01' },
      { invoice_number: 'INV-OCT', amount_due: 5000, amount_paid: 5000, due_date: '2026-10-31', invoice_type: 'SERVICE_CHARGE', period_start: '2026-10-01' },
    ]);
    vi.mocked(getSettingResultAsService).mockImplementation(async (key) => (key === 'invoice_due_window_days' ? { status: 'ok', value: 14 } : { status: 'absent' }));

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed).toMatchObject({ outstanding: 0, next: null, nextPaymentDue: '2026-11-15' });
  });
});

describe('WhatsApp Assistant ends a final answer with the menu as its own message (#1164, #1179)', () => {
  it('lets the next item number follow an answer with no 0 in between', async () => {
    const replies = await chat(repository(), ['hi', '1', '1', '2', '3']);
    expect(replies[2]).toMatch(/^\*What you owe, 12 Palm Close\*[\s\S]*\n\nFinancial standing\n1\. What I owe/);
    expect(replies[3]).toMatch(/^\*Recent payments, 12 Palm Close\*/);
    expect(replies[4]).toContain('1. This month');
  });

  it('keeps the selected property heading and the switch line in the menu a multi-house resident sees', async () => {
    const replies = await chat(repository([PALM, CEDAR]), ['payments', '2']);
    expect(replies[1]).toContain('\n\nFinancial standing: 4 Cedar Way\n');
    expect(replies[1]).toContain('10. Switch property (now: 4 Cedar Way)');
  });

  it('adds no menu to a reply that asks for input', async () => {
    const replies = await chat(repository(), ['statement', 'report']);
    for (const reply of replies) expect(reply).not.toContain('Financial standing');
  });

  it('still honours 0 after an answer', async () => {
    const replies = await chat(repository(), ['1', '1', '0']);
    expect(replies[2]).toMatch(/^Financial standing\n/);
  });

  it('sends the answer and the menu as two messages, in order, saving the session at answer (#1179)', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });
    for (const text of ['hi', '1']) await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send });
    send.mockClear();
    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(send).toHaveBeenCalledTimes(2);
    const [answer, menu] = send.mock.calls.map((call) => call[0]);
    expect(answer.body).toMatch(/^\*What you owe, 12 Palm Close\*/);
    expect(answer.body).not.toContain('Financial standing\n');
    expect(menu.body).toBe(FINANCIAL_MENU);
    expect(vi.mocked(repo.saveSession).mock.calls.at(-1)![0].currentNode).toBe('answer');
  });

  it('sends no menu when the answer send fails (#1179)', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: false, error: 'down' });
    await expect(handleFinancialMessage(message('owe'), identity, { repository: repo, optedIn: true, send })).rejects.toThrow('down');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('still saves the session at answer when the menu send fails (#1179)', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: true }).mockResolvedValueOnce({ success: true }).mockResolvedValue({ success: false, error: 'down' });
    for (const text of ['hi', '1']) await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send });
    send.mockReset().mockResolvedValueOnce({ success: true }).mockResolvedValue({ success: false, error: 'down' });
    await expect(handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send })).rejects.toThrow('down');
    expect(send).toHaveBeenCalledTimes(2);
    expect(vi.mocked(repo.saveSession).mock.calls.at(-1)![0].currentNode).toBe('answer');
  });
});

describe('WhatsApp statement PDF delivery (#804 decision 24, #917)', () => {
  const PDF_TEXT = [
    '*Statement, this month, 12 Palm Close*',
    '1 Oct 2026 to 20 Oct 2026',
    'Your PDF is attached.',
  ].join('\n');
  const long = () => ({ loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(41) }) });

  it('attaches a PDF of up to 40 rows in chat through a signed URL, logged once as a pdf disclosure', async () => {
    const repo = repository([PALM], { loadStatement: vi.fn().mockResolvedValue({ fromDate: '2026-10-01', toDate: '2026-10-20', statement: statementData(40) }) });
    const send = vi.fn().mockResolvedValue({ success: true });
    await handleFinancialMessage(message('statement'), identity, { repository: repo, optedIn: true, send });
    const choice = message('1');
    await handleFinancialMessage(choice, identity, { repository: repo, optedIn: true, send });

    expect(send.mock.calls[1][0]).toMatchObject({ body: PDF_TEXT, mediaUrls: ['https://storage.test/signed/statement.pdf'] });
    expect(send.mock.calls[2][0]).toMatchObject({ body: FINANCIAL_MENU });
    expect(repo.loadStatement).toHaveBeenCalledWith('resident-1', 'house-1', 'this_month', expect.any(Date));
    expect(repo.storeStatementPdf).toHaveBeenCalledWith(
      expect.objectContaining({ residentId: 'resident-1', houseId: 'house-1', period: 'this_month', fromDate: '2026-10-01', toDate: '2026-10-20', rowCount: 40, inboundMessageId: choice.id, replyText: PDF_TEXT }),
      expect.objectContaining({ openingBalance: 45000 })
    );
    expect(vi.mocked(repo.logDisclosure).mock.calls.map((call) => call[0].channel)).toEqual(['pdf']);
    expect(repo.getResidentEmail).not.toHaveBeenCalled();
  });

  it('offers email to the masked address over 40 rows, and queues it on Yes', async () => {
    const repo = repository([PALM], long());
    const replies = await chat(repo, ['statement', '1', '1']);

    expect(replies[1]).toBe(['*Statement, this month, 12 Palm Close*', '1 Oct 2026 to 20 Oct 2026', 'This statement is too long for chat. Send the PDF to a***@gmail.com? Reply 1 Yes, 2 No.'].join('\n'));
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
    expect(replies[2]).toBe(thenMenu('*Statement, this month, 12 Palm Close*', '1 Oct 2026 to 20 Oct 2026', 'Your PDF is queued for a***@gmail.com. It will arrive within 15 minutes.'));
    expect(repo.createStatementRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 'queued', rowCount: 41, houseId: 'house-1' }));
    expect(repo.queueStatementEmail).toHaveBeenCalledWith('request-1', 'resident-1', 'ada.example@gmail.com');
    expect(vi.mocked(repo.logDisclosure).mock.calls.map((call) => call[0].channel)).toEqual(['email']);
  });

  it('sends nothing on No', async () => {
    const repo = repository([PALM], long());
    const replies = await chat(repo, ['statement', '1', '2']);

    expect(replies[2]).toBe(thenMenu('Nothing was sent.'));
    expect(repo.queueStatementEmail).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('raises the no-email flag and gives the estate office line when there is no email', async () => {
    const repo = repository([PALM], { ...long(), getResidentEmail: vi.fn().mockResolvedValue(null) });
    const replies = await chat(repo, ['statement', '1']);

    expect(replies[1]).toBe(thenMenu("We don't have an email for you. Reply EMAIL to add one now.", CONTACT));
    expect(repo.createStatementRequest).toHaveBeenCalledWith(expect.objectContaining({ status: 'awaiting_email', rowCount: 41 }));
    expect(repo.queueStatementEmail).not.toHaveBeenCalled();
    // Nothing has left the estate yet, so nothing is logged.
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('counts a PDF toward the cap and makes no file once it is reached', async () => {
    const repo = repository();
    const canLookup = vi.fn().mockResolvedValue('resident_cap');
    const replies = await chat(repo, ['statement', '1'], identity, { canLookup });

    expect(replies[1]).toContain("You've reached today's limit");
    expect(repo.loadStatement).not.toHaveBeenCalled();
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
  });

  it('makes no file when the disclosure log fails', async () => {
    const repo = repository();
    vi.mocked(repo.logDisclosure).mockRejectedValueOnce(new Error('insert failed'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const replies = await chat(repo, ['statement', '1']);

    expect(replies[1]).toMatch(/^I can't load your records right now/);
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
  });

  it.each([
    ['the PDF cannot be built', { loadStatement: vi.fn().mockRejectedValue(new Error('render failed')) }],
    ['the PDF cannot be stored', { storeStatementPdf: vi.fn().mockRejectedValue(new Error('upload failed')) }],
  ])('gives the failure reply and the estate office line, never rows, when %s', async (_label, overrides) => {
    const repo = repository([PALM], overrides);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const replies = await chat(repo, ['statement', '1']);

    expect(replies).toHaveLength(2);
    expect(replies[1]).toMatch(/^I can't load your records right now/);
    expect(replies[1]).toContain(CONTACT);
    expect(replies[1]).not.toMatch(/Charges|Payments:|Invoice|Payment ref/);
  });

  it('no longer takes PDF as a reply: it is unrecognised', async () => {
    expect((await chat(repository(), ['pdf']))[0]).toBe(UNRECOGNISED);
    expect((await chat(repository(), ['statement', '1', 'pdf']))[2]).toBe(UNRECOGNISED);
  });

  it('asks for the PIN again when the session was locked before the period was chosen', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    await chat(repo, ['PIN 482915', '3']);
    const session = vi.mocked(repo.saveSession).mock.lastCall![0];
    repo.setStoredSession({ ...session, pinAuthenticated: false });
    const replies = await chat(repo, ['1']);
    expect(replies[0]).toContain('Enter your 4–6 digit PIN to view your financial standing (e.g. 4821).');
    expect(repo.loadStatement).not.toHaveBeenCalled();
    expect(repo.storeStatementPdf).not.toHaveBeenCalled();
  });
});

describe('WhatsApp Assistant payment reminders (#816 decisions 2-4)', () => {
  it('shows the live state and asks before turning reminders off', async () => {
    const repo = repository();
    const replies = await chat(repo, ['4', '2', '1']);

    expect(replies[0]).toContain('2. Payment reminders: ON');
    expect(replies[1]).toBe('Turn off payment reminders on WhatsApp? Reply 1 Yes, 2 No.');
    expect(repo.setRemindersOn).toHaveBeenCalledWith('resident-1', false);
    expect(replies[2]).toBe(`Reminders off. Your bills still apply. Reply 4 then 2 to turn them back on.\n${FOOTER}`);
  });

  it('changes nothing when the resident answers No', async () => {
    const repo = repository();
    const replies = await chat(repo, ['reminders', '2']);

    expect(replies[0]).toBe('Turn off payment reminders on WhatsApp? Reply 1 Yes, 2 No.');
    expect(replies[1]).toBe(`Nothing was changed.\n${FOOTER}`);
    expect(repo.setRemindersOn).not.toHaveBeenCalled();
  });

  it('turns reminders back on straight away and shows OFF while they are off', async () => {
    const repo = repository([PALM], { getRemindersOn: vi.fn().mockResolvedValue(false) });
    const replies = await chat(repo, ['4', '2']);

    expect(replies[0]).toContain('2. Payment reminders: OFF');
    expect(repo.setRemindersOn).toHaveBeenCalledWith('resident-1', true);
    expect(replies[1]).toBe(`Reminders on. You will get payment reminders on WhatsApp again.\n${FOOTER}`);
  });

  it('offers reminders to billable residents only', async () => {
    const repo = repository([]);
    const replies = await chat(repo, ['4', '2', 'reminders'], community);

    expect(replies[0]).toBe(['Alert settings', '1. All estate WhatsApp messages: ON', 'Reply 1 to turn them off.', FOOTER].join('\n'));
    expect(replies[1]).toBe(UNRECOGNISED);
    expect(replies[2]).toBe(replies[0]);
    expect(repo.getRemindersOn).not.toHaveBeenCalled();
    expect(repo.setRemindersOn).not.toHaveBeenCalled();
  });

  it('reads YES and NO as the answer to the confirmation', async () => {
    const repo = repository();
    const replies = await chat(repo, ['reminders', 'no', 'reminders', 'yes']);

    expect(replies[1]).toBe(`Nothing was changed.\n${FOOTER}`);
    expect(replies[3]).toContain('Reminders off.');
    expect(repo.setRemindersOn).toHaveBeenCalledTimes(1);
    expect(repo.setRemindersOn).toHaveBeenCalledWith('resident-1', false);
  });

  it('keeps the confirmation open on a miss and does not turn reminders off', async () => {
    const repo = repository();
    const replies = await chat(repo, ['reminders', 'maybe']);

    expect(replies[1]).toBe(UNRECOGNISED);
    expect(repo.setRemindersOn).not.toHaveBeenCalled();
  });
});

describe('WhatsApp Assistant update email (#816 decisions 5-8)', () => {
  it('sends the code to the new address, then saves it only when the code comes back', async () => {
    const repo = repository();
    const replies = await chat(repo, ['5', 'New.Name@Example.com', '482915']);

    expect(replies[0]).toBe('What email address should we use? Reply with the address, or CANCEL.');
    expect(repo.startEmailChange).toHaveBeenCalledWith('resident-1', 'New.Name@Example.com');
    expect(replies[1]).toBe('We sent a 6-digit code to n***@example.com. It expires in 30 minutes. Reply with the code, or CANCEL.');
    expect(repo.confirmEmailChange).toHaveBeenCalledWith('resident-1', '482915');
    expect(replies[2]).toBe(`Your email is now n***@example.com.\n${FOOTER}`);
  });

  it('works for the community tier and from the EMAIL keyword', async () => {
    const repo = repository([]);
    const replies = await chat(repo, ['email'], community);
    expect(replies[0]).toBe('What email address should we use? Reply with the address, or CANCEL.');
  });

  it('says a queued statement will arrive once the address is verified', async () => {
    const repo = repository([PALM], { confirmEmailChange: vi.fn().mockResolvedValue({ status: 'saved', email: 'ada@example.com', statementsQueued: 1 }) });
    const replies = await chat(repo, ['email', 'ada@example.com', '123456']);
    expect(replies[2]).toBe(`Your email is now a***@example.com. Your statement will arrive within 15 minutes.\n${FOOTER}`);
  });

  it('asks for the address again when it is not one', async () => {
    const repo = repository([PALM], { startEmailChange: vi.fn().mockResolvedValue({ status: 'invalid' }) });
    const replies = await chat(repo, ['email', 'not an address', 'cancel']);

    expect(replies[1]).toBe("That doesn't look like an email address. Reply with it again, for example name@example.com, or CANCEL.");
    expect(repo.confirmEmailChange).not.toHaveBeenCalled();
    expect(replies[2]).toMatch(/^Cancelled\. Nothing was changed\./);
  });

  it.each([
    ['same', 'That is already your verified email. Nothing was changed.'],
    ['rate_limited', 'Too many codes were sent. Please try again in an hour. Nothing was changed.'],
    ['failed', "I couldn't do that right now. Nothing was changed. Please try again in a few minutes."],
  ] as const)('answers a %s start without saving anything', async (status, text) => {
    const repo = repository([PALM], { startEmailChange: vi.fn().mockResolvedValue({ status }) });
    const replies = await chat(repo, ['email', 'ada@example.com']);
    expect(replies[1]).toBe(`${text}\n${FOOTER}`);
    expect(repo.confirmEmailChange).not.toHaveBeenCalled();
  });

  it('asks for six digits and does not check anything else as a code', async () => {
    const repo = repository();
    const replies = await chat(repo, ['email', 'ada@example.com', 'abc', '12345']);

    expect(replies[2]).toBe('Reply with the 6-digit code from the email, or CANCEL.');
    expect(replies[3]).toBe('Reply with the 6-digit code from the email, or CANCEL.');
    expect(repo.confirmEmailChange).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong', "That code isn't correct. Check the email and reply with the code again, or CANCEL."],
    ['locked', `Too many wrong codes. Reply EMAIL to start again.\n${FOOTER}`],
    ['expired', `That code has expired. Reply EMAIL to start again.\n${FOOTER}`],
  ] as const)('answers a %s code', async (status, text) => {
    const repo = repository([PALM], { confirmEmailChange: vi.fn().mockResolvedValue({ status }) });
    const replies = await chat(repo, ['email', 'ada@example.com', '123456']);
    expect(replies[2]).toBe(text);
  });

  it('needs the PIN first when one is set, then asks for the address', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    const replies = await chat(repo, ['5', 'PIN 482915']);

    expect(replies[0]).toBe(`Enter your 4–6 digit PIN before changing your email (e.g. 4821).\n${FOOTER}`);
    expect(repo.startEmailChange).not.toHaveBeenCalled();
    expect(replies[1]).toBe('PIN verified.\n\nWhat email address should we use? Reply with the address, or CANCEL.');
  });

  it('does not ask a community-tier resident with no PIN for one, even when the PIN is forced, because they cannot set it', async () => {
    const repo = repository([], { getForcePin: vi.fn().mockResolvedValue(true) });
    const replies = await chat(repo, ['email'], community);
    expect(replies[0]).toBe('What email address should we use? Reply with the address, or CANCEL.');
  });

  it('asks the community tier for the PIN too, and takes no address before it', async () => {
    const repo = repository([]);
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    const replies = await chat(repo, ['email', 'ada@example.com', 'email', 'PIN 482915'], community);

    expect(replies[0]).toContain('before changing your email');
    expect(replies[1]).toBe(UNRECOGNISED);
    expect(repo.startEmailChange).not.toHaveBeenCalled();
    expect(replies[3]).toBe('PIN verified.\n\nWhat email address should we use? Reply with the address, or CANCEL.');
  });
});

describe('WhatsApp Assistant report a payment (#816 decisions 10-12)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const CONFIRM = [
    '*Report a payment*',
    'Property: 12 Palm Close',
    'Amount: ₦50,000.00',
    'Date: 12 Oct 2026',
    'Reference: GTB TRF FROM ADA',
    'Reply 1 to send it to the estate office, 2 to cancel.',
  ].join('\n');

  it('asks for amount, date and reference, confirms, then files the report', async () => {
    const repo = repository();
    const replies = await chat(repo, ['report', '50,000', '12 Oct 2026', 'GTB TRF FROM ADA', '1']);

    expect(replies[0]).toBe('*Report a payment, 12 Palm Close*\nHow much did you pay? Reply with the amount in naira, for example 50000, or CANCEL.');
    expect(replies[1]).toBe('₦50,000.00. When did you pay? Reply with the date, for example 12 Oct 2026, or TODAY or YESTERDAY.');
    expect(replies[2]).toContain('12 Oct 2026. Reply with the bank narration or reference');
    expect(replies[3]).toBe(CONFIRM);
    expect(repo.createPaymentReport).toHaveBeenCalledTimes(1);
    expect(repo.createPaymentReport).toHaveBeenCalledWith({
      residentId: 'resident-1',
      houseId: 'house-1',
      houseLabel: '12 Palm Close',
      amount: 50000,
      paymentDate: '2026-10-12',
      reference: 'GTB TRF FROM ADA',
      screenshotAt: null,
    });
    expect(replies[4]).toBe(`Reported. The estate office will check it against the bank statement. It shows as awaiting verification until then.\n${FOOTER}`);
  });

  it('files nothing until the resident confirms, and cancels on 2', async () => {
    const repo = repository();
    const replies = await chat(repo, ['report', '50000', 'yesterday', 'GTB TRF FROM ADA', '2']);

    expect(replies[2]).toContain('19 Oct 2026. Reply with the bank narration');
    expect(replies[4]).toMatch(/^Cancelled\. Nothing was changed\./);
    expect(repo.createPaymentReport).not.toHaveBeenCalled();
  });

  it('asks which property first when the resident has several', async () => {
    const repo = repository([PALM, CEDAR]);
    const replies = await chat(repo, ['report', '2', '75000']);

    expect(replies[0]).toBe('Which property?\n1. 12 Palm Close\n2. 4 Cedar Way\nReply with the property number.');
    expect(replies[1]).toContain('*Report a payment, 4 Cedar Way*');
    expect(replies[2]).toContain('₦75,000.00. When did you pay?');
  });

  it.each([
    ['abc', "That doesn't look like an amount. Reply with the amount in naira, for example 50000, or CANCEL."],
    ['0.00', 'The amount must be more than ₦0. Reply with the amount in naira, or CANCEL.'],
    ['5 million', "That doesn't look like an amount. Reply with the amount in naira, for example 50000, or CANCEL."],
    ['99999999999', 'That amount is too large. Check it and reply with the amount in naira, or CANCEL.'],
  ])('refuses the amount %s and asks again', async (amount, reply) => {
    const repo = repository();
    const replies = await chat(repo, ['report', amount]);
    expect(replies[1]).toBe(reply);
  });

  it.each([
    ['soon', "That doesn't look like a date. Reply with it like 12 Oct 2026, or TODAY or YESTERDAY, or CANCEL."],
    ['31 Feb 2026', "That doesn't look like a date. Reply with it like 12 Oct 2026, or TODAY or YESTERDAY, or CANCEL."],
    ['21 Oct 2026', 'That date is in the future. Reply with the date you paid, or CANCEL.'],
    ['20 Jul 2026', `Payments from more than 90 days ago cannot be reported here. Reply with a later date, or CANCEL.\n${CONTACT}`],
  ])('refuses the date %s', async (date, reply) => {
    const repo = repository();
    const replies = await chat(repo, ['report', '50000', date]);
    expect(replies[2]).toBe(reply);
  });

  it('accepts today, the oldest allowed day, and a long month name', async () => {
    const repo = repository();
    const replies = await chat(repo, ['report', '50000', 'today', 'cancel', 'report', '50000', '22 July 2026']);
    expect(replies[2]).toContain('20 Oct 2026. Reply with the bank narration');
    expect(replies[6]).toContain('22 Jul 2026. Reply with the bank narration');
  });

  it('keeps a reference such as MENU as the reference, not a keyword', async () => {
    const repo = repository();
    const replies = await chat(repo, ['report', '50000', '12 Oct 2026', 'menu']);
    expect(replies[3]).toContain('Reference: menu');
  });

  it('asks for a shorter reference and keeps the report open', async () => {
    const repo = repository();
    const replies = await chat(repo, ['report', '50000', '12 Oct 2026', 'x'.repeat(101), 'GTB TRF FROM ADA']);
    expect(replies[3]).toBe('Reply with the narration or reference in under 100 characters, or CANCEL.');
    expect(replies[4]).toBe(CONFIRM);
  });

  it.each([
    ['duplicate', 'A payment of ₦50,000.00 on 12 Oct 2026 for 12 Palm Close has already been reported. Nothing was sent.'],
    ['limit', `You've reported 3 payments today, which is the limit. Please try again tomorrow.\n${CONTACT}`],
    ['invalid', `That payment could not be reported. Nothing was sent.\n${CONTACT}`],
    ['not_your_property', `That payment could not be reported. Nothing was sent.\n${CONTACT}`],
  ] as const)('tells the resident when the report is %s', async (status, reply) => {
    const repo = repository([PALM], { createPaymentReport: vi.fn().mockResolvedValue({ status }) });
    const replies = await chat(repo, ['report', '50000', '12 Oct 2026', 'GTB TRF FROM ADA', '1']);
    expect(replies[4]).toBe(`${reply}\n${FOOTER}`);
  });

  it('acknowledges a screenshot, notes when it came, and carries on', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });
    const opts = { repository: repo, optedIn: true, send };
    await handleFinancialMessage(message('report'), identity, opts);
    await handleFinancialMessage(message('50000'), identity, opts);
    // 1760000000 is 2025-10-09 08:53:20 UTC, so 09:53 in Lagos.
    await handleFinancialMessage({ ...message(''), type: 'image', text: null }, identity, opts);
    await handleFinancialMessage(message('12 Oct 2026'), identity, opts);
    await handleFinancialMessage(message('GTB TRF FROM ADA'), identity, opts);
    await handleFinancialMessage(message('1'), identity, opts);

    expect(send.mock.calls[2][0].body).toBe('Screenshot received. The estate office will see it on the estate phone.\nContinue with your report, or reply CANCEL.');
    expect(send.mock.calls[3][0].body).toContain('12 Oct 2026. Reply with the bank narration');
    expect(repo.createPaymentReport).toHaveBeenCalledWith(expect.objectContaining({ screenshotAt: '09:53 on 9 Oct 2025' }));
  });

  it('still answers an image outside a report with the text-only reply', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });
    await handleFinancialMessage({ ...message(''), type: 'image', text: null }, identity, { repository: repo, optedIn: true, send });
    expect(send.mock.calls[0][0].body).toBe('I can only read text messages here. Please type your request.');
  });

  it('goes back to Financial standing on 0 and forgets the draft', async () => {
    const repo = repository();
    const replies = await chat(repo, ['report', '50000', '0', '6', '1']);
    expect(replies[2]).toBe(FINANCIAL_MENU);
    // A fresh report starts from the amount, not the date.
    expect(replies[3]).toContain('How much did you pay?');
  });

  it('asks for the PIN before any report step when a PIN is set', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    const replies = await chat(repo, ['report', 'PIN 482915']);

    expect(replies[0]).toContain('to view your financial standing');
    expect(replies[1]).toBe('PIN verified.\n\n*Report a payment, 12 Palm Close*\nHow much did you pay? Reply with the amount in naira, for example 50000, or CANCEL.');
  });

  it('does not offer reports to a community-tier resident', async () => {
    const repo = repository([]);
    const replies = await chat(repo, ['report'], community);
    expect(replies[0]).toMatch(/^Financial standing is only available to residents billed for a property\./);
    expect(repo.createPaymentReport).not.toHaveBeenCalled();
  });
});

describe('WhatsApp Assistant receipts (#816 decision 14)', () => {
  const PAYMENTS = [
    { id: 'payment-1', amount: 50000, payment_date: '2026-10-12T11:00:00+00:00', method: 'bank_transfer', is_verified: true },
    { id: 'payment-2', amount: 25000, payment_date: '2026-10-03T11:00:00+00:00', method: null, is_verified: false },
  ];
  const RECEIPT = {
    receiptNumber: 'RCP-PAYMENT1',
    residentName: 'Ada Example',
    residentCode: 'RES001',
    propertyLabel: '12 Palm Close',
    amount: 50000,
    paymentDate: '2026-10-12T11:00:00+00:00',
    method: 'bank_transfer',
    reference: 'GTB TRF',
    verifiedAt: '2026-10-13T09:00:00+00:00',
  };

  function receiptRepo(overrides: Partial<WhatsAppFinancialRepository> = {}) {
    return repository([PALM], {
      getReceiptPayments: vi.fn().mockResolvedValue(PAYMENTS),
      loadReceipt: vi.fn().mockResolvedValue(RECEIPT),
      ...overrides,
    });
  }

  it('lists the latest payments, marking the unverified, and sends the PDF of a verified one', async () => {
    const repo = receiptRepo();
    const send = vi.fn().mockResolvedValue({ success: true });
    const opts = { repository: repo, optedIn: true, send };
    await handleFinancialMessage(message('receipt'), identity, opts);
    await handleFinancialMessage(message('1'), identity, opts);

    expect(repo.getReceiptPayments).toHaveBeenCalledWith('resident-1', 'house-1', 5);
    expect(send.mock.calls[0][0].body).toBe([
      '*Receipts, 12 Palm Close*',
      '1.  12 Oct 2026  ₦50,000.00  bank transfer',
      '2.  3 Oct 2026  ₦25,000.00  payment  (awaiting verification)',
      'Reply 1–2 to get a receipt.',
      FOOTER,
    ].join('\n'));
    expect(repo.loadReceipt).toHaveBeenCalledWith('resident-1', 'house-1', 'payment-1');
    const body = ['*Receipt, 12 Palm Close*', '₦50,000.00 on 12 Oct 2026. Your PDF is attached.'].join('\n');
    expect(repo.storeReceiptPdf).toHaveBeenCalledWith({ residentId: 'resident-1', phoneNumber: '+2348000000000', houseId: 'house-1', inboundMessageId: expect.any(String), replyText: body }, RECEIPT);
    expect(send.mock.calls[1][0]).toMatchObject({ body, mediaUrls: ['https://storage.test/signed/receipt.pdf'] });
    expect(send.mock.calls[2][0]).toMatchObject({ body: FINANCIAL_MENU });
  });

  it('logs the list and the PDF as disclosures, the PDF before the file exists', async () => {
    const repo = receiptRepo();
    await chat(repo, ['1', '5', '1']);

    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'receipt', metadata: { step: 'list', row_count: 2 } }));
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'receipt', channel: 'pdf', metadata: { step: 'pdf', payment_id: 'payment-1' } }));
    const pdfLog = vi.mocked(repo.logDisclosure).mock.calls.findIndex(([entry]) => entry.channel === 'pdf');
    expect(vi.mocked(repo.logDisclosure).mock.invocationCallOrder[pdfLog]).toBeLessThan(vi.mocked(repo.storeReceiptPdf).mock.invocationCallOrder[0]);
  });

  it('says a receipt is available once an unverified payment is verified, and makes no file', async () => {
    const repo = receiptRepo();
    const replies = await chat(repo, ['receipt', '2']);

    expect(replies[1]).toBe(thenMenu('A receipt is available once this payment is verified.'));
    expect(repo.loadReceipt).not.toHaveBeenCalled();
    expect(repo.storeReceiptPdf).not.toHaveBeenCalled();
  });

  it('gives the same answer when a payment listed as verified is no longer verified', async () => {
    const repo = receiptRepo({ loadReceipt: vi.fn().mockResolvedValue(null) });
    const replies = await chat(repo, ['receipt', '1']);
    expect(replies[1]).toBe(thenMenu('A receipt is available once this payment is verified.'));
    expect(repo.storeReceiptPdf).not.toHaveBeenCalled();
  });

  it('asks again for a number that is not on the list', async () => {
    const repo = receiptRepo();
    const replies = await chat(repo, ['receipt', '3', 'two']);
    expect(replies[1]).toBe(UNRECOGNISED);
    expect(repo.loadReceipt).not.toHaveBeenCalled();
  });

  it('says so when there are no payments', async () => {
    const replies = await chat(repository(), ['receipt']);
    expect(replies[0]).toBe(thenMenu('*Receipts, 12 Palm Close*', 'No payments recorded for 12 Palm Close.'));
  });

  it('counts toward the daily caps: no list and no file when the resident is capped', async () => {
    const repo = receiptRepo();
    const replies = await chat(repo, ['receipt'], identity, { canLookup: vi.fn().mockResolvedValue('resident_cap') });
    expect(replies[0]).toContain("You've reached today's limit of 20 financial lookups.");
    expect(repo.getReceiptPayments).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();

    const capAfterList = vi.fn().mockResolvedValueOnce('ok').mockResolvedValueOnce('estate_cap');
    const repo2 = receiptRepo();
    const replies2 = await chat(repo2, ['receipt', '1'], identity, { canLookup: capAfterList });
    expect(replies2[1]).toContain('Financial lookups are paused for everyone until midnight.');
    expect(repo2.storeReceiptPdf).not.toHaveBeenCalled();
  });

  it('needs the PIN first, and is not offered to a community-tier resident', async () => {
    const repo = receiptRepo();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    const replies = await chat(repo, ['receipt', 'PIN 482915', '1']);
    expect(replies[0]).toContain('to view your financial standing');
    expect(replies[1]).toContain('PIN verified.\n\n*Receipts, 12 Palm Close*');
    expect(repo.getReceiptPayments).toHaveBeenCalledTimes(1);
    expect(repo.storeReceiptPdf).toHaveBeenCalledTimes(1);

    const community_ = receiptRepo();
    const blocked = await chat(community_, ['receipt'], community);
    expect(blocked[0]).toMatch(/^Financial standing is only available/);
    expect(community_.getReceiptPayments).not.toHaveBeenCalled();
  });

  it('is item 5 of Financial standing, and 0 goes back to the menu', async () => {
    const repo = receiptRepo();
    const replies = await chat(repo, ['1', '5', '0']);
    expect(replies[0]).toContain('5. Receipt');
    expect(replies[1]).toContain('*Receipts, 12 Palm Close*');
    expect(replies[2]).toBe(FINANCIAL_MENU);
  });
});

describe('WhatsApp Assistant clearance certificate (#816 decision 15)', () => {
  const PAID_UP: OwedFigures = { invoiceCount: 3, outstanding: 0, overdue: null, next: null, awaitingVerification: 0 };

  it('tells a resident who owes money how much, and files no request', async () => {
    const repo = repository();
    const replies = await chat(repo, ['clearance']);

    expect(replies[0]).toBe(thenMenu(
      '*Clearance certificate, 12 Palm Close*',
      'You owe ₦125,000.00 on 12 Palm Close, so a certificate cannot be requested yet.',
      'Reply PAY for how to pay',
    ));
    expect(repo.requestClearance).not.toHaveBeenCalled();
  });

  it('files an approval request for a resident who owes nothing, naming the property', async () => {
    const repo = repository([PALM], { getOwed: vi.fn().mockResolvedValue(PAID_UP) });
    const replies = await chat(repo, ['1', '7']);

    expect(repo.requestClearance).toHaveBeenCalledWith({ residentId: 'resident-1', residentName: 'Ada Example', houseId: 'house-1', houseLabel: '12 Palm Close' });
    expect(replies[1]).toBe(thenMenu(
      '*Clearance certificate, 12 Palm Close*',
      'Your clearance certificate request for 12 Palm Close was sent to the estate office. The certificate will be sent here once it is approved.',
    ));
  });

  it('says so when a request for the property is already waiting', async () => {
    const repo = repository([PALM], { getOwed: vi.fn().mockResolvedValue(PAID_UP), requestClearance: vi.fn().mockResolvedValue({ status: 'duplicate' }) });
    const replies = await chat(repo, ['clearance']);
    expect(replies[0]).toContain(`A clearance certificate request for 12 Palm Close is already waiting for approval. Nothing new was sent.\n${CONTACT}`);
  });

  it('gives a second resident on the same property the neutral reply with the contact line', async () => {
    const tenant = { ...identity, id: 'resident-2', firstName: 'Bola', lastName: 'Tenant' };
    const repo = repository([PALM], { getOwed: vi.fn().mockResolvedValue(PAID_UP), requestClearance: vi.fn().mockResolvedValue({ status: 'duplicate' }) });
    const replies = await chat(repo, ['clearance'], tenant);

    expect(repo.requestClearance).toHaveBeenCalledWith(expect.objectContaining({ residentId: 'resident-2', houseId: 'house-1' }));
    expect(replies[0]).toBe(thenMenu(
      '*Clearance certificate, 12 Palm Close*',
      'A clearance certificate request for 12 Palm Close is already waiting for approval. Nothing new was sent.',
      CONTACT,
    ));
    expect(replies[0]).not.toMatch(/your (clearance|request)/i);
  });

  it('asks per property, and uses the property the resident picked', async () => {
    const repo = repository([PALM, CEDAR], { getOwed: vi.fn().mockResolvedValue(PAID_UP) });
    const replies = await chat(repo, ['clearance', '2']);

    expect(replies[0]).toContain('Which property?');
    expect(repo.getOwed).toHaveBeenCalledWith('resident-1', 'house-2');
    expect(repo.requestClearance).toHaveBeenCalledWith(expect.objectContaining({ houseId: 'house-2', houseLabel: '4 Cedar Way' }));
  });

  it('logs the check as a disclosure without any amount, and counts toward the caps', async () => {
    const repo = repository();
    await chat(repo, ['clearance']);
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'clearance', metadata: { owes: true } }));

    const capped = repository();
    const replies = await chat(capped, ['clearance'], identity, { canLookup: vi.fn().mockResolvedValue('estate_cap') });
    expect(replies[0]).toContain('Financial lookups are paused for everyone until midnight.');
    expect(capped.getOwed).not.toHaveBeenCalled();
    expect(capped.requestClearance).not.toHaveBeenCalled();
  });

  it('needs the PIN and is not offered to a community-tier resident', async () => {
    const repo = repository([PALM], { getOwed: vi.fn().mockResolvedValue(PAID_UP) });
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    const replies = await chat(repo, ['clearance']);
    expect(replies[0]).toContain('to view your financial standing');
    expect(repo.requestClearance).not.toHaveBeenCalled();

    const blocked = repository([]);
    expect((await chat(blocked, ['clearance'], community))[0]).toMatch(/^Financial standing is only available/);
    expect(blocked.requestClearance).not.toHaveBeenCalled();
  });

  it('is item 7 of Financial standing', async () => {
    const repo = repository([PALM], { getOwed: vi.fn().mockResolvedValue(PAID_UP) });
    const replies = await chat(repo, ['1', '7']);
    expect(replies[0]).toContain('7. Clearance certificate');
    expect(repo.requestClearance).toHaveBeenCalledTimes(1);
  });
});

describe('WhatsApp Assistant satisfaction survey (#872)', () => {
  const ASK = ['How was Palm Estate Assistant today?', '1. Good', '2. Okay', '3. Poor'].join('\n');
  const REASONS = [
    'Sorry about that. What went wrong?',
    '1. Too slow',
    "2. Couldn't find what I needed",
    '3. Information looked wrong',
    '4. Something else',
  ].join('\n');
  const PAID_UP: OwedFigures = { invoiceCount: 3, outstanding: 0, overdue: null, next: null, awaitingVerification: 0 };

  function due(overrides: Partial<WhatsAppFinancialRepository> = {}) {
    return repository([PALM], { askSurvey: vi.fn().mockResolvedValue('survey-1'), ...overrides });
  }

  it.each(['thanks', 'Thank you', 'ok', 'OK.', 'okay'])('asks after %s right after a financial answer, then stores a Good score', async (thanks) => {
    const repo = due();
    const replies = await chat(repo, ['wallet', thanks, '1']);

    expect(replies[1]).toBe(ASK);
    expect(repo.askSurvey).toHaveBeenCalledWith({ residentId: 'resident-1', phoneNumber: '+2348000000000', trigger: 'answer' });
    expect(repo.answerSurvey).toHaveBeenCalledWith('resident-1', 'survey-1', { score: 'good' });
    expect(replies[2]).toBe(`Thanks for the feedback.\n${FOOTER}`);
    expect(repo.saveSession).toHaveBeenLastCalledWith(expect.objectContaining({ currentNode: 'main', draft: null }));
  });

  it('names the Assistant from the repository in the survey question', async () => {
    const repo = due({ getAssistantName: vi.fn().mockResolvedValue('Ada') });
    const replies = await chat(repo, ['wallet', 'thanks']);
    expect(replies[1]).toBe(ASK.replace('Palm Estate Assistant', 'Ada'));
  });

  it('stores an Okay score', async () => {
    const repo = due();
    await chat(repo, ['wallet', 'thanks', '2']);
    expect(repo.answerSurvey).toHaveBeenCalledWith('resident-1', 'survey-1', { score: 'okay' });
  });

  it('asks why on Poor, then for one optional line, then closes with the estate office line', async () => {
    const repo = due();
    const replies = await chat(repo, ['wallet', 'thanks', '3', '2', 'The statement missed my last payment']);

    expect(replies[2]).toBe(REASONS);
    expect(replies[3]).toBe('Anything else you want to tell us? Reply with one line, or SKIP.');
    expect(replies[4]).toBe(`Thanks for telling us. The estate office will see your feedback.\n${CONTACT}\nReply 0 for menu.`);
    expect(repo.answerSurvey).toHaveBeenNthCalledWith(1, 'resident-1', 'survey-1', { score: 'poor' });
    expect(repo.answerSurvey).toHaveBeenNthCalledWith(2, 'resident-1', 'survey-1', { reason: 'not_found' });
    expect(repo.answerSurvey).toHaveBeenNthCalledWith(3, 'resident-1', 'survey-1', { comment: 'The statement missed my last payment' });
  });

  it.each([['1', 'too_slow'], ['2', 'not_found'], ['3', 'wrong_information'], ['4', 'other']])('maps reason %s to %s', async (choice, reason) => {
    const repo = due();
    await chat(repo, ['wallet', 'thanks', '3', choice]);
    expect(repo.answerSurvey).toHaveBeenLastCalledWith('resident-1', 'survey-1', { reason });
  });

  it('stores no comment on SKIP, and never stores digits typed by habit', async () => {
    const skipped = due();
    const replies = await chat(skipped, ['wallet', 'thanks', '3', '1', 'skip']);
    expect(replies[4]).toContain('Thanks for telling us.');
    expect(skipped.answerSurvey).toHaveBeenCalledTimes(2);

    const digits = due();
    await chat(digits, ['wallet', 'thanks', '3', '1', '482915']);
    expect(digits.answerSurvey).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(vi.mocked(digits.answerSurvey).mock.calls)).not.toContain('482915');
  });

  it('asks nothing when the resident is not due (opted out, or asked in the last 30 days)', async () => {
    const repo = repository();
    const replies = await chat(repo, ['wallet', 'thanks']);

    expect(repo.askSurvey).toHaveBeenCalledTimes(1);
    expect(replies[1]).toBe(UNRECOGNISED);
    expect(replies.join('\n')).not.toContain('How was Palm Estate Assistant today?');
  });

  it('asks nothing for a thank-you that is not right after a financial answer', async () => {
    const repo = due();
    const replies = await chat(repo, ['hi', 'thanks', 'wallet', 'hi', 'thanks']);

    expect(repo.askSurvey).not.toHaveBeenCalled();
    expect(replies.join('\n')).not.toContain('How was Palm Estate Assistant today?');
  });

  it('asks nothing after an answer that is not a success: an amount owed on a clearance, a capped lookup, no receipt', async () => {
    const owing = due();
    await chat(owing, ['clearance', 'thanks']);
    expect(owing.askSurvey).not.toHaveBeenCalled();

    const capped = due();
    await chat(capped, ['wallet', 'thanks'], identity, { canLookup: vi.fn().mockResolvedValue('resident_cap') });
    expect(capped.askSurvey).not.toHaveBeenCalled();

    const noReceipts = due();
    await chat(noReceipts, ['receipt', 'thanks']);
    expect(noReceipts.askSurvey).not.toHaveBeenCalled();
  });

  it('asks nothing inside a PIN step or after a session expiry', async () => {
    const pinStep = due();
    pinStep.setStoredSession({ phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode: 'pin:menu', selectedHouseId: null, pinAuthenticated: false, expiresAt: new Date(Date.now() + 60_000).toISOString(), draft: { answered: true } });
    await chat(pinStep, ['ok']);
    expect(pinStep.askSurvey).not.toHaveBeenCalled();

    const expired = due();
    expired.setStoredSession({ phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode: 'answer', selectedHouseId: 'house-1', pinAuthenticated: false, expiresAt: new Date(Date.now() - 1000).toISOString(), draft: { answered: true } });
    const replies = await chat(expired, ['thanks']);
    expect(replies[0]).toMatch(/^Your session ended after 15 minutes/);
    expect(expired.askSurvey).not.toHaveBeenCalled();
  });

  it('does not take a survey answer after the session expired', async () => {
    const repo = due();
    repo.setStoredSession({ phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode: 'survey_score', selectedHouseId: 'house-1', pinAuthenticated: false, expiresAt: new Date(Date.now() - 1000).toISOString(), draft: { surveyId: 'survey-1' } });
    const replies = await chat(repo, ['3']);
    expect(replies[0]).toMatch(/^Your session ended after 15 minutes/);
    expect(repo.answerSurvey).not.toHaveBeenCalled();
  });

  it('reads anything but an answer as an ordinary message and leaves the survey', async () => {
    const repo = due();
    const replies = await chat(repo, ['wallet', 'thanks', 'menu', '3']);

    expect(repo.answerSurvey).not.toHaveBeenCalled();
    expect(replies[2]).toBe(MAIN_MENU);
    // The survey is over: 3 is now the main menu's How to pay, not a Poor score.
    expect(replies[3]).toContain('*How to pay*');
  });

  it('answers the reply as usual when the survey cannot be started', async () => {
    const repo = due({ askSurvey: vi.fn().mockRejectedValue(new Error('db down')) });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const replies = await chat(repo, ['wallet', 'ok']);

    expect(replies[1]).toBe(UNRECOGNISED);
    expect(errors).toHaveBeenCalledWith('WhatsApp survey could not be started:', expect.any(Error));
    errors.mockRestore();
  });

  it('asks after an accepted payment report, with the confirmation first', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    const repo = due();
    const replies = await chat(repo, ['report', '50000', '12 Oct 2026', 'GTB TRF', '1', '3']);
    vi.useRealTimers();

    expect(replies[4]).toBe(`Reported. The estate office will check it against the bank statement. It shows as awaiting verification until then.\n${FOOTER}\n\n${ASK}`);
    expect(repo.askSurvey).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'payment_report' }));
    expect(replies[5]).toBe(REASONS);
  });

  it('asks nothing when a payment report was not accepted', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T10:00:00Z'));
    const repo = due({ createPaymentReport: vi.fn().mockResolvedValue({ status: 'duplicate' }) });
    const replies = await chat(repo, ['report', '50000', '12 Oct 2026', 'GTB TRF', '1']);
    vi.useRealTimers();

    expect(repo.askSurvey).not.toHaveBeenCalled();
    expect(replies[4]).not.toContain('How was Palm Estate Assistant today?');
  });

  it('asks after an accepted clearance request, and not when one is already waiting', async () => {
    const accepted = due({ getOwed: vi.fn().mockResolvedValue(PAID_UP) });
    const replies = await chat(accepted, ['clearance', '2']);
    expect(replies[0]).toMatch(new RegExp(`${FOOTER}\\n\\n${ASK.replace(/\./g, '\\.').replace(/\?/g, '\\?')}$`));
    expect(accepted.askSurvey).toHaveBeenCalledWith(expect.objectContaining({ trigger: 'clearance_request' }));
    expect(accepted.answerSurvey).toHaveBeenCalledWith('resident-1', 'survey-1', { score: 'okay' });

    const waiting = due({ getOwed: vi.fn().mockResolvedValue(PAID_UP), requestClearance: vi.fn().mockResolvedValue({ status: 'duplicate' }) });
    await chat(waiting, ['clearance']);
    expect(waiting.askSurvey).not.toHaveBeenCalled();
  });
});

describe('What I owe roll-forward balance (#863)', () => {
  function mockOwedClient(balance: Record<string, number> | null) {
    const results: Record<string, unknown[]> = {
      invoices: [
        { data: [{ invoice_number: 'INV-1', amount_due: 10000, amount_paid: 4000, due_date: '2026-01-01' }], error: null },
        { count: 3, error: null },
      ],
      payment_records: [{ data: [{ amount: 700 }], error: null }],
    };
    const from = vi.fn((table: string) => {
      const result = results[table].shift();
      const chain: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown) => resolve(result) };
      for (const method of ['select', 'eq', 'in', 'neq', 'order']) chain[method] = () => chain;
      return chain;
    });
    const rpc = vi.fn(() => ({ single: async () => ({ data: balance, error: null }) }));
    vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as unknown as ReturnType<typeof createAdminClient>);
    return { rpc };
  }

  const settingIs = (on: boolean) => vi.mocked(getSettingResultAsService).mockImplementation(async (key) =>
    key === 'balance_roll_forward_resident_enabled' ? { status: 'ok', value: on } : { status: 'absent' });

  const BALANCE = { opening_balance: 0, closing_balance: -2500, total_invoiced: 0, total_paid: 0, total_wallet_credits: 0, total_wallet_debits: 0, awaiting_verification: 300 };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T23:30:00Z')); // 21 Oct 00:30 in Lagos
  });
  afterEach(() => vi.useRealTimers());

  it('keeps the allocation figures, and never reads the balance function, while the setting is off', async () => {
    settingIs(false);
    const { rpc } = mockOwedClient(BALANCE);

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(owed).toMatchObject({ outstanding: 6000, awaitingVerification: 700, invoiceCount: 3 });
    expect(owed).not.toHaveProperty('rollForward');
    expect(owed.overdue).toEqual({ total: 6000, count: 1, oldestDue: '2026-01-01', charges: [{ label: 'Charge', amount: 6000 }] });
    expect(rpc).not.toHaveBeenCalled();
  });

  it('switches Outstanding and Awaiting verification to the shared balance as of today in Lagos when the setting is on', async () => {
    settingIs(true);
    const { rpc } = mockOwedClient(BALANCE);

    const owed = await createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1');

    expect(rpc).toHaveBeenCalledWith('resident_account_balance', { p_resident_id: 'resident-1', p_house_id: 'house-1', p_from: '2026-10-21', p_to: '2026-10-21' });
    expect(owed).toMatchObject({ outstanding: -2500, awaitingVerification: 300, rollForward: true });
    // Overdue and next due stay allocation-based.
    expect(owed.overdue).toEqual({ total: 6000, count: 1, oldestDue: '2026-01-01', charges: [{ label: 'Charge', amount: 6000 }] });
  });

  it('treats an unreadable setting as off', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'error', message: 'connection reset' });
    const { rpc } = mockOwedClient(BALANCE);

    await expect(createSupabaseWhatsAppFinancialRepository().getOwed('resident-1', 'house-1')).resolves.not.toHaveProperty('rollForward');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('signs the roll-forward balance: owed, in credit, or Nil, never floored at zero', () => {
    const base: OwedFigures = { invoiceCount: 0, outstanding: 0, rollForward: true, overdue: null, next: null, awaitingVerification: 0 };
    expect(composeOweAnswer({ ...base, outstanding: -60000 }, '12 Palm Close', true)).toBe(
      ['*What you owe, 12 Palm Close*', 'Outstanding: ₦60,000.00 in credit'].join('\n'));
    expect(composeOweAnswer({ ...base, outstanding: 0, invoiceCount: 2 }, '12 Palm Close', true)).toBe(
      ['*What you owe, 12 Palm Close*', 'Outstanding: Nil'].join('\n'));
    expect(composeOweAnswer({ ...base, outstanding: 1250.5, invoiceCount: 1, awaitingVerification: 300 }, '12 Palm Close', true)).toBe(
      ['*What you owe, 12 Palm Close*', 'Outstanding: ₦1,250.50 owed', 'Awaiting verification: ₦300.00', 'Reply PAY for how to pay'].join('\n'));
  });
});

describe('statement periods without a duplicate (#1069)', () => {
  it('offers All time only with earlier activity, and Since move-in only with a move-in date', () => {
    expect(offeredPeriods(true, true)).toEqual(['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'all_time', 'since_move_in']);
    expect(offeredPeriods(true, false)).toEqual(['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'since_move_in']);
    expect(offeredPeriods(false, false)).toEqual(['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'all_time']);
    expect(offeredPeriods(false, true)).toEqual(offeredPeriods(false, false));
  });

  const NO_EARLIER = ['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'since_move_in'] as const;
  const NO_MOVE_IN = ['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'all_time'] as const;
  const withPeriods = (periods: readonly string[]) => repository([PALM], { getStatementPeriods: vi.fn().mockResolvedValue(periods) });

  it('lists five items with Since move-in as 5 when nothing predates the move-in', async () => {
    const replies = await chat(withPeriods(NO_EARLIER), ['statement']);
    expect(replies[0]).toBe(['Which period?', '1. This month', '2. This year', '3. Last 6 months', '4. Last 12 months', '5. Since move-in', 'Reply with the period number.'].join('\n'));
  });

  it('lists All time and no Since move-in when there is no move-in date', async () => {
    const replies = await chat(withPeriods(NO_MOVE_IN), ['statement']);
    expect(replies[0]).toBe(['Which period?', '1. This month', '2. This year', '3. Last 6 months', '4. Last 12 months', '5. All time', 'Reply with the period number.'].join('\n'));
  });

  it('reads 5 against the list the resident saw, and 6 is then unrecognised', async () => {
    const repo = withPeriods(NO_EARLIER);
    await chat(repo, ['statement', '5']);
    expect(repo.loadStatement).toHaveBeenCalledWith('resident-1', 'house-1', 'since_move_in', expect.any(Date));
    const other = withPeriods(NO_EARLIER);
    const replies = await chat(other, ['statement', '6']);
    expect(other.loadStatement).not.toHaveBeenCalled();
    expect(replies[1]).toMatch(/^I didn't catch that/);
  });

  it('gives Since move-in for a typed "all time" while All time is hidden, and All time when offered', async () => {
    const hidden = withPeriods(NO_EARLIER);
    await chat(hidden, ['statement', 'All Time']);
    expect(hidden.loadStatement).toHaveBeenCalledWith('resident-1', 'house-1', 'since_move_in', expect.any(Date));
    const shown = repository();
    await chat(shown, ['statement', 'all time']);
    expect(shown.loadStatement).toHaveBeenCalledWith('resident-1', 'house-1', 'all_time', expect.any(Date));
  });
});

describe('ending the session with an exit word (#1069)', () => {
  const stored = (currentNode: string, over: Partial<WhatsAppFinancialSession> = {}): WhatsAppFinancialSession => ({
    phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode, selectedHouseId: 'house-1', pinAuthenticated: true,
    expiresAt: new Date(Date.now() + 600_000).toISOString(), draft: { houseId: 'house-1', amount: 5000 }, ...over,
  });
  const THANKS = 'Thank you for using Palm Estate Assistant. Your session has ended. Your PIN is locked. Send HI at any time to start again.';

  it.each(['exit', 'end', 'close', 'bye', 'goodbye', 'quit', ' QUIT ', 'Goodbye'])('%s ends an unlocked session in the main menu', async (word) => {
    const repo = repository();
    repo.setStoredSession(stored('main'));
    const replies = await chat(repo, [word]);
    expect(replies).toEqual([THANKS]);
    const saved = vi.mocked(repo.saveSession).mock.calls.at(-1)![0];
    expect(saved).toMatchObject({ pinAuthenticated: false, draft: null });
    expect(Date.parse(saved.expiresAt)).toBeLessThanOrEqual(Date.now());
  });

  it('names the Assistant from the repository when the session ends', async () => {
    const repo = repository([PALM], { getAssistantName: vi.fn().mockResolvedValue('Ada') });
    repo.setStoredSession(stored('main'));
    const replies = await chat(repo, ['bye']);
    expect(replies).toEqual([THANKS.replace('Palm Estate Assistant', 'Ada')]);
  });

  it('ends a session inside the free-text report reference step and drops the draft', async () => {
    const repo = repository();
    repo.setStoredSession(stored('report_reference'));
    const replies = await chat(repo, ['bye']);
    expect(replies).toEqual([THANKS]);
    expect(repo.createPaymentReport).not.toHaveBeenCalled();
    expect(vi.mocked(repo.saveSession).mock.calls.at(-1)![0].draft).toBeNull();
  });

  it('ends a session at the email address step without starting an email change', async () => {
    const repo = repository();
    const replies = await chat(repo, ['email', 'exit']);
    expect(replies.at(-1)).toBe(THANKS.replace(' Your PIN is locked.', ''));
    expect(repo.startEmailChange).not.toHaveBeenCalled();
  });

  it('leaves out the PIN line when the PIN was locked already', async () => {
    const repo = repository();
    repo.setStoredSession(stored('main', { pinAuthenticated: false }));
    expect((await chat(repo, ['end']))[0]).not.toContain('PIN');
  });

  it.each(['hi', '1', 'statement'])('shows the main menu when %s follows, without the 15-minute note', async (next) => {
    const repo = repository();
    repo.setStoredSession(stored('main'));
    const replies = await chat(repo, ['quit', next]);
    expect(replies[1]).toBe(MAIN_MENU);
    expect(replies[1]).not.toContain('15 minutes');
  });

  it('still tells a resident whose session timed out about the 15 minutes', async () => {
    const repo = repository();
    repo.setStoredSession(stored('main', { expiresAt: new Date(Date.now() - 1000).toISOString() }));
    expect((await chat(repo, ['hi']))[0]).toMatch(/^Your session ended after 15 minutes/);
  });

  it('does not read a word inside a longer message as an exit', async () => {
    const repo = repository();
    repo.setStoredSession(stored('main'));
    expect((await chat(repo, ['please end it']))[0]).not.toContain('session has ended');
  });
});

describe('WhatsApp Assistant several houses (#1073)', () => {
  const LANDLORD_CEDAR: FinancialHouse = { ...CEDAR, role: 'non_resident_landlord' };
  const figures = (outstanding: number, awaitingVerification = 0): OwedFigures => ({ invoiceCount: 1, outstanding, overdue: null, next: null, awaitingVerification });

  function twoHouseRepo(overrides: Partial<WhatsAppFinancialRepository> = {}) {
    return repository([PALM, CEDAR], {
      getOwed: vi.fn(async (_resident: string, house: string) => (house === 'house-1' ? figures(50000) : figures(0))),
      ...overrides,
    });
  }

  it('offers All my properties last, only to a person with more than one house', async () => {
    expect((await chat(twoHouseRepo(), ['owe']))[0]).toBe(['Which property?', '1. 12 Palm Close', '2. 4 Cedar Way', '3. All my properties', 'Reply with the property number.'].join('\n'));
    expect((await chat(repository([PALM]), ['owe']))[0]).toContain('*What you owe, 12 Palm Close*');
    expect((await chat(twoHouseRepo(), ['payments']))[0]).not.toContain('All my properties');
  });

  it('lists each house with what is outstanding, then the total', async () => {
    const repo = twoHouseRepo({ getOwed: vi.fn(async (_resident: string, house: string) => (house === 'house-1' ? figures(50000, 1000) : figures(25000, 500))) });
    const replies = await chat(repo, ['owe', '3']);

    expect(replies[1]).toBe(['*What you owe, all your properties*', '12 Palm Close: ₦50,000.00', '4 Cedar Way: ₦25,000.00', 'Total: ₦75,000.00', 'Awaiting verification: ₦1,500.00', 'Reply PAY for how to pay', '', ALL_PROPERTIES_MENU].join('\n'));
    expect(repo.getOwed).toHaveBeenCalledWith('resident-1', 'house-1');
    expect(repo.getOwed).toHaveBeenCalledWith('resident-1', 'house-2');
  });

  it('shows Nil for a paid-up house and no PAY line when nothing is owed', async () => {
    const replies = await chat(twoHouseRepo({ getOwed: vi.fn().mockResolvedValue(figures(0)) }), ['owe', '3']);
    expect(replies[1]).toBe(['*What you owe, all your properties*', '12 Palm Close: Nil', '4 Cedar Way: Nil', 'Total: Nil', '', ALL_PROPERTIES_MENU].join('\n'));
  });

  it('totals only what is owed, so a credit on one house never hides a debt on another', async () => {
    const rolled = (outstanding: number): OwedFigures => ({ ...figures(outstanding), rollForward: true });
    const repo = twoHouseRepo({ getOwed: vi.fn(async (_resident: string, house: string) => (house === 'house-1' ? rolled(50000) : rolled(-60000))) });
    const replies = await chat(repo, ['owe', '3']);

    expect(replies[1]).toBe(['*What you owe, all your properties*', '12 Palm Close: ₦50,000.00 owed', '4 Cedar Way: ₦60,000.00 in credit', 'Total: ₦50,000.00 owed', 'Reply PAY for how to pay', '', ALL_PROPERTIES_MENU].join('\n'));
  });

  it('counts one summary as one lookup and writes one disclosure row', async () => {
    const repo = twoHouseRepo();
    const canLookup = vi.fn().mockResolvedValue('ok');
    await chat(repo, ['owe', '3'], identity, { canLookup });

    expect(canLookup).toHaveBeenCalledTimes(1);
    expect(repo.logDisclosure).toHaveBeenCalledTimes(1);
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ houseId: null, menuItem: 'what_i_owe', metadata: { scope: 'all_properties', houses: 2 } }));
  });

  it('asks for the PIN when the gate was turned on after the property prompt', async () => {
    const repo = twoHouseRepo();
    await chat(repo, ['owe']);
    vi.mocked(repo.getForcePin).mockResolvedValue(true);
    const replies = await chat(repo, ['3']);

    expect(replies[0]).toContain('A security PIN is required before viewing financial standing.');
    expect(repo.getOwed).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('shows the cap reply, and looks nothing up, when the day is used up', async () => {
    const repo = twoHouseRepo();
    const replies = await chat(repo, ['owe', '3'], identity, { canLookup: vi.fn().mockResolvedValue('resident_cap') });
    expect(replies[1]).toContain("You've reached today's limit");
    expect(repo.getOwed).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('labels the wallet as covering every property only when there are several', async () => {
    expect(composeWalletAnswer(15000, true)).toBe(['*Wallet (all your properties)*', 'Balance: ₦15,000.00'].join('\n'));
    expect(composeWalletAnswer(15000)).toBe(['*Wallet*', 'Balance: ₦15,000.00'].join('\n'));
    expect((await chat(twoHouseRepo(), ['wallet', '1']))[1]).toContain('*Wallet (all your properties)*');
    expect((await chat(repository([PALM]), ['wallet']))[0]).toContain('*Wallet*\n');
  });

  it('names the charge on each line from the invoice type and billing profile', () => {
    expect(chargeLabel({ invoice_type: 'SERVICE_CHARGE', profileName: 'Security dues', periodStart: '2026-10-01' })).toBe('Security dues, OCT 2026');
    expect(chargeLabel({ invoice_type: 'LEVY', profileName: 'Development levy', periodStart: '2026-10-01' })).toBe('Development levy');
    expect(chargeLabel({ invoice_type: 'LEVY', profileName: null, periodStart: null })).toBe('Levy');
    expect(chargeLabel({ invoice_type: 'SERVICE_CHARGE', profileName: null, periodStart: '2026-01-01' })).toBe('Service charge, JAN 2026');
  });

  it('names the charge on the Next due line of a roll-forward balance too', () => {
    const body = composeOweAnswer({ ...OWED, rollForward: true }, '12 Palm Close', false);
    expect(body).toContain('- Security dues, AUG 2026: ₦50,000.00');
    expect(body).toContain('Next due: ₦50,000.00 on 1 Nov 2026, Security dues, NOV 2026 (invoice INV-2026-0412)');
  });

  it('lists at most five overdue charges and counts the rest', () => {
    const charges = Array.from({ length: 7 }, (_, index) => ({ label: `Security dues, ${index + 1}`, amount: 1000 }));
    const body = composeOweAnswer({ ...OWED, overdue: { total: 7000, count: 7, oldestDue: '2026-08-01', charges } }, '12 Palm Close', false);
    expect(body.split('\n').filter((line) => line.startsWith('- '))).toHaveLength(6);
    expect(body).toContain('- and 2 more');
  });

  it('offers clearance only to a tenant or resident landlord, for the house they live in', async () => {
    for (const role of ['tenant', 'resident_landlord']) {
      const replies = await chat(repository([{ ...PALM, role }]), ['clearance']);
      expect(replies[0]).toContain('*Clearance certificate, 12 Palm Close*');
    }
    for (const role of ['non_resident_landlord', 'developer']) {
      const repo = repository([{ ...PALM, role }]);
      const replies = await chat(repo, ['clearance']);
      expect(replies[0]).toBe(`A clearance certificate can only be requested for the property you live in.\n\n${FINANCIAL_MENU.replace('8. Link a co-resident\n', '').replace('7. Clearance certificate\n', '')}`);
      expect(repo.requestClearance).not.toHaveBeenCalled();
      expect(repo.logDisclosure).not.toHaveBeenCalled();
    }
  });

  it('hides the clearance item from the menu of a house the person does not live in', async () => {
    const repo = repository([PALM, LANDLORD_CEDAR]);
    const replies = await chat(repo, ['payments', '2', '0', '10', '1']);
    expect(replies[2]).not.toContain('7. Clearance certificate');
    expect(replies[2]).toContain('Financial standing: 4 Cedar Way');
    expect(replies[4]).toContain('Financial standing: 12 Palm Close');
    expect(replies[4]).toContain('7. Clearance certificate');
  });

  it('keeps the billable role on each house from the roster', async () => {
    const eq = vi.fn().mockReturnThis();
    const chain = { select: vi.fn().mockReturnThis(), eq, not: vi.fn().mockResolvedValue({ data: [], error: null }), in: vi.fn().mockResolvedValue({ data: [{ house_id: 'house-9', resident_role: 'developer', house: { house_number: '9', short_name: null, street: { name: 'Elm' } } }], error: null }) };
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createAdminClient>);
    await expect(createSupabaseWhatsAppFinancialRepository().getBillableHouses('resident-1')).resolves.toEqual([{ id: 'house-9', label: '9, Elm', role: 'developer' }]);
  });
});
