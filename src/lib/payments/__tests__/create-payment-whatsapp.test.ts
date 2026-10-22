/**
 * Issue #6 — the payment-received trigger. The brief names
 * src/actions/payments/create-payment.ts, but that file is a thin wrapper;
 * the trigger lives in createPaymentCore (src/lib/payments/create-payment.ts).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  addToQueue: vi.fn(),
  shouldSendToResident: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  allocateWalletToInvoices: vi.fn(),
  isWhatsAppOptedIn: vi.fn(),
  isEventChannelEnabled: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
}));
vi.mock('@/actions/billing/wallet', () => ({
  allocateWalletToInvoices: mocks.allocateWalletToInvoices,
}));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: mocks.isWhatsAppOptedIn }));
vi.mock('@/lib/notifications/event-content', () => ({ isEventChannelEnabled: mocks.isEventChannelEnabled }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/notifications/preferences', () => ({
  shouldSendToResident: mocks.shouldSendToResident,
}));
vi.mock('@/lib/notifications/queue', () => ({
  addToQueue: mocks.addToQueue,
  PRIORITY: { URGENT: 1, HIGH: 3, NORMAL: 5, LOW: 8 },
}));
vi.mock('@/lib/payments/house-membership', () => ({
  residentHasHouse: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock('@/lib/matching/duplicate-matcher', () => ({
  checkDuplicateGuardrail: vi.fn().mockResolvedValue({ isDuplicate: false }),
}));

import { createPaymentCore } from '../create-payment';

const RESIDENT_ID = '11111111-1111-4111-8111-111111111111';
const PAYMENT = { id: 'pay-1' };

function supabaseWith(phone: string | null) {
  return {
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'insert']) c[m] = vi.fn(() => c);
      if (table === 'payment_records') {
        c.single = vi.fn().mockResolvedValue({ data: PAYMENT, error: null });
      } else {
        c.single = vi.fn().mockResolvedValue({
          data: { first_name: 'Ada', last_name: 'Obi', resident_code: 'R-1', phone_primary: phone },
          error: null,
        });
      }
      return c;
    }),
  };
}

const INPUT = {
  resident_id: RESIDENT_ID,
  amount: 25000,
  payment_date: new Date('2026-10-01T00:00:00Z'),
  status: 'paid' as const,
  method: 'bank_transfer' as const,
  reference_number: 'REF-9',
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authorizePermission.mockResolvedValue({ authorized: true });
  mocks.allocateWalletToInvoices.mockResolvedValue({ success: true, invoicesPaid: 0, totalAllocated: 0 });
  mocks.addToQueue.mockResolvedValue({ success: true });
  mocks.shouldSendToResident.mockResolvedValue({ shouldSend: true });
  mocks.isWhatsAppOptedIn.mockResolvedValue(true);
  mocks.isEventChannelEnabled.mockResolvedValue(true);
  mocks.createServerSupabaseClient.mockResolvedValue(supabaseWith('+2348000000000'));
});

describe('createPaymentCore payment date (#1057)', () => {
  it('stores and allocates the Lagos day for a payment at 00:30 Lagos', async () => {
    const supabase = supabaseWith('+2348000000000');
    mocks.createServerSupabaseClient.mockResolvedValue(supabase);
    await createPaymentCore({ ...INPUT, payment_date: new Date('2026-10-01T23:30:00Z') });
    const recordCall = supabase.from.mock.calls.findIndex(([table]) => table === 'payment_records');
    const insert = (supabase.from.mock.results[recordCall].value as { insert: ReturnType<typeof vi.fn> }).insert;
    expect(insert.mock.calls[0][0].payment_date).toBe('2026-10-02');
    expect(mocks.allocateWalletToInvoices.mock.calls[0][2]).toBe('2026-10-02');
  });
});

describe('createPaymentCore WhatsApp trigger (#6)', () => {
  it('queues a payment_received WhatsApp item for an eligible resident', async () => {
    const result = await createPaymentCore(INPUT);

    expect(result.success).toBe(true);
    expect(mocks.shouldSendToResident).toHaveBeenCalledWith({
      residentId: RESIDENT_ID,
      category: 'payment',
      channel: 'whatsapp',
    });
    expect(mocks.isWhatsAppOptedIn).toHaveBeenCalledWith(RESIDENT_ID, '+2348000000000');
    expect(mocks.addToQueue).toHaveBeenCalledTimes(1);
    const queued = mocks.addToQueue.mock.calls[0][0];
    expect(queued).toMatchObject({
      recipient_id: RESIDENT_ID,
      recipient_phone: '+2348000000000',
      channel: 'whatsapp',
      deduplication_key: 'payment_received:pay-1',
    });
    expect(queued.metadata.whatsapp_template.name).toBe('payment_received');
    expect(queued.metadata.whatsapp_template.parameters).toEqual(
      expect.arrayContaining(['Ada Obi', 'REF-9'])
    );
  });

  it('queues nothing when preferences exclude WhatsApp, but the payment still succeeds', async () => {
    mocks.shouldSendToResident.mockResolvedValue({ shouldSend: false, reason: 'disabled' });

    const result = await createPaymentCore(INPUT);

    expect(result.success).toBe(true);
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });

  it('queues nothing when the resident has no phone number', async () => {
    mocks.createServerSupabaseClient.mockResolvedValue(supabaseWith(null));

    const result = await createPaymentCore(INPUT);

    expect(result.success).toBe(true);
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });

  it('queues nothing for a resident who has not opted in, but the payment still succeeds', async () => {
    mocks.isWhatsAppOptedIn.mockResolvedValue(false);

    const result = await createPaymentCore(INPUT);

    expect(result.success).toBe(true);
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });

  it('queues nothing when the admin has switched the receipt WhatsApp channel off (#909)', async () => {
    mocks.isEventChannelEnabled.mockResolvedValue(false);

    const result = await createPaymentCore(INPUT);

    expect(mocks.isEventChannelEnabled).toHaveBeenCalledWith('payment_receipt', 'whatsapp');
    expect(result.success).toBe(true);
    expect(mocks.addToQueue).not.toHaveBeenCalled();
  });
});
