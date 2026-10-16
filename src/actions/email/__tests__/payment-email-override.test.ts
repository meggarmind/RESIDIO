import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #716: the payment receipt and payment reminder emails pass the stored resident flag to sendEmail,
 * combine several recipients toward redirecting, and send nothing when the flag cannot be read.
 */
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getSettingValue: vi.fn(),
  tables: {} as Record<string, { many?: unknown; one?: unknown }>,
}));
const flagState = vi.hoisted(() => ({ byId: new Map<string, boolean | null>(), error: null as string | null }));

vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
  (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(
    await importOriginal<typeof import('@/lib/comms-override/resident-flag')>(),
    flagState
  )
);
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: vi.fn(),
}));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));
vi.mock('@/emails', () => ({ PaymentReceiptEmail: vi.fn(() => null), PaymentReminderEmail: vi.fn(() => null) }));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: mocks.getSettingValue }));
vi.mock('@/actions/settings/update-setting', () => ({
  updateSetting: vi.fn().mockResolvedValue({ data: { id: 'setting-1' }, error: null }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));

import { sendPaymentReceiptEmail } from '@/actions/email/send-payment-receipt-email';
import { sendPaymentReminders } from '@/actions/email/send-payment-reminders';

function fakeClient() {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'neq']) chain[m] = () => chain;
      chain.single = async () => ({ data: mocks.tables[table]?.one ?? null, error: null });
      chain.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: mocks.tables[table]?.many ?? [], error: null }).then(resolve);
      return chain;
    },
  };
}

const person = (id: string) => ({ id, first_name: `F${id}`, last_name: `L${id}`, email: `${id}@example.test` });

beforeEach(() => {
  vi.clearAllMocks();
  flagState.error = null;
  flagState.byId = new Map();
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin-1' });
  mocks.createServerSupabaseClient.mockResolvedValue(fakeClient());
  mocks.sendEmail.mockResolvedValue({ success: true });
});

describe('sendPaymentReceiptEmail combines the recipients flags toward redirecting (#716)', () => {
  beforeEach(() => {
    mocks.tables = {
      payment_records: {
        one: {
          id: 'pay-1',
          amount: 1000,
          payment_date: '2026-10-01',
          method: 'transfer',
          reference_number: 'REF-1',
          notes: null,
          period_start: null,
          period_end: null,
          is_verified: true,
          resident: { ...person('a'), resident_code: 'R-A' },
          house: null,
        },
      },
    };
  });

  const stored = (a: boolean | null, b: boolean | null, c?: boolean | null) => {
    flagState.byId = new Map<string, boolean | null>([['a', a], ['b', b], ...(c === undefined ? [] : [['c', c] as [string, boolean | null]])]);
    mocks.tables.residents = { many: c === undefined ? [person('a'), person('b')] : [person('a'), person('b'), person('c')] };
  };
  const emails = (c?: unknown) => (c === undefined ? ['a@example.test', 'b@example.test'] : ['a@example.test', 'b@example.test', 'c@example.test']);

  const ORDERS: Array<[boolean | null, boolean | null, boolean | null]> = [
    [true, null, false],
    [true, false, null],
    [null, true, false],
    [null, false, true],
    [false, true, null],
    [false, null, true],
  ];

  it.each(ORDERS)('true beats null beats false in every order: %s, %s, %s -> true', async (a, b, c) => {
    stored(a, b, c);
    await sendPaymentReceiptEmail('pay-1', emails(c));
    expect(mocks.sendEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendEmail.mock.calls[0][0]).toHaveProperty('residentOverride', true);
  });

  it.each([
    [null, false, null],
    [false, null, null],
    [false, false, false],
    [true, true, true],
    [null, null, null],
  ] as const)('pair %s + %s combines to %s', async (a, b, expected) => {
    stored(a, b);
    await sendPaymentReceiptEmail('pay-1', emails());
    expect(mocks.sendEmail.mock.calls[0][0]).toHaveProperty('residentOverride', expected);
  });

  it('a recipient that is last in the list still counts (not just the first)', async () => {
    stored(false, false, true);
    await sendPaymentReceiptEmail('pay-1', emails(true));
    expect(mocks.sendEmail.mock.calls[0][0]).toHaveProperty('residentOverride', true);
  });

  it('fails closed when the flags cannot be read: nothing is sent, the failure is returned', async () => {
    stored(true, false);
    flagState.error = 'db down';
    const result = await sendPaymentReceiptEmail('pay-1', emails());
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    expect(result.error).toContain('could not read resident flag');
  });

  it('fails closed when a recipient is missing from the lookup', async () => {
    stored(true, false);
    flagState.byId = new Map([['a', true]]);
    const result = await sendPaymentReceiptEmail('pay-1', emails());
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });
});

describe('sendPaymentReminders passes each resident its stored flag (#716)', () => {
  const invoice = (n: number, resident: ReturnType<typeof person>) => ({
    id: `inv-${n}`,
    invoice_number: `INV-${n}`,
    amount_due: 1000,
    amount_paid: 0,
    due_date: '2026-10-20',
    resident,
    house: { house_number: '1', street: { name: 'Main' } },
  });

  beforeEach(() => {
    mocks.getSettingValue.mockImplementation(async (key: string) =>
      key === 'payment_reminder_days' ? [1] : key === 'email_payment_reminders_enabled' ? true : null
    );
    mocks.tables = { invoices: { many: [invoice(1, person('a')), invoice(2, person('b')), invoice(3, person('c'))] } };
  });

  it('each invoice email carries its own resident stored flag', async () => {
    flagState.byId = new Map<string, boolean | null>([['a', true], ['b', false], ['c', null]]);

    const result = await sendPaymentReminders();

    expect(result.sent).toBe(3);
    const byResident = Object.fromEntries(
      mocks.sendEmail.mock.calls.map(([o]) => [o.to.residentId, o.residentOverride])
    );
    expect(byResident).toEqual({ a: true, b: false, c: null });
  });

  it('fails closed per resident: an unreadable flag sends nothing and counts as a failure', async () => {
    flagState.byId = new Map<string, boolean | null>([['a', true], ['c', null]]); // b is missing

    const result = await sendPaymentReminders();

    expect(mocks.sendEmail.mock.calls.map(([o]) => o.to.residentId)).toEqual(['a', 'c']);
    expect(result.sent).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.errors.join(' ')).toContain('INV-2');
  });

  it('sends nothing at all when the lookup itself errors', async () => {
    flagState.error = 'db down';

    const result = await sendPaymentReminders();

    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(3);
    expect(result.errors.join(' ')).toContain('could not read resident flag');
  });
});
