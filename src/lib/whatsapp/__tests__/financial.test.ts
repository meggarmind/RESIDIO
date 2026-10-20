import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  canPerformWhatsAppFinancialLookup,
  composeStatementAnswer,
  createSupabaseWhatsAppFinancialRepository,
  handleFinancialMessage,
  hashPin,
  verifyPin,
} from '@/lib/whatsapp/financial';
import type {
  FinancialAnswer,
  FinancialHouse,
  PinAttemptClaim,
  WhatsAppFinancialRepository,
} from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
import { getRawSettingsAsService, getSettingResultAsService } from '@/lib/settings/service';
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
  getRawSettingsAsService: vi.fn(),
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

const CLAIMED_AT = '2026-10-20T09:30:00.123456+00:00';
const CONTACT_LINE = 'Contact the estate office on 0803 699 6725 or office@example.test.';

function counted(fields: Partial<Extract<PinAttemptClaim, { status: 'counted' }>> = {}): PinAttemptClaim {
  return { status: 'counted', triesInARow: 1, triesInWindow: 1, lockedUntil: null, hardLocked: false, claimedAt: CLAIMED_AT, ...fields };
}

const answer: FinancialAnswer = { body: 'Outstanding balance: ₦10,000.00.' };

function message(text: string): WhatsAppInboundMessage {
  return { id: `wamid-${text}`, from: '2348000000000', timestamp: '1760000000', type: 'text', text };
}

function repository(houses: FinancialHouse[] = [{ id: 'house-1', label: 'OAK-1' }]): WhatsAppFinancialRepository {
  return {
    getSession: vi.fn().mockResolvedValue(null),
    saveSession: vi.fn().mockResolvedValue(undefined),
    getForcePin: vi.fn().mockResolvedValue(false),
    getPinHash: vi.fn().mockResolvedValue(null),
    setPinHash: vi.fn().mockResolvedValue(undefined),
    claimPinAttempt: vi.fn().mockResolvedValue(counted()),
    clearPinAttempts: vi.fn().mockResolvedValue(undefined),
    getEstateContactLine: vi.fn().mockResolvedValue(CONTACT_LINE),
    getBillableHouses: vi.fn().mockResolvedValue(houses),
    getBalance: vi.fn().mockResolvedValue(answer),
    getLastPayment: vi.fn().mockResolvedValue({ body: 'Last payment: ₦5,000.00.' }),
    getNextDue: vi.fn().mockResolvedValue({ body: 'Next due: ₦5,000.00.' }),
    getWallet: vi.fn().mockResolvedValue({ body: 'Wallet balance: ₦0.00.' }),
    getStatement: vi.fn().mockResolvedValue({ body: 'Statement (this month): no activity.' }),
    logDisclosure: vi.fn().mockResolvedValue(undefined),
  };
}

