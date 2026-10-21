import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #907: stored wording reaches what the welcome, receipt and manual-reminder senders actually send,
 * both the subject and the `copy` prop of the email component. Mocks mirror payment-email-override.test.ts.
 */
const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  authorizePermission: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  getSettingValue: vi.fn(),
  getEventContent: vi.fn(),
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
vi.mock('@/emails', () => ({
  WelcomeResidentEmail: vi.fn(() => null),
  PaymentReceiptEmail: vi.fn(() => null),
  PaymentReminderEmail: vi.fn(() => null),
}));
vi.mock('@/lib/notifications/event-content', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/notifications/event-content')>()),
  getEventContent: mocks.getEventContent,
}));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: mocks.getSettingValue }));
vi.mock('@/actions/settings/update-setting', () => ({
  updateSetting: vi.fn().mockResolvedValue({ data: { id: 'setting-1' }, error: null }),
}));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));

import { PaymentReceiptEmail, PaymentReminderEmail, WelcomeResidentEmail } from '@/emails';
import { sendWelcomeEmail } from '@/actions/email/send-welcome-email';
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

const person = (id: string) => ({ id, first_name: 'Ada', last_name: 'Obi', email: `${id}@example.test` });

beforeEach(() => {
  vi.clearAllMocks();
  flagState.error = null;
  flagState.byId = new Map([['a', null]]);
  mocks.authorizePermission.mockResolvedValue({ authorized: true, userId: 'admin-1' });
  mocks.createServerSupabaseClient.mockResolvedValue(fakeClient());
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.getSettingValue.mockImplementation(async (key: string) =>
    key === 'payment_reminder_days' ? [1] : key === 'email_payment_reminders_enabled' ? true : null
  );
});

describe('stored wording reaches the sent email (#907)', () => {
  it('welcome: subject and copy prop', async () => {
    const stored = { subject: 'Hi {{resident_name}} at {{estate_name}}', heading: 'Custom' };
    mocks.getEventContent.mockResolvedValue(stored);
    mocks.tables = {
      residents: {
        one: { ...person('a'), resident_code: 'R-A', resident_houses: { house: { house_number: '1', street: { name: 'Main' } } } },
      },
    };

    await sendWelcomeEmail('a');

    expect(mocks.getEventContent).toHaveBeenCalledWith('welcome_resident');
    expect(mocks.sendEmail.mock.calls[0][0].subject).toBe('Hi Ada Obi at Test Estate');
    expect(WelcomeResidentEmail).toHaveBeenCalledWith(expect.objectContaining({ copy: stored }));
  });

  it('receipt: subject and copy prop', async () => {
    const stored = { subject: 'Receipt {{amount}} for {{resident_name}}' };
    mocks.getEventContent.mockResolvedValue(stored);
    mocks.tables = {
      payment_records: {
        one: {
          id: 'pay-1', amount: 1000, payment_date: '2026-10-01', method: 'transfer', reference_number: 'REF-1',
          notes: null, period_start: null, period_end: null, is_verified: true,
          resident: { ...person('a'), resident_code: 'R-A' }, house: null,
        },
      },
      residents: { many: [person('a')] },
    };

    await sendPaymentReceiptEmail('pay-1', ['a@example.test']);

    expect(mocks.getEventContent).toHaveBeenCalledWith('payment_receipt');
    expect(mocks.sendEmail.mock.calls[0][0].subject).toBe('Receipt ₦1,000 for Ada Obi');
    expect(PaymentReceiptEmail).toHaveBeenCalledWith(expect.objectContaining({ copy: stored }));
  });

  it('manual reminder: subject uses "house, street" for {{property}}, and the copy prop is passed', async () => {
    const stored = { subject: 'Due {{invoice_number}} at {{property}}' };
    mocks.getEventContent.mockResolvedValue(stored);
    mocks.tables = {
      invoices: {
        many: [
          {
            id: 'inv-1', invoice_number: 'INV-1', amount_due: 1000, amount_paid: 0, due_date: '2026-10-20',
            resident: person('a'), house: { house_number: '1', street: { name: 'Main' } },
          },
        ],
      },
    };

    await sendPaymentReminders();

    expect(mocks.getEventContent).toHaveBeenCalledWith('payment_reminder');
    expect(mocks.sendEmail.mock.calls[0][0].subject).toBe('Due INV-1 at 1, Main');
    expect(PaymentReminderEmail).toHaveBeenCalledWith(expect.objectContaining({ copy: stored }));
  });
});
