/**
 * #1192: on a "Dues paid by landlord" house the dues reminder goes to the target the admin chose:
 * the tenant (default), the landlord, or both. A landlord gets one reminder for all their flats,
 * with the amount per flat. The email and the queue are the assertion seams.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  addToQueue: vi.fn(),
  createAdminClient: vi.fn(),
  sendEmail: vi.fn(),
  getReminderSchedule: vi.fn(),
  advanceEscalation: vi.fn(),
  LandlordDuesEmail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: vi.fn().mockResolvedValue(true) }));
vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));
vi.mock('@/lib/sms/send-sms', () => ({ sendSms: vi.fn() }));
const flagState = vi.hoisted(() => ({ byId: new Map<string, boolean | null>(), error: null as string | null }));
vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
  (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(
    await importOriginal<typeof import('@/lib/comms-override/resident-flag')>(),
    flagState
  )
);
vi.mock('@/actions/settings/get-settings', () => ({ getSettingValue: vi.fn() }));
vi.mock('@/actions/settings/update-setting', () => ({ updateSetting: vi.fn().mockResolvedValue({ data: null, error: null }) }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/actions/notifications/reminder-config', () => ({
  areRemindersEnabled: vi.fn().mockResolvedValue(true),
  getActiveDays: vi.fn(),
  getReminderSchedule: mocks.getReminderSchedule,
}));
vi.mock('@/emails/payment-reminder-escalated', () => ({
  PaymentReminderEscalatedEmail: vi.fn(),
  getEscalatedReminderSubject: vi.fn(() => 'Tenant reminder'),
  determineEscalationLevel: vi.fn(),
}));
vi.mock('@/emails/landlord-dues', () => ({ LandlordDuesEmail: mocks.LandlordDuesEmail }));
vi.mock('@/lib/notifications/event-content', async (importActual) => ({
  ...(await importActual<typeof import('@/lib/notifications/event-content')>()),
  getEventContent: vi.fn().mockResolvedValue({}),
}));
vi.mock('@/lib/sms/templates/payment-reminder', () => ({ generatePaymentReminderSms: vi.fn() }));
vi.mock('@/lib/notifications/escalation', () => ({
  getOrCreateEscalationState: vi.fn().mockResolvedValue({ is_resolved: false, current_level: 0 }),
  advanceEscalation: mocks.advanceEscalation,
  resolveAllEscalationsForEntity: vi.fn(),
}));
vi.mock('@/lib/notifications/queue', () => ({
  addToQueue: mocks.addToQueue,
  PRIORITY: { URGENT: 1, HIGH: 3, NORMAL: 5, LOW: 8 },
}));
vi.mock('@/lib/notifications/preferences', () => ({
  shouldSendToResident: vi.fn().mockResolvedValue({ shouldSend: true }),
}));

import { processInvoiceReminders } from '@/lib/notifications/invoice-reminders';

const LANDLORD = { id: 'landlord', first_name: 'Lola', last_name: 'Landlord', email: 'lola@example.test', phone_primary: '+2348000000009' };

function flat(n: number, target: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `inv-${n}`,
    invoice_number: `INV-00${n}`,
    amount_due: 50000,
    amount_paid: 0,
    due_date: '2026-10-01',
    status: 'unpaid',
    charge_category: 'dues',
    house_id: `house-${n}`,
    resident: { id: `tenant-${n}`, first_name: 'Tenant', last_name: `F${n}`, email: `t${n}@example.test`, phone_primary: null },
    house: { house_number: '226', short_name: `IBB 226 F${n}`, dues_paid_by_landlord: true, dues_reminder_target: target, street: { name: 'IBB Way' } },
    ...overrides,
  };
}

/** One chain per table: invoices returns the invoices, resident_houses the landlord links. */
function adminClient(invoices: unknown[], links: unknown[]) {
  const make = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'in', 'eq']) chain[m] = vi.fn(() => chain);
    chain.maybeSingle = vi.fn(() => Promise.resolve({ data: null, error: null }));
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(resolve);
    return chain;
  };
  return { from: vi.fn((table: string) => make(table === 'resident_houses' ? links : table === 'invoices' ? invoices : [])) };
}

function setup(target: string, flats = [1, 2, 3, 4]) {
  const invoices = flats.map((n) => flat(n, target));
  const links = flats.flatMap((n) => [
    { house_id: `house-${n}`, resident_role: 'non_resident_landlord', resident: LANDLORD },
    { house_id: `house-${n}`, resident_role: 'tenant', resident: invoices[flats.indexOf(n)].resident },
  ]);
  mocks.createAdminClient.mockReturnValue(adminClient(invoices, links));
}

