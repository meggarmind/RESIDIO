/**
 * Issue #6 — the invoice-reminder trigger queues a WhatsApp template item for
 * an eligible resident and queues nothing when preferences exclude WhatsApp.
 * The real buildInvoiceReminderWhatsApp runs; the queue is the assertion seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addToQueue: vi.fn(),
  shouldSendToResident: vi.fn(),
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/email', () => ({
  sendEmail: vi.fn(),
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('../reminder-config', () => ({
  areRemindersEnabled: vi.fn().mockResolvedValue(true),
  getActiveDays: vi.fn(),
  getReminderSchedule: vi.fn().mockResolvedValue({
    data: {
      steps: [
        {
          id: 'step-1',
          daysFromDue: 0,
          escalationLevel: 'friendly',
          channels: ['whatsapp'],
          isActive: true,
          priority: 5,
        },
      ],
    },
    error: null,
  }),
}));
vi.mock('@/emails/payment-reminder-escalated', () => ({
  PaymentReminderEscalatedEmail: vi.fn(),
  getEscalatedReminderSubject: vi.fn(),
  determineEscalationLevel: vi.fn(),
}));
vi.mock('@/lib/sms/templates/payment-reminder', () => ({ generatePaymentReminderSms: vi.fn() }));
vi.mock('@/lib/notifications/escalation', () => ({
  getOrCreateEscalationState: vi.fn().mockResolvedValue({ is_resolved: false, current_level: 0 }),
  advanceEscalation: vi.fn(),
  resolveAllEscalationsForEntity: vi.fn(),
}));
vi.mock('@/lib/notifications/queue', () => ({
  addToQueue: mocks.addToQueue,
  PRIORITY: { URGENT: 1, HIGH: 3, NORMAL: 5, LOW: 8 },
}));
vi.mock('@/lib/notifications/preferences', () => ({
  shouldSendToResident: mocks.shouldSendToResident,
}));

import { processInvoiceReminders } from '../invoice-reminders';

const INVOICE = {
  id: 'inv-1',
  invoice_number: 'INV-001',
  amount_due: 15000,
  amount_paid: 5000,
  due_date: '2026-10-01',
  status: 'unpaid',
  resident: {
    id: 'res-1',
    first_name: 'Ada',
    last_name: 'Obi',
    email: null,
    phone_primary: '+2348000000000',
  },
  house: { house_number: '4', street: { name: 'Palm Rd' } },
};

function adminClientReturning(invoices: unknown[]) {
  const result = { data: invoices, error: null };
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'in', 'eq']) chain[m] = vi.fn(() => chain);
  chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return { from: vi.fn(() => chain) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockReturnValue(adminClientReturning([INVOICE]));
  mocks.addToQueue.mockResolvedValue({ success: true });
  mocks.shouldSendToResident.mockResolvedValue({ shouldSend: true });
});

describe('processInvoiceReminders WhatsApp trigger (#6)', () => {
  it('queues an invoice_reminder WhatsApp item for an eligible resident', async () => {
    const result = await processInvoiceReminders();

    expect(mocks.shouldSendToResident).toHaveBeenCalledWith({
      residentId: 'res-1',
      category: 'invoice',
      channel: 'whatsapp',
    });
    expect(mocks.addToQueue).toHaveBeenCalledTimes(1);
    const queued = mocks.addToQueue.mock.calls[0][0];
    expect(queued).toMatchObject({
      recipient_id: 'res-1',
      recipient_phone: '+2348000000000',
      channel: 'whatsapp',
    });
    expect(queued.metadata.whatsapp_template.name).toBe('invoice_reminder');
    // amount remaining (15000 - 5000), not the amount due
    expect(queued.metadata.whatsapp_template.parameters).toEqual(
      expect.arrayContaining(['Ada Obi', 'INV-001', `NGN ${(10000).toLocaleString('en-NG')}`])
    );
    expect(result.sent.whatsapp).toBe(1);
    expect(result.failed).toBe(0);
  });

  it('queues nothing and records the reason when preferences exclude WhatsApp', async () => {
    mocks.shouldSendToResident.mockResolvedValue({
      shouldSend: false,
      reason: 'Invoice via whatsapp is disabled',
    });

    const result = await processInvoiceReminders();

    expect(mocks.addToQueue).not.toHaveBeenCalled();
    expect(result.sent.whatsapp).toBe(0);
    expect(result.errors).toEqual([
      { invoiceId: 'inv-1', error: 'WhatsApp: Invoice via whatsapp is disabled' },
    ]);
  });

  it('queues nothing for a resident with no phone number', async () => {
    mocks.createAdminClient.mockReturnValue(
      adminClientReturning([
        { ...INVOICE, resident: { ...INVOICE.resident, email: 'a@b.test', phone_primary: null } },
      ])
    );

    await processInvoiceReminders();

    expect(mocks.shouldSendToResident).not.toHaveBeenCalled();
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });

  it('surfaces a queue failure as an error instead of counting a send', async () => {
    mocks.addToQueue.mockResolvedValue({ success: false, error: 'queue down' });

    const result = await processInvoiceReminders();

    expect(result.sent.whatsapp).toBe(0);
    expect(result.errors).toEqual([{ invoiceId: 'inv-1', error: 'WhatsApp: queue down' }]);
  });
});
