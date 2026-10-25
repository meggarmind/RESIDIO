import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSupabaseWhatsAppFinancialRepository,
  handleFinancialMessage,
  hashPin,
  isWeakPin,
  verifyPin,
} from '@/lib/whatsapp/financial';
import type {
  LookupAllowance,
  PinAttemptClaim,
  SetupCodeClaim,
  WhatsAppFinancialRepository,
  WhatsAppFinancialSession,
} from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import { isWhatsAppMasterSwitchOn } from '@/lib/whatsapp/master-switch';
import { createAdminClient } from '@/lib/supabase/server';

/** #892: the bot-side PIN flow (slice C of #805), on the #804 Assistant. */

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/whatsapp/master-switch', () => ({ isWhatsAppMasterSwitchOn: vi.fn() }));
vi.mock('@/lib/whatsapp/rollout', () => ({ isWhatsAppRecipientAllowed: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/settings/service', () => ({ getSettingResultAsService: vi.fn(), getRawSettingsAsService: vi.fn() }));

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

const CONTACT = 'Contact the estate office on 0803 699 6725.';
const FOOTER = 'Reply 0 for menu or 9 to contact the estate office.';
const CODE = '614205';
const NEW_PIN = '5307';
const CURRENT_PIN = '829104';
const FINANCIAL_MENU = /\n\nFinancial standing\n1\. What I owe\n2\. Recent payments\n3\. Statement\n4\. Wallet\n/;
const PIN_SET = 'Your PIN is set ✅ Your financial standing is unlocked for 15 minutes. For privacy, you can delete the messages with your PIN from this chat.';
const PIN_VERIFIED = 'PIN verified. Your financial standing is unlocked for 15 minutes.';
const VERIFY_PROMPT = 'Enter your 4–6 digit PIN to view your financial standing (e.g. 4821).';
const SETUP_CODE_PROMPT = 'Enter the 6-digit setup code from the estate office.';
const NOTHING_CHANGED = /^Nothing was changed\.\n\nHi Ada, what would you like to do\?/;

let sequence = 0;
function message(text: string): WhatsAppInboundMessage {
  sequence += 1;
  return { id: `wamid-${sequence}`, from: '2348000000000', timestamp: '1760000000', type: 'text', text };
}

/** A repository that keeps the session and PIN hash between messages, like the database does. */
function statefulRepository(initialPinHash: string | null = null, allowance: LookupAllowance = 'ok') {
  const state: { session: WhatsAppFinancialSession | null; pinHash: string | null } = { session: null, pinHash: initialPinHash };
  const repo: WhatsAppFinancialRepository = {
    getSession: vi.fn(async () => (state.session ? { ...state.session } : null)),
    saveSession: vi.fn(async (session: WhatsAppFinancialSession) => {
      state.session = { ...session };
    }),
    getForcePin: vi.fn().mockResolvedValue(true),
    getPinHash: vi.fn(async () => state.pinHash),
    setPinHash: vi.fn(async (_residentId: string, hash: string, expected: string | null) => {
      if (state.pinHash !== expected) return false;
      state.pinHash = hash;
      return true;
    }),
    claimSetupCode: vi.fn(async (_residentId: string, code: string): Promise<SetupCodeClaim> =>
      code === CODE ? { status: 'accepted' } : { status: 'wrong', triesLeft: 2 }),
    sendPinAlert: vi.fn().mockResolvedValue(undefined),
    claimPinAttempt: vi.fn(async (): Promise<PinAttemptClaim> => ({
      status: 'counted', triesInARow: 1, triesInWindow: 1, lockedUntil: null, hardLocked: false, claimedAt: '2026-10-20T09:30:00Z',
    })),
    clearPinAttempts: vi.fn().mockResolvedValue(undefined),
    getBillableHouses: vi.fn().mockResolvedValue([{ id: 'house-1', label: '12 Palm Close', role: 'tenant' }]),
    getAssistantSettings: vi.fn().mockResolvedValue({
      estatePhone: '0803 699 6725', estateEmail: null, officeHours: null, paymentInstructions: 'Pay into Palm Estate.', keywordSynonyms: {},
    }),
    getLatestAnnouncements: vi.fn().mockResolvedValue([{ title: 'Water', summary: 'Water off Tuesday', content: 'Water off Tuesday', publishedAt: null }]),
    getOwed: vi.fn().mockResolvedValue({ invoiceCount: 1, outstanding: 10000, overdue: null, next: null, awaitingVerification: 0 }),
    getRecentPayments: vi.fn().mockResolvedValue([]),
    getWalletBalance: vi.fn().mockResolvedValue(0),
    setAlertsOn: vi.fn().mockResolvedValue(undefined),
    getRemindersOn: vi.fn().mockResolvedValue(true),
    setRemindersOn: vi.fn().mockResolvedValue(undefined),
    startEmailChange: vi.fn(),
    confirmEmailChange: vi.fn(),
    createPaymentReport: vi.fn(),
    getReceiptPayments: vi.fn().mockResolvedValue([]),
    loadReceipt: vi.fn().mockResolvedValue(null),
    storeReceiptPdf: vi.fn(),
    requestClearance: vi.fn(),
    getCoResidents: vi.fn().mockResolvedValue([]),
    hasLinkedCoResident: vi.fn().mockResolvedValue(false),
    createCoResidentLinkCode: vi.fn().mockResolvedValue(null),
    getStatementPeriods: vi.fn().mockResolvedValue(['this_month', 'this_year', 'last_six_months', 'last_twelve_months', 'all_time', 'since_move_in']),
    getEstateName: vi.fn().mockResolvedValue('Palm Estate'),
    loadStatement: vi.fn(),
    storeStatementPdf: vi.fn(),
    getResidentEmail: vi.fn().mockResolvedValue(null),
    createStatementRequest: vi.fn(),
    queueStatementEmail: vi.fn(),
    logDisclosure: vi.fn().mockResolvedValue(undefined),
    askSurvey: vi.fn().mockResolvedValue(null),
    answerSurvey: vi.fn().mockResolvedValue(undefined),
  };
  const send = vi.fn().mockResolvedValue({ success: true });
  const say = async (text: string) => {
    send.mockClear();
    await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send, canLookup: async () => allowance });
    // A final answer is followed by the menu as its own message (#1179); a prompt is one message.
    expect(send.mock.calls.length).toBeGreaterThanOrEqual(1);
    return send.mock.calls.map((call) => call[0].body as string).join('\n\n');
  };
  const node = () => state.session?.currentNode;
  return { repo, state, send, say, node };
}

beforeEach(() => {
  vi.mocked(isWhatsAppMasterSwitchOn).mockResolvedValue({ on: true });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('first PIN with a setup code (#892)', () => {
  it.each(['PIN', 'pin', 'Set a security PIN', 'Change PIN', 'PIN 5307'])('"%s" asks for the setup code when no PIN exists', async (command) => {
    const { say, node, repo } = statefulRepository();
    expect(await say(command)).toBe(SETUP_CODE_PROMPT);
    expect(node()).toBe('pin_setup_code');
    expect(repo.setPinHash).not.toHaveBeenCalled();
  });

  it('sets the PIN after a valid code, a strong PIN and a matching confirmation, then unlocks', async () => {
    const { say, state, repo, node } = statefulRepository();
    await say('PIN');

    expect(await say(CODE)).toBe('Choose a 4–6 digit PIN.');
    expect(repo.claimSetupCode).toHaveBeenCalledWith('resident-1', CODE);

    expect(await say(NEW_PIN)).toBe('Enter the same PIN again to confirm.');
    // Only a salted hash of the chosen PIN is kept between the two messages.
    expect(state.session?.pendingPinHash).toMatch(/^scrypt:/);
    expect(verifyPin(NEW_PIN, state.session!.pendingPinHash!)).toBe(true);
    expect(state.pinHash).toBeNull();

    const done = await say(NEW_PIN);
    expect(done.startsWith(`${PIN_SET}\n\nFinancial standing`)).toBe(true);
    expect(done).toMatch(FINANCIAL_MENU);
    expect(repo.setPinHash).toHaveBeenCalledWith('resident-1', expect.stringMatching(/^scrypt:/), null);
    expect(verifyPin(NEW_PIN, state.pinHash!)).toBe(true);
    expect(state.session).toMatchObject({ currentNode: 'financial', pinAuthenticated: true, pendingPinHash: null });
    expect(repo.sendPinAlert).toHaveBeenCalledWith('resident-1', 'set', '+2348000000000');

    // Unlocked: the next financial item is answered without asking again.
    expect(await say('1')).toMatch(/^\*What you owe, 12 Palm Close\*/);
    expect(node()).toBe('answer');
  });

  it('never shows an example PIN at setup', async () => {
    const { say } = statefulRepository();
    for (const reply of [await say('PIN'), await say(CODE), await say(NEW_PIN)]) {
      expect(reply).not.toMatch(/e\.g\.|\d{4}/);
    }
  });

  it('re-asks for the code on a wrong-length reply without checking it', async () => {
    const { say, repo } = statefulRepository();
    await say('PIN');
    expect(await say('12345')).toBe(SETUP_CODE_PROMPT);
    expect(repo.claimSetupCode).not.toHaveBeenCalled();
    expect(repo.setPinHash).not.toHaveBeenCalled();
  });

  it('reports the tries left on a wrong code and stays in the code step', async () => {
    const { say, node } = statefulRepository();
    await say('PIN');
    expect(await say('000111')).toBe("That setup code isn't correct. You have 2 tries left.");
    expect(node()).toBe('pin_setup_code');
  });

  it('says one try is left', async () => {
    const { say, repo } = statefulRepository();
    vi.mocked(repo.claimSetupCode).mockResolvedValue({ status: 'wrong', triesLeft: 1 });
    await say('PIN');
    expect(await say('000111')).toBe("That setup code isn't correct. You have 1 try left.");
  });

  it('pauses after the third wrong code, naming the Lagos time and the estate office', async () => {
    const { say, node, repo } = statefulRepository();
    vi.mocked(repo.claimSetupCode).mockResolvedValue({ status: 'paused', pausedUntil: '2026-10-20T10:45:00.000Z' });
    await say('PIN');
    expect(await say('000111')).toBe(
      `Too many wrong setup codes. Nothing was changed. Try again after 11:45, or ask the estate office for a new code.\n${CONTACT}\n${FOOTER}`
    );
    expect(node()).toBe('main');
  });

  it('refuses an expired, used or missing code and leaves the step', async () => {
    const { say, node, repo } = statefulRepository();
    vi.mocked(repo.claimSetupCode).mockResolvedValue({ status: 'none' });
    await say('PIN');
    expect(await say(CODE)).toBe(
      `That setup code is invalid or expired. Nothing was changed. Ask the estate office for a new code.\n${CONTACT}\n${FOOTER}`
    );
    expect(node()).toBe('main');
    // A choose-PIN step cannot be reached without a code.
    expect(await say(NEW_PIN)).not.toContain('confirm');
    expect(repo.setPinHash).not.toHaveBeenCalled();
  });

  it.each(['0000', '1111', '999999', '1234', '4321', '123456', '654321', '7890', '1212', '121212', '123123', '2580', '0852', '1122'])(
    'refuses the weak PIN %s and keeps asking',
    async (pin) => {
      const { say, state } = statefulRepository();
      await say('PIN');
      await say(CODE);
      expect(await say(pin)).toBe('That PIN is too easy to guess. Please choose another 4–6 digit PIN.');
      expect(state.session).toMatchObject({ currentNode: 'pin_setup_new', pendingPinHash: null });
    }
  );

  it.each(['5307', '4821', '829104', '19370'])('accepts %s as strong enough', (pin) => {
    expect(isWeakPin(pin)).toBe(false);
  });

  it('cancels with "Nothing was changed." after three mismatched confirmations', async () => {
    const { say, state, repo } = statefulRepository();
    await say('PIN');
    await say(CODE);
    await say(NEW_PIN);
    expect(await say('5308')).toBe("That PIN doesn't match. Enter the same PIN again to confirm.");
    expect(await say('5309')).toBe("That PIN doesn't match. Enter the same PIN again to confirm.");
    expect(await say('5310')).toMatch(NOTHING_CHANGED);
    expect(repo.setPinHash).not.toHaveBeenCalled();
    expect(state.session).toMatchObject({ currentNode: 'main', pendingPinHash: null, pinAuthenticated: false });
    expect(repo.sendPinAlert).not.toHaveBeenCalled();
  });

  it('accepts the confirmation after one mismatch', async () => {
    const { say, state } = statefulRepository();
    await say('PIN');
    await say(CODE);
    await say(NEW_PIN);
    await say('5308');
    expect((await say(NEW_PIN)).startsWith(PIN_SET)).toBe(true);
    expect(verifyPin(NEW_PIN, state.pinHash!)).toBe(true);
  });

  it('changes nothing when a PIN appeared meanwhile (compare-and-set)', async () => {
    const { say, state, repo } = statefulRepository();
    await say('PIN');
    await say(CODE);
    await say(NEW_PIN);
    state.pinHash = hashPin(CURRENT_PIN);
    expect(await say(NEW_PIN)).toMatch(NOTHING_CHANGED);
    expect(verifyPin(CURRENT_PIN, state.pinHash!)).toBe(true);
    expect(state.session?.pinAuthenticated).toBe(false);
    expect(repo.sendPinAlert).not.toHaveBeenCalled();
  });

  it('still confirms the PIN when the alert email fails', async () => {
    const { say, repo } = statefulRepository();
    vi.mocked(repo.sendPinAlert).mockRejectedValue(new Error('Resend down'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await say('PIN');
    await say(CODE);
    await say(NEW_PIN);
    expect((await say(NEW_PIN)).startsWith(PIN_SET)).toBe(true);
  });

  it.each([['cancel', /^Cancelled\. Nothing was changed\./], ['menu', /^Hi Ada/], ['0', /^Hi Ada/]])(
    'leaves the step on "%s", dropping the pending PIN',
    async (text, reply) => {
      const { say, state, repo } = statefulRepository();
      await say('PIN');
      await say(CODE);
      await say(NEW_PIN);
      expect(await say(text)).toMatch(reply);
      expect(state.session).toMatchObject({ currentNode: 'main', pendingPinHash: null });
      // The PIN typed next is no confirmation.
      await say(NEW_PIN);
      expect(repo.setPinHash).not.toHaveBeenCalled();
    }
  );
});

describe('changing a PIN (#892)', () => {
  it('asks for the current PIN, then a new one, and sets it only over the current hash', async () => {
    const current = hashPin(CURRENT_PIN);
    const { say, state, repo } = statefulRepository(current);

    expect(await say('Change PIN')).toBe('Enter your current PIN.');
    expect(await say(CURRENT_PIN)).toBe('Choose a new 4–6 digit PIN.');
    expect(repo.claimPinAttempt).toHaveBeenCalledTimes(1);
    expect(repo.claimSetupCode).not.toHaveBeenCalled();
    expect(await say(NEW_PIN)).toBe('Enter the same PIN again to confirm.');
    expect((await say(NEW_PIN)).startsWith(PIN_SET)).toBe(true);

    expect(repo.setPinHash).toHaveBeenCalledWith('resident-1', expect.stringMatching(/^scrypt:/), current);
    expect(verifyPin(NEW_PIN, state.pinHash!)).toBe(true);
    expect(repo.sendPinAlert).toHaveBeenCalledWith('resident-1', 'change', '+2348000000000');
  });

  it('"Set a security PIN" with a PIN already set is a change, not a setup', async () => {
    const { say } = statefulRepository(hashPin(CURRENT_PIN));
    expect(await say('Set a security PIN')).toBe('Enter your current PIN.');
  });

  it('counts a wrong current PIN toward the lock and stays in the step', async () => {
    const { say, state, repo } = statefulRepository(hashPin(CURRENT_PIN));
    await say('Change PIN');
    expect(await say('111999')).toBe(`That PIN isn't correct. You have 2 tries left before it locks for 15 minutes.\n${CONTACT}`);
    expect(repo.claimPinAttempt).toHaveBeenCalledWith('resident-1');
    expect(state.session).toMatchObject({ currentNode: 'pin_change_current', pinAuthenticated: false });
  });

  it('refuses even the correct current PIN while locked and leaves the step', async () => {
    const { say, state, repo } = statefulRepository(hashPin(CURRENT_PIN));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue({ status: 'hard_locked' });
    await say('Change PIN');
    expect(await say(CURRENT_PIN)).toBe(`Your PIN is locked after several wrong tries. The estate office needs to reset it.\n${CONTACT}`);
    expect(state.session).toMatchObject({ currentNode: 'main', pinAuthenticated: false });
    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
  });

  it('refuses a weak new PIN', async () => {
    const { say } = statefulRepository(hashPin(CURRENT_PIN));
    await say('Change PIN');
    await say(CURRENT_PIN);
    expect(await say('2580')).toBe('That PIN is too easy to guess. Please choose another 4–6 digit PIN.');
  });

  it('changes nothing when the PIN was reset during the change', async () => {
    const { say, state, repo } = statefulRepository(hashPin(CURRENT_PIN));
    await say('Change PIN');
    await say(CURRENT_PIN);
    await say(NEW_PIN);
    state.pinHash = null;
    expect(await say(NEW_PIN)).toMatch(NOTHING_CHANGED);
    expect(state.pinHash).toBeNull();
    expect(repo.setPinHash).not.toHaveBeenCalled();
  });
});

describe('verifying a PIN (#892)', () => {
  it('asks for the PIN when a financial item is chosen, with the example, then answers it in one message', async () => {
    const { say, state, repo, node } = statefulRepository(hashPin(CURRENT_PIN));

    expect(await say('owe')).toBe(`${VERIFY_PROMPT}\n${FOOTER}`);
    expect(node()).toBe('pin:what_i_owe');
    expect(repo.getOwed).not.toHaveBeenCalled();

    const reply = await say(CURRENT_PIN);
    expect(reply.startsWith(`${PIN_VERIFIED}\n\n*What you owe, 12 Palm Close*`)).toBe(true);
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'what_i_owe', pinAuthenticated: true }));
    expect(state.session).toMatchObject({ currentNode: 'answer', pinAuthenticated: true });
  });

  it('keeps the unlock when the picked item is refused by the daily cap', async () => {
    const { say, state } = statefulRepository(hashPin(CURRENT_PIN), 'resident_cap');
    await say('wallet');
    expect(await say(CURRENT_PIN)).toBe(
      `${PIN_VERIFIED}\n\nYou've reached today's limit of 20 financial lookups. It resets at midnight.\n${CONTACT}`
    );
    expect(state.session?.pinAuthenticated).toBe(true);
  });

  it('PIN alone asks for the PIN and a correct one shows the Financial standing menu', async () => {
    const { say } = statefulRepository(hashPin(CURRENT_PIN));
    expect(await say('PIN')).toBe(`${VERIFY_PROMPT}\n${FOOTER}`);
    const reply = await say(CURRENT_PIN);
    expect(reply.startsWith(PIN_VERIFIED)).toBe(true);
    expect(reply).toMatch(FINANCIAL_MENU);
  });

  it('keeps PIN nnnn working at any point', async () => {
    const { say, repo } = statefulRepository(hashPin(CURRENT_PIN));
    expect((await say(`PIN ${CURRENT_PIN}`)).startsWith(PIN_VERIFIED)).toBe(true);
    expect(repo.claimPinAttempt).toHaveBeenCalledTimes(1);
  });

  it('treats bare digits as a menu choice, not a PIN, when the bot did not ask for one', async () => {
    const { say, repo } = statefulRepository(hashPin('4821'));
    expect(await say('4821')).toBe("I didn't catch that. Reply with a number from the menu, or MENU to see it again.");
    expect(repo.claimPinAttempt).not.toHaveBeenCalled();
  });

  it('treats a one-digit reply in the PIN step as a menu choice', async () => {
    const { say, node, repo } = statefulRepository(hashPin(CURRENT_PIN));
    await say('owe');
    expect(await say('4')).toMatch(/^Alert settings/);
    expect(node()).toBe('alerts');
    expect(repo.claimPinAttempt).not.toHaveBeenCalled();
  });

  it('keeps asking after a wrong bare PIN, counting each try', async () => {
    const { say, node, repo } = statefulRepository(hashPin(CURRENT_PIN));
    await say('owe');
    expect(await say('111999')).toContain("That PIN isn't correct.");
    expect(node()).toBe('pin:what_i_owe');
    expect(await say(CURRENT_PIN)).toContain('*What you owe');
    expect(repo.claimPinAttempt).toHaveBeenCalledTimes(2);
  });

  it.each(['Hi', 'hello', 'menu', 'pay', 'contact', '9', 'notices'])('never asks for the PIN on "%s"', async (text) => {
    const { say, node, repo } = statefulRepository(hashPin(CURRENT_PIN));
    expect(await say(text)).not.toContain(VERIFY_PROMPT);
    expect(node()).not.toMatch(/^pin/);
    expect(repo.claimPinAttempt).not.toHaveBeenCalled();
  });

  it('sends a PIN-holder no set-a-PIN prompt, before or after unlocking', async () => {
    const { say } = statefulRepository(hashPin(CURRENT_PIN));
    const replies = [await say('hi'), await say('1'), await say(CURRENT_PIN), await say('1'), await say('0')];
    for (const reply of replies) expect(reply).not.toMatch(/to set (one|a security PIN)|reply PIN\b/i);
  });

  it('a resident without a PIN under force-PIN is told to reply PIN, without an example', async () => {
    const { say } = statefulRepository();
    expect(await say('owe')).toBe(`A security PIN is required before viewing financial standing. To set one, reply PIN.\n${FOOTER}`);
  });
});

describe('PIN and code text is never logged or echoed (#892)', () => {
  it('keeps the code and PINs out of every log line, reply and saved session', async () => {
    const logged: unknown[] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logged.push(...args);
      });
    }
    const { say, repo } = statefulRepository();
    vi.mocked(repo.sendPinAlert).mockRejectedValue(new Error('Resend down'));
    const replies: string[] = [];
    for (const text of ['PIN', '000111', CODE, '1234', NEW_PIN, '5308', NEW_PIN, '1', 'Change PIN', NEW_PIN, '7351', '7351']) {
      replies.push(await say(text));
    }

    const secrets = [CODE, '000111', NEW_PIN, '5308', '7351'];
    // A well-formed scrypt hash is random hex that can contain a 4-digit PIN by chance; anything else in the field stays checked.
    const saved = JSON.stringify(vi.mocked(repo.saveSession).mock.calls, (key, value) =>
      key === 'pendingPinHash' && typeof value === 'string' && /^scrypt:[0-9a-f]{32}:[0-9a-f]{64}$/.test(value) ? '<scrypt>' : value);
    const disclosures = JSON.stringify(vi.mocked(repo.logDisclosure).mock.calls);
    const logs = JSON.stringify(logged.map((entry) => (entry instanceof Error ? entry.message : entry)));
    for (const secret of secrets) {
      expect(replies.join('\n')).not.toContain(secret);
      expect(saved).not.toContain(secret);
      expect(disclosures).not.toContain(secret);
      expect(logs).not.toContain(secret);
    }
  });
});