describe('WhatsApp financial menu', () => {
  it('answers balance for a single-property resident and logs disclosure', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(repo.getBalance).toHaveBeenCalledWith('resident-1', 'house-1');
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({
      residentId: 'resident-1',
      houseId: 'house-1',
      menuItem: 'balance',
      pinAuthenticated: false,
    }));
    expect(send.mock.calls[0]?.[0].body).toContain('Outstanding balance');
    expect(send.mock.calls[0]?.[0].idempotencySeed).toBe('wamid-1');
  });

  it('asks multi-property residents to choose a property before answering', async () => {
    const repo = repository([
      { id: 'house-1', label: 'OAK-1' },
      { id: 'house-2', label: 'OAK-2' },
    ]);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('1. OAK-1');
    expect(send.mock.calls[0]?.[0].body).toContain('2. OAK-2');
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ currentNode: 'property_selection:balance' }));
  });

  it('requires a configured PIN and accepts it before answering', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValueOnce('03ac674216f3e15c761ee1a5e255f067953623c8c0a0b7e6f3b1c5f5f6e6f6f7');
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('PIN');
  });

  it('enforces the estate-wide PIN setting for residents without a personal PIN', async () => {
    const repo = repository();
    vi.mocked(repo.getForcePin).mockResolvedValue(true);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('A security PIN is required');
    expect(send.mock.calls[0]?.[0].body).not.toContain('1234');
  });

  it('sets an optional PIN and marks the session authenticated', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 1234'), identity, { repository: repo, optedIn: true, send });

    expect(repo.setPinHash).toHaveBeenCalledWith('resident-1', expect.any(String));
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(send.mock.calls[0]?.[0].body).toContain('PIN set');
  });

  it('routes all four menu queries through authoritative readers', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    for (const command of ['1', '2', '3', '4']) {
      await handleFinancialMessage(message(command), identity, { repository: repo, optedIn: true, send });
    }

    expect(repo.getBalance).toHaveBeenCalled();
    expect(repo.getLastPayment).toHaveBeenCalled();
    expect(repo.getNextDue).toHaveBeenCalled();
    expect(repo.getWallet).toHaveBeenCalledWith('resident-1');
    expect(repo.logDisclosure).toHaveBeenCalledTimes(4);
  });

  it('rejects financial handling when consent is absent', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: false, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(repo.logDisclosure).not.toHaveBeenCalled();
  });

  it('blocks financial access when the resident is outside the active pilot', async () => {
    const { isWhatsAppRecipientAllowed } = await import('@/lib/whatsapp/rollout');
    vi.mocked(isWhatsAppRecipientAllowed).mockResolvedValueOnce(false);
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('not currently enabled');
  });

  it('stops financial readers when the daily lookup guard denies access', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, {
      repository: repo,
      optedIn: true,
      send,
      canLookup: vi.fn().mockResolvedValue(false),
    });

    expect(repo.getBalance).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('Daily financial lookup limit reached');
  });

  it('resets an expired session before processing a new query', async () => {
    const repo = repository();
    vi.mocked(repo.getSession).mockResolvedValue({
      phoneNumber: '+2348000000000',
      residentId: 'resident-1',
      currentNode: 'menu',
      selectedHouseId: 'house-1',
      pinAuthenticated: true,
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    });
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(send.mock.calls[0]?.[0].body).toContain('reply PIN followed by 4–6 digits of your choice');
    expect(send.mock.calls[0]?.[0].body).not.toContain('1234');
  });

  it('offers fixed statement periods and logs the selected property scope', async () => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('5'), identity, { repository: repo, optedIn: true, send });
    expect(send.mock.calls[0]?.[0].body).toContain('1. This month');
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ currentNode: 'statement_period:house-1' }));

    vi.mocked(repo.getSession).mockResolvedValue({
      phoneNumber: '+2348000000000',
      residentId: 'resident-1',
      currentNode: 'statement_period:house-1',
      selectedHouseId: 'house-1',
      pinAuthenticated: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await handleFinancialMessage(message('1'), identity, { repository: repo, optedIn: true, send });

    expect(repo.getStatement).toHaveBeenCalledWith('resident-1', 'house-1', 'this_month', ['house-1']);
    expect(repo.logDisclosure).toHaveBeenCalledWith(expect.objectContaining({ menuItem: 'statement', houseId: 'house-1' }));
  });

  it('offers all-properties statement scope to multi-property residents', async () => {
    const repo = repository([{ id: 'house-1', label: 'OAK-1' }, { id: 'house-2', label: 'OAK-2' }]);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('5'), identity, { repository: repo, optedIn: true, send });
    expect(send.mock.calls[0]?.[0].body).toContain('0. All properties');

    vi.mocked(repo.getSession).mockResolvedValue({
      phoneNumber: '+2348000000000',
      residentId: 'resident-1',
      currentNode: 'property_selection:statement',
      selectedHouseId: null,
      pinAuthenticated: false,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await handleFinancialMessage(message('0'), identity, { repository: repo, optedIn: true, send });

    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ currentNode: 'statement_period:all' }));
  });

  it('composes statement totals from payment records and caps older rows', () => {
    const invoices = Array.from({ length: 13 }, (_, index) => ({
      invoice_number: `INV-${index}`,
      amount_due: 100,
      amount_paid: 0,
      created_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    }));
    const answer = composeStatementAnswer({
      period: 'this_year',
      houseId: null,
      invoices,
      payments: [{ amount: 250, payment_date: '2026-01-20T00:00:00.000Z', reference_number: 'PAY-1' }],
    });

    expect(answer.body).toContain('Invoiced: ₦1,300.00 | Payments: ₦250.00');
    expect(answer.body).toContain('2 older row(s) omitted');
    expect(answer.metadata).toMatchObject({ house_id: null, row_count: 14, omitted: 2 });
  });
});

