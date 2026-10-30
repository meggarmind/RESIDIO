/**
 * #1340: the session-free payment core used by the scheduled bank-alert run. It must create and
 * allocate a payment exactly as a manual payment does, with the service-role client, no
 * permission check, and an audit entry naming the job as a system actor.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  recordAudit: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  createAdminClient: vi.fn(),
  allocateWalletToInvoices: vi.fn(),
  eligibleSettlementInvoiceIds: vi.fn(),
  callWalletPaymentRpc: vi.fn(),
  checkDuplicateGuardrail: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: mocks.createServerSupabaseClient,
  createAdminClient: mocks.createAdminClient,
}));
vi.mock('@/actions/billing/wallet', () => ({ allocateWalletToInvoices: mocks.allocateWalletToInvoices }));
vi.mock('@/lib/billing/eligible-invoices', () => ({ eligibleSettlementInvoiceIds: mocks.eligibleSettlementInvoiceIds }));
vi.mock('@/lib/billing/wallet-payment-rpc', () => ({ callWalletPaymentRpc: mocks.callWalletPaymentRpc }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: mocks.logAudit }));
vi.mock('@/lib/audit/recorder', () => ({ recordAudit: mocks.recordAudit }));
vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: mocks.authorizePermission }));
vi.mock('@/lib/matching/duplicate-matcher', () => ({ checkDuplicateGuardrail: mocks.checkDuplicateGuardrail }));
vi.mock('@/lib/payments/house-membership', () => ({ residentHasHouse: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock('@/lib/notifications/event-content', () => ({ isEventChannelEnabled: vi.fn().mockResolvedValue(false) }));
vi.mock('@/lib/notifications/preferences', () => ({ shouldSendToResident: vi.fn() }));
vi.mock('@/lib/whatsapp/opt-in', () => ({ isWhatsAppOptedIn: vi.fn() }));
vi.mock('@/lib/notifications/queue', () => ({ addToQueue: vi.fn(), PRIORITY: {} }));

import { createPaymentAsSystem } from '../create-payment';

const RESIDENT_ID = '11111111-1111-4111-8111-111111111111';
const TX_ID = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'cron:fetch-emails';

const INPUT = {
  resident_id: RESIDENT_ID,
  amount: 25000,
  payment_date: new Date('2026-10-01T10:00:00Z'),
  status: 'paid' as const,
  method: 'bank_transfer' as const,
  reference_number: 'REF-9',
  email_transaction_id: TX_ID,
  is_verified: true,
};

function adminClient() {
  const inserts: Record<string, unknown>[] = [];
  const client = {
    inserts,
    rpc: vi.fn().mockResolvedValue({ data: { success: true, new_balance: 25000, wallet_id: 'wallet-1' }, error: null }),
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) c[m] = vi.fn(() => c);
      c.insert = vi.fn((row: Record<string, unknown>) => {
        inserts.push(row);
        return c;
      });
      c.single = vi.fn().mockResolvedValue(
        table === 'payment_records'
          ? { data: { id: 'pay-1' }, error: null }
          : { data: { first_name: 'Ada', last_name: 'Obi' }, error: null }
      );
      return c;
    }),
  };
  return client;
}

let admin: ReturnType<typeof adminClient>;

beforeEach(() => {
  vi.clearAllMocks();
  admin = adminClient();
  mocks.createAdminClient.mockReturnValue(admin);
  mocks.createServerSupabaseClient.mockRejectedValue(new Error('no session in cron'));
  mocks.authorizePermission.mockResolvedValue({ authorized: false, error: 'Unauthorized' });
  mocks.checkDuplicateGuardrail.mockResolvedValue({ isDuplicate: false });
  mocks.eligibleSettlementInvoiceIds.mockResolvedValue({ ids: ['inv-1'], error: null });
  mocks.callWalletPaymentRpc.mockResolvedValue({
    data: { success: true, total_allocated: 25000, allocations: [{ status_after: 'paid' }] },
    error: null,
  });
  mocks.recordAudit.mockResolvedValue({ recorded: true });
});

describe('createPaymentAsSystem (#1340)', () => {
  it('creates a verified payment with the service-role client and no session or permission check', async () => {
    const result = await createPaymentAsSystem(INPUT, SOURCE);

    expect(result).toMatchObject({ success: true, data: { id: 'pay-1' } });
    expect(mocks.authorizePermission).not.toHaveBeenCalled();
    expect(mocks.createServerSupabaseClient).not.toHaveBeenCalled();
    expect(admin.inserts[0]).toMatchObject({
      resident_id: RESIDENT_ID,
      amount: 25000,
      payment_date: '2026-10-01',
      email_transaction_id: TX_ID,
      is_verified: true,
    });
    expect(admin.inserts[0].verified_at).toEqual(expect.any(String));
  });

  it('allocates to open invoices through the same settlement RPC as a manual payment, with the service role', async () => {
    await createPaymentAsSystem(INPUT, SOURCE);

    expect(mocks.allocateWalletToInvoices).not.toHaveBeenCalled();
    expect(mocks.eligibleSettlementInvoiceIds).toHaveBeenCalledWith(admin, expect.objectContaining({
      residentId: RESIDENT_ID, chargeCategory: 'dues', settlementDate: '2026-10-01',
    }));
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(admin, expect.objectContaining({
      p_resident_id: RESIDENT_ID,
      p_invoice_ids: ['inv-1'],
      p_batch_type: 'payment_received',
      p_source_payment_id: 'pay-1',
      p_credit_amount: 25000,
      p_batch_amount: 25000,
      p_charge_category: 'dues',
    }));
  });

  it('credits the wallet with the service role, audited as the job, when no invoice is open', async () => {
    mocks.eligibleSettlementInvoiceIds.mockResolvedValue({ ids: [], error: null });

    await createPaymentAsSystem(INPUT, SOURCE);

    expect(mocks.callWalletPaymentRpc).not.toHaveBeenCalled();
    expect(admin.rpc).toHaveBeenCalledWith('adjust_wallet_credit', expect.objectContaining({
      p_resident_id: RESIDENT_ID, p_amount: 25000, p_reference_type: 'payment', p_reference_id: 'pay-1', p_charge_category: 'dues',
    }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'wallets', entityId: 'wallet-1' }),
      { userId: null, system: SOURCE }
    );
  });

  it('audits the payment with the system actor and the source, never the session logger', async () => {
    await createPaymentAsSystem(INPUT, SOURCE);

    expect(mocks.logAudit).not.toHaveBeenCalled();
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CREATE',
        entityType: 'payments',
        entityId: 'pay-1',
        metadata: { source: SOURCE },
      }),
      { userId: null, system: SOURCE }
    );
  });

  it('keeps the duplicate guard, read with the service-role client', async () => {
    mocks.checkDuplicateGuardrail.mockResolvedValue({ isDuplicate: true, reason: 'Duplicate reference number: REF-9' });

    const result = await createPaymentAsSystem(INPUT, SOURCE);

    expect(result.error).toBe('Duplicate Payment Detected: Duplicate reference number: REF-9');
    expect(admin.inserts).toEqual([]);
    expect(mocks.checkDuplicateGuardrail).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 25000, reference: 'REF-9', residentId: RESIDENT_ID }),
      'payment',
      { client: admin }
    );
  });

  it('keeps input validation', async () => {
    const result = await createPaymentAsSystem({ ...INPUT, amount: -5 }, SOURCE);
    expect(result.error).toBe('Invalid data');
    expect(admin.inserts).toEqual([]);
  });
});
