import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_MONEY_AMOUNT,
  moneyAmountSchema,
  validateMoneyAmount,
} from '@/lib/validators/money';

// ---------------------------------------------------------------------------
// Supabase mock: a chainable query builder that records writes and resolves
// `.single()` from a per-table fixture map.
// ---------------------------------------------------------------------------
const state = vi.hoisted(() => ({
  fromCalls: [] as string[],
  writes: [] as Array<{ table: string; op: string; payload: unknown }>,
  singles: {} as Record<string, unknown>,
}));

function builder(table: string): Record<string, unknown> {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'neq', 'is']) chain[m] = vi.fn(self);
  for (const op of ['insert', 'update', 'upsert']) {
    chain[op] = vi.fn((payload: unknown) => {
      state.writes.push({ table, op, payload });
      return chain;
    });
  }
  chain.single = vi.fn(async () => ({
    data: state.singles[table] ?? null,
    error: state.singles[table] ? null : { message: 'not found' },
  }));
  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({
    from: (table: string) => {
      state.fromCalls.push(table);
      return builder(table);
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
  }),
}));
vi.mock('@/lib/auth/authorize', () => ({
  authorizePermission: async () => ({ authorized: true, userId: 'user-1' }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(async () => undefined) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/matching/duplicate-matcher', () => ({
  checkDuplicateGuardrail: async () => ({ isDuplicate: false }),
}));
vi.mock('@/actions/billing/wallet', () => ({
  allocateWalletToInvoices: vi.fn(),
  getOrCreateWallet: vi.fn(),
}));
vi.mock('@/actions/notifications/send-correction-notification', () => ({
  sendCorrectionNotification: vi.fn(),
}));

import {
  recordCashCollection,
  replenishPettyCashAccount,
} from '@/actions/finance/petty-cash';
import { createInvoiceCorrection } from '@/actions/billing/create-invoice-correction';
import { createExpense } from '@/actions/expenses/create-expense';
import { reversePaymentAllocation } from '@/actions/billing/reverse-payment-allocation';
import { requestLateFeeWaiver } from '@/actions/billing/late-fee-waivers';
import { updateSetting, updateSettings, createSetting } from '@/actions/settings/update-setting';

const BAD_AMOUNTS: Array<[string, number]> = [
  ['negative', -5],
  ['zero', 0],
  ['NaN', Number.NaN],
  ['Infinity', Number.POSITIVE_INFINITY],
  ['-Infinity', Number.NEGATIVE_INFINITY],
  ['three decimals', 10.005],
  ['over the upper bound', MAX_MONEY_AMOUNT + 1],
];

beforeEach(() => {
  state.fromCalls.length = 0;
  state.writes.length = 0;
  state.singles = {};
});

describe('validateMoneyAmount', () => {
  it.each(BAD_AMOUNTS)('rejects %s', (_label, amount) => {
    expect(validateMoneyAmount(amount)).toEqual(expect.any(String));
  });
  it.each([0.01, 1, 100.5, 99999.99, MAX_MONEY_AMOUNT])('accepts %s', (amount) => {
    expect(validateMoneyAmount(amount)).toBeNull();
  });
  it('rejects non-numbers', () => {
    expect(validateMoneyAmount('10')).toEqual(expect.any(String));
    expect(validateMoneyAmount(undefined)).toEqual(expect.any(String));
  });
  it('allowZero accepts 0 but still rejects negatives', () => {
    expect(validateMoneyAmount(0, { allowZero: true })).toBeNull();
    expect(validateMoneyAmount(-1, { allowZero: true })).toEqual(expect.any(String));
  });
  it('zod schema mirrors the helper', () => {
    const schema = moneyAmountSchema();
    expect(schema.safeParse(12.5).success).toBe(true);
    expect(schema.safeParse(-1).success).toBe(false);
    expect(schema.safeParse(Number.NaN).success).toBe(false);
    expect(schema.safeParse(1.234).success).toBe(false);
  });
});

describe('petty cash actions', () => {
  const actions = [
    ['replenishPettyCashAccount', (a: number) => replenishPettyCashAccount('acc-1', a)],
    ['recordCashCollection', (a: number) => recordCashCollection('acc-1', a, 'x')],
  ] as const;

  describe.each(actions)('%s', (_name, run) => {
    it.each(BAD_AMOUNTS)('rejects %s before touching the database', async (_l, amount) => {
      const result = await run(amount);
      expect(result.success).toBe(false);
      expect(result.error).toBeTruthy();
      expect(state.fromCalls).toEqual([]);
      expect(state.writes).toEqual([]);
    });
    it('lets a valid amount through to the account lookup', async () => {
      const result = await run(100.5);
      expect(state.fromCalls).toContain('petty_cash_accounts');
      expect(result.error).toBe('Petty cash account not found');
    });
  });
});

describe('createInvoiceCorrection', () => {
  const base = { originalInvoiceId: 'inv-1', reason: 'a long enough reason' };
  const credit = (amount: number) => ({ type: 'credit' as const, amount, description: 'c' });
  const debit = (amount: number) => ({ type: 'debit' as const, amount, description: 'd' });

  it.each(BAD_AMOUNTS)('rejects a %s entry before touching the database', async (_l, amount) => {
    const result = await createInvoiceCorrection({
      ...base,
      corrections: [credit(100), debit(amount)],
    });
    expect(result.success).toBe(false);
    expect(state.fromCalls).toEqual([]);
  });

  it('rejects a negative amount even when totals would balance', async () => {
    const result = await createInvoiceCorrection({
      ...base,
      corrections: [credit(-100), debit(-100)],
    });
    expect(result.success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('rejects an unknown entry type', async () => {
    const result = await createInvoiceCorrection({
      ...base,
      corrections: [{ type: 'refund' as unknown as 'credit', amount: 10, description: 'x' }],
    });
    expect(result.error).toMatch(/credit.*debit/);
    expect(state.fromCalls).toEqual([]);
  });

  it('caps the number of entries', async () => {
    const corrections = Array.from({ length: 51 }, () => debit(1));
    const result = await createInvoiceCorrection({ ...base, corrections });
    expect(result.error).toMatch(/at most 50/);
    expect(state.fromCalls).toEqual([]);
  });

  it('lets valid entries through to the invoice lookup', async () => {
    const result = await createInvoiceCorrection({
      ...base,
      corrections: [credit(100), debit(100)],
    });
    expect(state.fromCalls).toContain('invoices');
    expect(result.error).toBe('Original invoice not found');
  });
});

describe('createExpense', () => {
  const input = {
    category_id: 'cat-1',
    expense_date: '2026-10-01',
    description: 'd',
  };

  it.each(BAD_AMOUNTS)('rejects %s before touching the database', async (_l, amount) => {
    await expect(createExpense({ ...input, amount })).rejects.toThrow();
    expect(state.fromCalls).toEqual([]);
  });

  it.each(['', 'not-a-date', '2026-13-45'])('rejects date %j', async (expense_date) => {
    await expect(createExpense({ ...input, expense_date, amount: 10 })).rejects.toThrow(/date/i);
    expect(state.fromCalls).toEqual([]);
  });

  it('ignores a client-supplied is_verified on a manual expense', async () => {
    state.singles.expenses = { id: 'e1' };
    await createExpense({ ...input, amount: 10, source_type: 'manual', is_verified: true });
    const insert = state.writes.find((w) => w.table === 'expenses' && w.op === 'insert');
    const row = (insert!.payload as Array<Record<string, unknown>>)[0];
    expect(row.is_verified).toBe(false);
    expect(row.verified_at).toBeNull();
  });

  it('keeps bank imports auto-verified', async () => {
    state.singles.expenses = { id: 'e1' };
    await createExpense({ ...input, amount: 10, source_type: 'bank_import', is_verified: true });
    const insert = state.writes.find((w) => w.table === 'expenses' && w.op === 'insert');
    expect((insert!.payload as Array<Record<string, unknown>>)[0].is_verified).toBe(true);
  });
});

describe('reversePaymentAllocation', () => {
  it.each(BAD_AMOUNTS)('rejects %s before touching the database', async (_l, amount) => {
    const result = await reversePaymentAllocation('inv-1', amount);
    expect(result.success).toBe(false);
    expect(state.fromCalls).toEqual([]);
  });
});

describe('requestLateFeeWaiver', () => {
  beforeEach(() => {
    state.singles.invoices = {
      id: 'inv-1',
      invoice_number: 'INV-1',
      resident_id: 'r1',
      metadata: { late_fee_applied: true, late_fee_amount: 1000 },
    };
  });

  it.each([
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['negative', -1],
    ['zero', 0],
    ['three decimals', 10.005],
  ])('rejects a %s partial waiver without writing', async (_l, waiverAmount) => {
    const result = await requestLateFeeWaiver({
      invoiceId: 'inv-1',
      reason: 'r',
      waiverType: 'partial',
      waiverAmount,
    });
    expect(result.success).toBe(false);
    expect(state.writes).toEqual([]);
  });

  it('accepts a valid partial waiver', async () => {
    state.singles.late_fee_waivers = undefined;
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await requestLateFeeWaiver({
      invoiceId: 'inv-1',
      reason: 'r',
      waiverType: 'partial',
      waiverAmount: 250.5,
    });
    spy.mockRestore();
    expect(state.writes.some((w) => w.table === 'late_fee_waivers' && w.op === 'insert')).toBe(true);
  });
});

describe('system settings numeric values', () => {
  it.each([Number.NaN, Number.POSITIVE_INFINITY])('updateSetting rejects %s', async (value) => {
    const result = await updateSetting('late_fee_rate', value);
    expect(result.error).toMatch(/finite/);
    expect(state.fromCalls).toEqual([]);
  });
  it('updateSettings rejects a batch containing a non-finite number', async () => {
    const result = await updateSettings({ ok: 1, bad: Number.NaN });
    expect(result.success).toBe(false);
    expect(state.fromCalls).toEqual([]);
  });
  it.each([
    ['grace_period_days', -1],
    ['grace_period_days', 100000],
    ['grace_period_days', 1.5],
    ['grace_period_days', '-3'],
    ['session_timeout_minutes', 20000],
    ['approval_auto_reject_hours', -5],
    ['late_fee_amount', -5],
    ['late_fee_amount', 1e12],
  ])('updateSetting rejects %s = %j without writing', async (key, value) => {
    const result = await updateSetting(key, value);
    expect(result.error).toBeTruthy();
    expect(state.fromCalls).toEqual([]);
  });
  it.each([
    ['grace_period_days', 7],
    ['grace_period_days', '7'],
    ['grace_period_days', 0],
    ['late_fee_amount', 5.5],
    ['payment_reminder_days', [7, 3, 1]],
    ['company_name', 'Acme'],
    ['some_other_number', -4],
  ])('updateSetting lets %s = %j through to the database', async (key, value) => {
    await updateSetting(key, value);
    expect(state.fromCalls).toContain('system_settings');
  });
  it('createSetting rejects a non-finite number', async () => {
    const result = await createSetting('k', Number.NEGATIVE_INFINITY);
    expect(result.error).toMatch(/finite/);
    expect(state.fromCalls).toEqual([]);
  });
});