describe('WhatsApp financial lookup cap', () => {
  // #139: this setting gates how many financial disclosures may happen per
  // day, so a query error must deny the lookup rather than silently falling
  // back to the compiled-in default of 50 -- unlike a late-fee grace period,
  // "we couldn't check" here must not be treated the same as "unconfigured".
  it('denies a lookup when the daily cap read errors, rather than falling through to the default cap', async () => {
    vi.mocked(getSettingResultAsService).mockResolvedValue({ status: 'error', message: 'connection reset' });

    expect(await canPerformWhatsAppFinancialLookup()).toBe(false);
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
    expect(repo.logDisclosure).not.toHaveBeenCalled();
    for (const fn of Object.values(repo)) expect(fn).not.toHaveBeenCalled();
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
      menuItem: 'balance',
      pinAuthenticated: true,
      metadata: { period: 'this_month' },
    });

    expect(from).toHaveBeenCalledWith('whatsapp_disclosure_logs');
    expect(insert).toHaveBeenCalledWith({
      resident_id: 'resident-1',
      phone_number: '+2348000000000',
      house_id: 'house-1',
      menu_item: 'balance',
      pin_authenticated: true,
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
    ['a menu answer', ['1']],
    ['a statement', ['5', '1']],
  ])('logs %s before sending it, and sends nothing when the log fails', async (_label, texts) => {
    const repo = repository();
    const send = vi.fn().mockResolvedValue({ success: true });
    for (const text of texts.slice(0, -1)) {
      await handleFinancialMessage(message(text), identity, { repository: repo, optedIn: true, send });
      vi.mocked(repo.getSession).mockResolvedValue(vi.mocked(repo.saveSession).mock.lastCall![0]);
    }
    send.mockClear();
    vi.mocked(repo.logDisclosure).mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      handleFinancialMessage(message(texts.at(-1)!), identity, { repository: repo, optedIn: true, send })
    ).rejects.toThrow('insert failed');

    expect(repo.logDisclosure).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
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
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 482915'), identity, { repository: repo, optedIn: true, send });

    const stored = vi.mocked(repo.setPinHash).mock.calls[0]?.[1];
    expect(stored).toMatch(/^scrypt:/);
    expect(verifyPin('482915', stored!)).toBe(true);
    expect(repo.claimPinAttempt).not.toHaveBeenCalled();
  });

  it('counts the try before checking it and reports tries left in a row, with the contact line', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(counted({ triesInARow: 1, triesInWindow: 1 }));
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(repo.claimPinAttempt).toHaveBeenCalledWith('resident-1');
    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toBe(
      "That PIN isn't correct. You have 2 tries left before it locks for 15 minutes.\n" + CONTACT_LINE
    );
  });

  it('says one try is left on the second wrong PIN in a row', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(counted({ triesInARow: 2, triesInWindow: 2 }));
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(send.mock.calls[0]?.[0].body).toContain('You have 1 try left before it locks for 15 minutes.');
  });

  it('never states more tries than the 24-hour limit leaves', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(counted({ triesInARow: 1, triesInWindow: 5 }));
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(send.mock.calls[0]?.[0].body).toContain('You have 1 try left');
  });

  it('locks for 15 minutes on the third wrong PIN in a row and shows the Lagos time', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(
      counted({ triesInARow: 3, triesInWindow: 3, lockedUntil: '2026-10-20T09:45:00.000Z' })
    );
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toBe(
      'For security, your PIN is locked until 10:45. Nothing was shown.\n' + CONTACT_LINE
    );
  });

  it('refuses even the correct PIN inside the 15-minute lock', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue({ status: 'locked', lockedUntil: '2026-10-20T09:45:00.000Z' });
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 482915'), identity, { repository: repo, optedIn: true, send });

    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toBe(
      'For security, your PIN is locked until 10:45. Nothing was shown.\n' + CONTACT_LINE
    );
  });

  it('locks until the estate office resets it on the sixth wrong PIN in 24 hours', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(
      counted({ triesInARow: 3, triesInWindow: 6, lockedUntil: '2026-10-20T09:45:00.000Z', hardLocked: true })
    );
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toBe(
      'Your PIN is locked after several wrong tries. The estate office needs to reset it.\n' + CONTACT_LINE
    );
  });

  it('refuses even the correct PIN after the hard lock, however long ago it was set', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue({ status: 'hard_locked' });
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 482915'), identity, { repository: repo, optedIn: true, send });

    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('The estate office needs to reset it.');
  });

  it('leaves the contact line out when none is configured', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.getEstateContactLine).mockResolvedValue(null);
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(counted({ triesInARow: 1, triesInWindow: 1 }));
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(send.mock.calls[0]?.[0].body).toBe("That PIN isn't correct. You have 2 tries left before it locks for 15 minutes.");
  });

  it('clears the claimed try and authenticates on a correct PIN, keeping a salted hash as is', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(counted({ triesInARow: 2, triesInWindow: 5 }));
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 482915'), identity, { repository: repo, optedIn: true, send });

    expect(repo.clearPinAttempts).toHaveBeenCalledWith('resident-1', CLAIMED_AT);
    expect(repo.setPinHash).not.toHaveBeenCalled();
    expect(repo.saveSession).toHaveBeenCalledWith(expect.objectContaining({ pinAuthenticated: true }));
    expect(send.mock.calls[0]?.[0].body).toBe('PIN verified.');
  });

  it('rehashes a legacy unsalted PIN with a salt on its next correct use', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(legacyHash('482915'));
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 482915'), identity, { repository: repo, optedIn: true, send });

    const stored = vi.mocked(repo.setPinHash).mock.calls[0]?.[1];
    expect(stored).toMatch(/^scrypt:/);
    expect(verifyPin('482915', stored!)).toBe(true);
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
    ['phone and email', { status: 'ok', values: new Map([['estate_phone', '0803 699 6725'], ['estate_email', 'office@example.test']]) }, CONTACT_LINE],
    ['phone only', { status: 'ok', values: new Map([['estate_phone', '0803 699 6725'], ['estate_email', ' ']]) }, 'Contact the estate office on 0803 699 6725.'],
    ['nothing set', { status: 'ok', values: new Map() }, null],
    ['a settings error', { status: 'error', message: 'down' }, null],
  ])('builds the estate contact line from Estate info (%s)', async (_label, result, expected) => {
    vi.mocked(getRawSettingsAsService).mockResolvedValue(result as Awaited<ReturnType<typeof getRawSettingsAsService>>);

    await expect(createSupabaseWhatsAppFinancialRepository().getEstateContactLine()).resolves.toBe(expected);
    expect(getRawSettingsAsService).toHaveBeenCalledWith(['estate_phone', 'estate_email']);
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

describe('WhatsApp next-due answer (#811)', () => {
  type InvoiceRow = { invoice_number: string; amount_due: number; amount_paid: number; due_date: string; status?: string };

  function mockInvoices(rows: InvoiceRow[]) {
    // Behaves like PostgREST: applies status filters, then caps the response at max_rows (1000).
    let filtered = rows.map((row) => ({ status: row.amount_paid >= row.amount_due ? 'paid' : 'unpaid', ...row }));
    const page = (n: number) => ({ data: filtered.slice(0, Math.min(n, 1000)), error: null });
    const ordered = {
      limit: (n: number) => Promise.resolve(page(n)),
      then: (resolve: (value: ReturnType<typeof page>) => unknown) => resolve(page(1000)),
    };
    const chain = { select: vi.fn(), eq: vi.fn(), neq: vi.fn(), in: vi.fn(), order: vi.fn().mockReturnValue(ordered) };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.neq.mockImplementation((column: 'status', value: string) => {
      filtered = filtered.filter((row) => row[column] !== value);
      return chain;
    });
    chain.in.mockImplementation((column: 'status', values: string[]) => {
      filtered = filtered.filter((row) => values.includes(row[column]));
      return chain;
    });
    vi.mocked(createAdminClient).mockReturnValue({ from: vi.fn().mockReturnValue(chain) } as unknown as ReturnType<typeof createAdminClient>);
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

  it('finds an unpaid invoice newer than more than 20 fully paid ones', async () => {
    mockInvoices([...paidMonthly(25), { invoice_number: 'INV-NEW', amount_due: 5000, amount_paid: 0, due_date: '2026-11-01' }]);

    const answer = await createSupabaseWhatsAppFinancialRepository().getNextDue('resident-1', 'house-1');

    expect(answer.body).not.toContain('no outstanding');
    expect(answer.body).toBe('Next due: ₦5,000.00 on 01/11/2026 (invoice INV-NEW).');
  });

  it('finds an unpaid invoice newer than more than 1000 fully paid ones', async () => {
    mockInvoices([...paidMonthly(1100), { invoice_number: 'INV-NEW', amount_due: 5000, amount_paid: 0, due_date: '2120-01-01' }]);

    const answer = await createSupabaseWhatsAppFinancialRepository().getNextDue('resident-1', 'house-1');

    expect(answer.body).toBe('Next due: ₦5,000.00 on 01/01/2120 (invoice INV-NEW).');
  });

  it('ignores void invoices and keeps the amount guard on stale statuses', async () => {
    mockInvoices([
      { invoice_number: 'INV-VOID', amount_due: 5000, amount_paid: 0, due_date: '2026-09-01', status: 'void' },
      { invoice_number: 'INV-STALE', amount_due: 5000, amount_paid: 5000, due_date: '2026-09-15', status: 'partially_paid' },
      { invoice_number: 'INV-C', amount_due: 6000, amount_paid: 1000, due_date: '2026-11-01', status: 'partially_paid' },
    ]);

    const answer = await createSupabaseWhatsAppFinancialRepository().getNextDue('resident-1', 'house-1');

    expect(answer.body).toBe('Next due: ₦5,000.00 on 01/11/2026 (invoice INV-C).');
  });

  it('reports overdue invoices separately from the next one due', async () => {
    mockInvoices([
      ...paidMonthly(22),
      { invoice_number: 'INV-A', amount_due: 5000, amount_paid: 2000, due_date: '2026-08-01' },
      { invoice_number: 'INV-B', amount_due: 5000, amount_paid: 0, due_date: '2026-09-01' },
      { invoice_number: 'INV-C', amount_due: 6000, amount_paid: 0, due_date: '2026-11-01' },
      { invoice_number: 'INV-D', amount_due: 7000, amount_paid: 0, due_date: '2026-12-01' },
    ]);

    const answer = await createSupabaseWhatsAppFinancialRepository().getNextDue('resident-1', 'house-1');

    expect(answer.body).toBe(
      'Overdue: ₦8,000.00 across 2 invoices (oldest due 01/08/2026).\nNext due: ₦6,000.00 on 01/11/2026 (invoice INV-C).'
    );
  });

  it('omits the next-due line when nothing is due in the future', async () => {
    mockInvoices([{ invoice_number: 'INV-A', amount_due: 5000, amount_paid: 0, due_date: '2026-09-01' }]);

    const answer = await createSupabaseWhatsAppFinancialRepository().getNextDue('resident-1', 'house-1');

    expect(answer.body).toBe('Overdue: ₦5,000.00 across 1 invoice (oldest due 01/09/2026).');
  });

  it('says nothing is outstanding when every invoice is paid', async () => {
    mockInvoices(paidMonthly(30));

    const answer = await createSupabaseWhatsAppFinancialRepository().getNextDue('resident-1', 'house-1');

    expect(answer.body).toBe('There is no outstanding due invoice for this property.');
  });
});