describe('Supabase setup-code and PIN storage (#892)', () => {
  const NOW = new Date('2026-10-20T09:00:00.000Z');
  const tokenHash = createHash('sha256').update(CODE).digest('hex');

  type Result = { data?: unknown; error?: unknown };
  function query(result: Result = { data: null, error: null }) {
    const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
    for (const m of ['select', 'eq', 'is', 'gt', 'order', 'limit', 'update']) chain[m] = vi.fn().mockReturnValue(chain);
    chain.maybeSingle = vi.fn().mockResolvedValue(result);
    chain.then = vi.fn((resolve: (v: unknown) => unknown) => Promise.resolve(resolve(result)));
    return chain;
  }
  function clientWith(...queries: ReturnType<typeof query>[]) {
    const from = vi.fn();
    queries.forEach((q) => from.mockReturnValueOnce(q));
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);
    return from;
  }
  const token = (fields: Record<string, unknown> = {}) => ({ id: 'token-1', token_hash: tokenHash, failed_attempts: 0, paused_until: null, ...fields });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('looks only at the resident\'s live pin_setup code', async () => {
    const lookup = query({ data: null, error: null });
    clientWith(lookup);
    await expect(createSupabaseWhatsAppFinancialRepository().claimSetupCode('resident-1', CODE)).resolves.toEqual({ status: 'none' });
    expect(lookup.eq).toHaveBeenCalledWith('resident_id', 'resident-1');
    expect(lookup.eq).toHaveBeenCalledWith('purpose', 'pin_setup');
    expect(lookup.is).toHaveBeenCalledWith('used_at', null);
    expect(lookup.gt).toHaveBeenCalledWith('expires_at', NOW.toISOString());
  });

  it('refuses without counting while the code is paused', async () => {
    const pausedUntil = '2026-10-20T09:30:00.000Z';
    const from = clientWith(query({ data: token({ failed_attempts: 3, paused_until: pausedUntil }), error: null }));
    await expect(createSupabaseWhatsAppFinancialRepository().claimSetupCode('resident-1', CODE)).resolves.toEqual({ status: 'paused', pausedUntil });
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('counts a wrong try with a compare-and-set on the count before checking', async () => {
    const count = query({ data: [{ id: 'token-1' }], error: null });
    const from = clientWith(query({ data: token({ failed_attempts: 1 }), error: null }), count);
    await expect(createSupabaseWhatsAppFinancialRepository().claimSetupCode('resident-1', '000111')).resolves.toEqual({ status: 'wrong', triesLeft: 1 });
    expect(count.update).toHaveBeenCalledWith({ failed_attempts: 2, paused_until: null });
    expect(count.eq).toHaveBeenCalledWith('id', 'token-1');
    expect(count.eq).toHaveBeenCalledWith('failed_attempts', 1);
    expect(count.is).toHaveBeenCalledWith('used_at', null);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('pauses the code for an hour on the third wrong try', async () => {
    const count = query({ data: [{ id: 'token-1' }], error: null });
    clientWith(query({ data: token({ failed_attempts: 2 }), error: null }), count);
    const pausedUntil = '2026-10-20T10:00:00.000Z';
    await expect(createSupabaseWhatsAppFinancialRepository().claimSetupCode('resident-1', '000111')).resolves.toEqual({ status: 'paused', pausedUntil });
    expect(count.update).toHaveBeenCalledWith({ failed_attempts: 3, paused_until: pausedUntil });
  });

  it('refuses a try that loses the race to count, without checking the code', async () => {
    const from = clientWith(query({ data: token(), error: null }), query({ data: [], error: null }));
    await expect(createSupabaseWhatsAppFinancialRepository().claimSetupCode('resident-1', CODE)).resolves.toEqual({ status: 'none' });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('accepts the right code once, marking it used only if still unused', async () => {
    const use = query({ data: [{ id: 'token-1' }], error: null });
    clientWith(query({ data: token({ failed_attempts: 2 }), error: null }), query({ data: [{ id: 'token-1' }], error: null }), use);
    await expect(createSupabaseWhatsAppFinancialRepository().claimSetupCode('resident-1', CODE)).resolves.toEqual({ status: 'accepted' });
    expect(use.update).toHaveBeenCalledWith({ used_at: NOW.toISOString() });
    expect(use.is).toHaveBeenCalledWith('used_at', null);
  });

  it('refuses the right code when another request used it first (replay)', async () => {
    clientWith(query({ data: token(), error: null }), query({ data: [{ id: 'token-1' }], error: null }), query({ data: [], error: null }));
    await expect(createSupabaseWhatsAppFinancialRepository().claimSetupCode('resident-1', CODE)).resolves.toEqual({ status: 'none' });
  });

  it('stores a first PIN only where none exists, and a change only over the expected hash', async () => {
    const first = query({ data: [{ id: 'resident-1' }], error: null });
    const change = query({ data: [], error: null });
    clientWith(first, change);
    const repo = createSupabaseWhatsAppFinancialRepository();

    await expect(repo.setPinHash('resident-1', 'scrypt:new', null)).resolves.toBe(true);
    expect(first.is).toHaveBeenCalledWith('whatsapp_pin_hash', null);
    await expect(repo.setPinHash('resident-1', 'scrypt:new', 'scrypt:old')).resolves.toBe(false);
    expect(change.eq).toHaveBeenCalledWith('whatsapp_pin_hash', 'scrypt:old');
  });

  it('saves and reads the pending PIN hash with the session', async () => {
    const save = query();
    const read = query({
      data: {
        phone_number: '+2348000000000', resident_id: 'resident-1', current_node: 'pin_setup_confirm:0', selected_house_id: null,
        pin_authenticated: false, expires_at: '2026-10-20T09:15:00.000Z', pending_pin_hash: 'scrypt:pending',
      },
      error: null,
    });
    const upsert = vi.fn().mockReturnValue(save);
    const from = vi.fn().mockReturnValueOnce({ upsert }).mockReturnValueOnce(read);
    vi.mocked(createAdminClient).mockReturnValue({ from } as never);
    const repo = createSupabaseWhatsAppFinancialRepository();

    await repo.saveSession({
      phoneNumber: '+2348000000000', residentId: 'resident-1', currentNode: 'pin_setup_confirm:0', selectedHouseId: null,
      pinAuthenticated: false, expiresAt: '2026-10-20T09:15:00.000Z', pendingPinHash: 'scrypt:pending',
    });
    expect(upsert.mock.calls[0]![0]).toMatchObject({ pending_pin_hash: 'scrypt:pending', current_node: 'pin_setup_confirm:0' });
    await expect(repo.getSession('+2348000000000')).resolves.toMatchObject({ pendingPinHash: 'scrypt:pending' });
  });
});