const emailedTo = () => mocks.sendEmail.mock.calls.map((call) => call[0].to.email).sort();

beforeEach(() => {
  vi.clearAllMocks();
  flagState.error = null;
  flagState.byId = new Map(['landlord', 'tenant-1', 'tenant-2', 'tenant-3', 'tenant-4'].map((id) => [id, null]));
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.addToQueue.mockResolvedValue({ success: true });
  mocks.getReminderSchedule.mockResolvedValue({
    data: { steps: [{ id: 's', daysFromDue: 0, escalationLevel: 'friendly', channels: ['email'], isActive: true, priority: 5 }] },
    error: null,
  });
});

describe('Dues paid by landlord reminder routing (#1192)', () => {
  it('tenant target: only the tenants get reminders', async () => {
    setup('tenant');
    await processInvoiceReminders();
    expect(emailedTo()).toEqual(['t1@example.test', 't2@example.test', 't3@example.test', 't4@example.test']);
    expect(mocks.LandlordDuesEmail).not.toHaveBeenCalled();
  });

  it('landlord target: only the landlord, in one reminder with the amount per flat', async () => {
    setup('landlord');
    const result = await processInvoiceReminders();
    expect(emailedTo()).toEqual(['lola@example.test']);
    const props = mocks.LandlordDuesEmail.mock.calls[0][0];
    expect(props.lines).toEqual([1, 2, 3, 4].map((n) => ({ label: `IBB 226 F${n}`, amount: `NGN ${(50000).toLocaleString('en-NG')}` })));
    expect(props.total).toBe(`NGN ${(200000).toLocaleString('en-NG')}`);
    expect(mocks.sendEmail.mock.calls[0][0].subject).toContain('1 Oct 2026');
    // Each flat's escalation advances once, from the landlord's reminder.
    expect(mocks.advanceEscalation).toHaveBeenCalledTimes(4);
    expect(result.failed).toBe(0);
  });

  it('both target: the tenants and the landlord, escalation advanced once per flat', async () => {
    setup('both');
    await processInvoiceReminders();
    expect(emailedTo()).toEqual(['lola@example.test', 't1@example.test', 't2@example.test', 't3@example.test', 't4@example.test']);
    expect(mocks.LandlordDuesEmail).toHaveBeenCalledTimes(1);
    expect(mocks.advanceEscalation).toHaveBeenCalledTimes(4);
  });

  it('landlord WhatsApp reminder uses the approved invoice_reminder template, deduplicated per landlord per day', async () => {
    setup('landlord', [1, 2]);
    mocks.getReminderSchedule.mockResolvedValue({
      data: { steps: [{ id: 's', daysFromDue: 0, escalationLevel: 'friendly', channels: ['whatsapp'], isActive: true, priority: 5 }] },
      error: null,
    });
    await processInvoiceReminders();
    expect(mocks.addToQueue).toHaveBeenCalledTimes(1);
    const queued = mocks.addToQueue.mock.calls[0][0];
    expect(queued.recipient_id).toBe('landlord');
    expect(queued.metadata.whatsapp_template.name).toBe('invoice_reminder');
    expect(queued.metadata.whatsapp_template.parameters[1]).toBe(
      `Dues for your flats: IBB 226 F1 NGN ${(50000).toLocaleString('en-NG')}; IBB 226 F2 NGN ${(50000).toLocaleString('en-NG')}`,
    );
    expect(queued.metadata.whatsapp_template.parameters[3]).toBe('1 Oct 2026');
    expect(queued.deduplication_key).toMatch(/^landlord-dues-reminder:landlord:/);
  });

  it('a levy invoice of a flagged house still goes to its own payer', async () => {
    const invoice = flat(1, 'landlord', { charge_category: 'development_levy' });
    mocks.createAdminClient.mockReturnValue(adminClient([invoice], []));
    await processInvoiceReminders();
    expect(emailedTo()).toEqual(['t1@example.test']);
    expect(mocks.LandlordDuesEmail).not.toHaveBeenCalled();
  });

  it('a house that is not flagged ignores the target', async () => {
    const invoice = flat(1, 'landlord');
    invoice.house.dues_paid_by_landlord = false;
    mocks.createAdminClient.mockReturnValue(adminClient([invoice], []));
    await processInvoiceReminders();
    expect(emailedTo()).toEqual(['t1@example.test']);
  });

  it('reports a flagged house with no landlord on record instead of sending', async () => {
    const invoice = flat(1, 'landlord');
    mocks.createAdminClient.mockReturnValue(adminClient([invoice], []));
    const result = await processInvoiceReminders();
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(result.errors).toEqual([{ invoiceId: 'inv-1', error: 'Landlord reminder: no landlord on record' }]);
  });
});
