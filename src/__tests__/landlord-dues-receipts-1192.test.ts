/**
 * #1192 receipts: the landlord gets one receipt with the amount per flat; each tenant gets "Your dues
 * for [months] were paid by your landlord". Email and WhatsApp follow the payment receipt rules.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  sendEmail: vi.fn(),
  addToQueue: vi.fn(),
  shouldSendToResident: vi.fn(),
  isEventChannelEnabled: vi.fn(),
  isWhatsAppOptedIn: vi.fn(),
  LandlordDuesEmail: vi.fn(),
}));

vi.mock('@/lib/email', () => ({
  sendEmail: mocks.sendEmail,
  getEstateEmailSettings: vi.fn().mockResolvedValue({ estateName: 'Test Estate' }),
}));
const flagState = vi.hoisted(() => ({ byId: new Map<string, boolean | null>(), error: null as string | null }));
vi.mock('@/lib/comms-override/resident-flag', async (importOriginal) =>
  (await import('@/__tests__/helpers/resident-flag-lookup-mock')).flagModule(
    await importOriginal<typeof import('@/lib/comms-override/resident-flag')>(),
    flagState
  )
);
vi.mock('@/lib/notifications/preferences', () => ({ shouldSendToResident: mocks.shouldSendToResident }));
vi.mock('@/lib/notifications/event-content', () => ({ isEventChannelEnabled: mocks.isEventChannelEnabled }));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: mocks.isWhatsAppOptedIn }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: mocks.addToQueue, PRIORITY: { NORMAL: 5 } }));
vi.mock('@/emails/landlord-dues', () => ({ LandlordDuesEmail: mocks.LandlordDuesEmail }));

import { sendLandlordDuesReceipts } from '@/lib/billing/landlord-dues-receipts';

const contact = (id: string, phone: string | null = null) => ({ id, first_name: 'N', last_name: id, email: `${id}@example.test`, phone_primary: phone });
const NGN = (n: number) => `NGN ${n.toLocaleString('en-NG')}`;

const input = {
  splitId: 'split-1',
  landlord: contact('landlord', '+2348000000009'),
  paymentDate: '2026-10-26',
  tenants: [
    { tenant: contact('t1', '+2348000000001'), flat: 'IBB 226 F1', amount: 50000, months: ['Sep 2026', 'Oct 2026'] },
    { tenant: contact('t2'), flat: 'IBB 226 F2', amount: 25000, months: ['Oct 2026'] },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  flagState.error = null;
  flagState.byId = new Map(['landlord', 't1', 't2'].map((id) => [id, null]));
  mocks.sendEmail.mockResolvedValue({ success: true });
  mocks.addToQueue.mockResolvedValue({ success: true });
  mocks.shouldSendToResident.mockResolvedValue({ shouldSend: true });
  mocks.isEventChannelEnabled.mockResolvedValue(true);
  mocks.isWhatsAppOptedIn.mockResolvedValue(true);
});

describe('sendLandlordDuesReceipts (#1192)', () => {
  it('emails the landlord the amount per flat and each tenant a paid-by-landlord receipt', async () => {
    const result = await sendLandlordDuesReceipts(input);

    const emails = mocks.sendEmail.mock.calls.map((call) => call[0]);
    expect(emails.map((e) => [e.to.email, e.subject, e.emailType])).toEqual([
      ['landlord@example.test', `Receipt: dues paid for your tenants, ${NGN(75000)}`, 'payment_receipt'],
      ['t1@example.test', 'Receipt: Your dues for Sep 2026 and Oct 2026 were paid by your landlord', 'payment_receipt'],
      ['t2@example.test', 'Receipt: Your dues for Oct 2026 were paid by your landlord', 'payment_receipt'],
    ]);
    const landlordEmail = mocks.LandlordDuesEmail.mock.calls[0][0];
    expect(landlordEmail.lines).toEqual([
      { label: 'IBB 226 F1', amount: NGN(50000) },
      { label: 'IBB 226 F2', amount: NGN(25000) },
    ]);
    expect(landlordEmail.total).toBe(NGN(75000));
    expect(landlordEmail.paragraphs[0]).toContain('26 Oct 2026');
    expect(result.errors).toEqual([]);
  });

  it('queues payment_received WhatsApp receipts with the note in the reference slot, dates as dd mmm yyyy', async () => {
    await sendLandlordDuesReceipts(input);

    const queued = mocks.addToQueue.mock.calls.map((call) => call[0]);
    // t2 has no phone, so only the landlord and t1.
    expect(queued.map((q) => q.recipient_id)).toEqual(['landlord', 't1']);
    expect(queued[0].metadata.whatsapp_template).toMatchObject({
      name: 'payment_received',
      parameters: ['N landlord', NGN(75000), '26 Oct 2026', `Dues paid for your tenants: IBB 226 F1 ${NGN(50000)}; IBB 226 F2 ${NGN(25000)}`],
    });
    expect(queued[1].metadata.whatsapp_template.parameters).toEqual([
      'N t1', NGN(50000), '26 Oct 2026', 'Your dues for Sep 2026 and Oct 2026 were paid by your landlord',
    ]);
    expect(queued[1].deduplication_key).toBe('landlord-dues-receipt:split-1:t1');
  });

  it('follows the opt-in rules: no WhatsApp without opt-in, no email when the preference is off', async () => {
    mocks.isWhatsAppOptedIn.mockResolvedValue(false);
    mocks.shouldSendToResident.mockImplementation(async ({ channel }: { channel: string }) => ({ shouldSend: channel !== 'email' }));
    await sendLandlordDuesReceipts(input);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });

  it('respects the admin switch for payment receipts', async () => {
    mocks.isEventChannelEnabled.mockResolvedValue(false);
    await sendLandlordDuesReceipts(input);
    expect(mocks.sendEmail).not.toHaveBeenCalled();
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });

  it('sends nothing for an empty split', async () => {
    expect(await sendLandlordDuesReceipts({ ...input, tenants: [] })).toEqual({ sent: 0, errors: [] });
    expect(mocks.sendEmail).not.toHaveBeenCalled();
  });
});
