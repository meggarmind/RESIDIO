/**
 * #1035: a same-day re-run must not resend reminders, WhatsApp queue rows carry a
 * de-duplication key, and failed database reads are reported as failures.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  invoices: [] as unknown[],
  fetchError: null as { message: string } | null,
  scheduleError: null as string | null,
  lastNotifiedAt: null as string | null,
  escalationMissing: false,
  sendEmail: vi.fn(),
  addToQueue: vi.fn(),
  advanceEscalation: vi.fn(),
}));

vi.mock('@/lib/settings/service', () => ({ getSettingValueAsService: async () => null }));
vi.mock('@/actions/notifications/reminder-config', () => ({
  areRemindersEnabled: async () => true,
  getReminderSchedule: async () =>
    m.scheduleError
      ? { data: null, error: m.scheduleError }
      : {
          data: {
            steps: [
              { id: 's', daysFromDue: 0, escalationLevel: 'friendly', channels: ['email', 'whatsapp'], isActive: true, priority: 1 },
            ],
          },
          error: null,
        },
}));
vi.mock('@/lib/notifications/payment-reminder-settings', () => ({
  readPaymentReminderSettings: async () => ({}),
  applyPaymentReminderSettings: (steps: unknown) => steps,
}));
vi.mock('@/lib/supabase/server', () => {
  const chain = {
    select: () => chain,
    in: () => chain,
    eq: () => chain,
    then: (resolve: (r: unknown) => unknown) =>
      resolve({ data: m.fetchError ? null : m.invoices, error: m.fetchError }),
  };
  return { createAdminClient: () => ({ from: () => chain }) };
});
vi.mock('@/lib/email', () => ({ sendEmail: m.sendEmail, getEstateEmailSettings: async () => ({}) }));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
vi.mock('@/lib/comms-override/resident-flag', () => ({
  resolveResidentOverride: async () => ({ ok: true, residentOverride: false }),
}));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: async () => true }));
vi.mock('@/lib/notifications/preferences', () => ({ shouldSendToResident: async () => ({ shouldSend: true }) }));
vi.mock('@/lib/notifications/event-content', () => ({
  formatDueText: () => '',
  formatEventCurrency: () => '',
  getEventContent: async () => ({}),
}));
vi.mock('@/emails/payment-reminder-escalated', () => ({
  PaymentReminderEscalatedEmail: () => null,
  getEscalatedReminderSubject: () => 'subject',
}));
vi.mock('@/lib/notifications/escalation', () => ({
  getOrCreateEscalationState: async () =>
    m.escalationMissing ? null : { is_resolved: false, current_level: 0, last_notified_at: m.lastNotifiedAt },
  advanceEscalation: m.advanceEscalation,
}));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: m.addToQueue }));

import { processInvoiceReminders } from '@/lib/notifications/invoice-reminders';

const invoice = {
  id: 'inv-1',
  invoice_number: 'INV-1',
  amount_due: 100,
  amount_paid: 0,
  due_date: '2026-10-22',
  status: 'unpaid',
  resident: { id: 'r1', first_name: 'A', last_name: 'B', email: 'a@b.test', phone_primary: '+2348000000000' },
  house: { house_number: '1', street: { name: 'Main' } },
};

beforeEach(() => {
  vi.clearAllMocks();
  m.invoices = [invoice];
  m.fetchError = null;
  m.scheduleError = null;
  m.lastNotifiedAt = null;
  m.escalationMissing = false;
  m.sendEmail.mockResolvedValue({ success: true });
  m.addToQueue.mockResolvedValue({ success: true });
});

describe('processInvoiceReminders (#1035)', () => {
  it('sends and passes a per-invoice, per-day de-duplication key to the WhatsApp queue', async () => {
    const result = await processInvoiceReminders();
    expect(result.sent).toEqual({ email: 1, sms: 0, whatsapp: 1 });
    expect(m.addToQueue.mock.calls[0][0].deduplication_key).toMatch(/^invoice-reminder:inv-1:\d{4}-\d{2}-\d{2}$/);
  });

  it('skips an invoice already notified today', async () => {
    m.lastNotifiedAt = new Date().toISOString();
    const result = await processInvoiceReminders();
    expect(result.skipped).toBe(1);
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.addToQueue).not.toHaveBeenCalled();
    expect(m.advanceEscalation).not.toHaveBeenCalled();
  });

  it('still sends when the last notification was on an earlier day', async () => {
    m.lastNotifiedAt = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const result = await processInvoiceReminders();
    expect(result.sent.email).toBe(1);
  });

  it('reports a failed invoice read as a failure, not an empty success', async () => {
    m.fetchError = { message: 'connection reset' };
    const result = await processInvoiceReminders();
    expect(result.failed).toBe(1);
    expect(result.errors[0].error).toContain('connection reset');
  });

  it('reports a failed schedule load as a failure', async () => {
    m.scheduleError = 'boom';
    const result = await processInvoiceReminders();
    expect(result.failed).toBe(1);
  });

  it('does not send when the escalation state cannot be read, and reports it', async () => {
    m.escalationMissing = true;
    const result = await processInvoiceReminders();
    expect(result.failed).toBe(1);
    expect(result.errors[0]).toEqual({ invoiceId: 'inv-1', error: 'Failed to load escalation state' });
    expect(m.sendEmail).not.toHaveBeenCalled();
    expect(m.addToQueue).not.toHaveBeenCalled();
  });

  it('an overlapping re-run queues no second WhatsApp row and reports no failure', async () => {
    // Mirrors the partial unique index on invoice-reminder:% keys: a second insert is a duplicate.
    const queued = new Set<string>();
    m.addToQueue.mockImplementation(async (input: { deduplication_key: string }) => {
      if (queued.has(input.deduplication_key)) {
        return { success: false, isDuplicate: true, error: 'duplicate key value violates unique constraint' };
      }
      queued.add(input.deduplication_key);
      return { success: true, queueId: 'q1' };
    });
    // Neither run has written last_notified_at yet, so the same-day skip cannot stop the second.
    const first = await processInvoiceReminders();
    const second = await processInvoiceReminders();
    expect(queued.size).toBe(1);
    expect(first.sent.whatsapp).toBe(1);
    expect(second.sent.whatsapp).toBe(0);
    expect(second.failed).toBe(0);
    expect(second.errors).toEqual([]);
    expect(m.advanceEscalation).toHaveBeenCalledTimes(2);
  });
});
