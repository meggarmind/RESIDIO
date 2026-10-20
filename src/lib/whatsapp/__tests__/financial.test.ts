import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
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
  WhatsAppFinancialRepository,
} from '@/lib/whatsapp/financial';
import type { WhatsAppInboundMessage } from '@/lib/whatsapp/types';
import type { WhatsAppResidentIdentity } from '@/lib/whatsapp/identity';
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
    claimPinAttempt: vi.fn().mockResolvedValue(1),
    clearPinAttempts: vi.fn().mockResolvedValue(undefined),
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

  it('counts a wrong PIN, says how many attempts are left and does not authenticate', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(3);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(repo.claimPinAttempt).toHaveBeenCalledWith('resident-1');
    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('2 attempt(s) left');
  });

  it('locks on the fifth wrong PIN', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(5);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 000000'), identity, { repository: repo, optedIn: true, send });

    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('locked for 24 hours');
  });

  it('refuses even the correct PIN while locked', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(null);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 482915'), identity, { repository: repo, optedIn: true, send });

    expect(repo.clearPinAttempts).not.toHaveBeenCalled();
    expect(repo.saveSession).not.toHaveBeenCalled();
    expect(send.mock.calls[0]?.[0].body).toContain('locked for 24 hours');
  });

  it('clears the counter and authenticates on a correct PIN, keeping a salted hash as is', async () => {
    const repo = repository();
    vi.mocked(repo.getPinHash).mockResolvedValue(hashPin('482915'));
    vi.mocked(repo.claimPinAttempt).mockResolvedValue(4);
    const send = vi.fn().mockResolvedValue({ success: true });

    await handleFinancialMessage(message('PIN 482915'), identity, { repository: repo, optedIn: true, send });

    expect(repo.clearPinAttempts).toHaveBeenCalledWith('resident-1');
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
