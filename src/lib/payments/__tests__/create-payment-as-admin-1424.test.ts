/**
 * #1424: WhatsApp Admin tools record a payment with no web session. The audit entry and the wallet
 * credit name the admin as actor (not a system actor), with channel whatsapp_admin; the payment is verified.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  recordAudit: vi.fn(),
  settlePaymentBatch: vi.fn(),
  creditWalletAsService: vi.fn(),
  inserted: [] as Record<string, unknown>[],
}));

vi.mock('@/lib/supabase/server', () => ({ createAdminClient: mocks.createAdminClient, createServerSupabaseClient: vi.fn() }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/billing/settle-payment', () => ({ settlePaymentBatch: mocks.settlePaymentBatch, creditWalletAsService: mocks.creditWalletAsService }));
vi.mock('@/actions/billing/wallet', () => ({ allocateWalletToInvoices: vi.fn() }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/notifications/event-content', () => ({ isEventChannelEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn(), PRIORITY: { NORMAL: 5 } }));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: vi.fn() }));
vi.mock('@/lib/notifications/preferences', () => ({ shouldSendToResident: vi.fn() }));
vi.mock('@/lib/payments/house-membership', () => ({ residentHasHouse: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('@/lib/matching/duplicate-matcher', () => ({ checkDuplicateGuardrail: vi.fn().mockResolvedValue({ isDuplicate: false }) }));

import { createPaymentAsAdmin, createPaymentAsSystem } from '../create-payment';

const RESIDENT_ID = '11111111-1111-4111-8111-111111111111';
const HOUSE_ID = '22222222-2222-4222-8222-222222222222';

function supabase() {
  return {
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) c[m] = vi.fn(() => c);
      c.insert = vi.fn((row: Record<string, unknown>) => {
        mocks.inserted.push(row);
        return c;
      });
      c.single = vi.fn().mockResolvedValue(
        table === 'payment_records'
          ? { data: { id: 'pay-1' }, error: null }
          : { data: { first_name: 'ADA', last_name: 'OBI', house_number: '4' }, error: null }
      );
      return c;
    }),
  };
}

const INPUT = {
  resident_id: RESIDENT_ID,
  house_id: HOUSE_ID,
  amount: 65000,
  payment_date: new Date('2026-11-02T08:00:00Z'),
  status: 'paid' as const,
  method: 'bank_transfer' as const,
  is_verified: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.inserted = [];
  mocks.createAdminClient.mockImplementation(() => supabase());
  // The settlement credits the wallet through the callback it is given.
  mocks.settlePaymentBatch.mockImplementation(async (_client, _target, _batch, credit) => {
    await credit(65000);
    return { success: true, invoicesPaid: 0, totalAllocated: 0 };
  });
  mocks.creditWalletAsService.mockResolvedValue({ success: true, error: null });
  mocks.recordAudit.mockResolvedValue({ recorded: true });
});

describe('createPaymentAsAdmin (#1424)', () => {
  it('records the payment verified, with the admin as actor and channel whatsapp_admin', async () => {
    const result = await createPaymentAsAdmin(INPUT, 'chair-1', { channel: 'whatsapp_admin' });
    expect(result).toEqual(expect.objectContaining({ success: true }));
    expect(mocks.inserted[0]).toEqual(expect.objectContaining({ is_verified: true, house_id: HOUSE_ID }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CREATE', entityType: 'payments', metadata: { channel: 'whatsapp_admin' } }),
      { userId: 'chair-1' }
    );
    expect(mocks.creditWalletAsService).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ residentId: RESIDENT_ID, paymentId: 'pay-1' }), { userId: 'chair-1' });
  });

  it('keeps the system actor for the scheduled job', async () => {
    await createPaymentAsSystem(INPUT, 'cron:fetch-emails');
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { source: 'cron:fetch-emails' } }),
      { userId: null, system: 'cron:fetch-emails' }
    );
  });
});
