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
  residentHasHouse: vi.fn(),
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
vi.mock('@/lib/payments/house-membership', () => ({ residentHasHouse: mocks.residentHasHouse }));
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

type HouseLookup = { data: { house_id: string }[] | null; error: { message: string } | null } | Error;

function adminClient(houseLookup: HouseLookup = { data: [], error: null }) {
  const inserts: Record<string, unknown>[] = [];
  const houseLookupEqs: unknown[][] = [];
  const client = {
    inserts,
    houseLookupEqs,
    rpc: vi.fn().mockResolvedValue({ data: { success: true, new_balance: 25000, wallet_id: 'wallet-1' }, error: null }),
    from: vi.fn((table: string) => {
      const c: Record<string, unknown> = {};
      for (const m of ['select', 'eq']) c[m] = vi.fn(() => c);
      if (table === 'resident_houses') {
        // The active-house lookup (#1363) awaits the query after its eq filters.
        c.eq = vi.fn((...args: unknown[]) => {
          houseLookupEqs.push(args);
          return c;
        });
        c.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
          houseLookup instanceof Error ? reject(houseLookup) : resolve(houseLookup);
      }
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
  mocks.residentHasHouse.mockResolvedValue({ ok: true });
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

describe('house for a payment with no house given (#1363)', () => {
  const HOUSE_A = '33333333-3333-4333-8333-333333333333';
  const HOUSE_B = '44444444-4444-4444-8444-444444444444';

  function useAdmin(houseLookup: HouseLookup) {
    admin = adminClient(houseLookup);
    mocks.createAdminClient.mockReturnValue(admin);
  }

  it('uses the one active house for the insert and the audit, but settles on the input house', async () => {
    useAdmin({ data: [{ house_id: HOUSE_A }], error: null });

    const result = await createPaymentAsSystem(INPUT, SOURCE);

    expect(result.success).toBe(true);
    expect(admin.houseLookupEqs).toEqual([['resident_id', RESIDENT_ID], ['is_active', true]]);
    expect(admin.inserts[0].house_id).toBe(HOUSE_A);
    // Invoices on a past house must still be payable, so settlement is not scoped to the derived house.
    expect(mocks.eligibleSettlementInvoiceIds).toHaveBeenCalledWith(admin, expect.objectContaining({ houseId: undefined }));
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(admin, expect.objectContaining({ p_house_id: null }));
    expect(mocks.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ entityType: 'payments', newValues: expect.objectContaining({ house_id: HOUSE_A }) }),
      expect.anything()
    );
  });

  it('keeps no house when the resident has no active house', async () => {
    useAdmin({ data: [], error: null });

    await createPaymentAsSystem(INPUT, SOURCE);

    expect(admin.inserts[0].house_id).toBeUndefined();
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(admin, expect.objectContaining({ p_house_id: null }));
  });

  it('keeps no house when the resident has several active houses', async () => {
    useAdmin({ data: [{ house_id: HOUSE_A }, { house_id: HOUSE_B }], error: null });

    await createPaymentAsSystem(INPUT, SOURCE);

    expect(admin.inserts[0].house_id).toBeUndefined();
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(admin, expect.objectContaining({ p_house_id: null }));
  });

  it('keeps an explicit house, checked for membership, without the lookup', async () => {
    useAdmin({ data: [{ house_id: HOUSE_A }], error: null });

    await createPaymentAsSystem({ ...INPUT, house_id: HOUSE_B }, SOURCE);

    expect(mocks.residentHasHouse).toHaveBeenCalledWith(admin, RESIDENT_ID, HOUSE_B);
    expect(admin.houseLookupEqs).toEqual([]);
    expect(admin.inserts[0].house_id).toBe(HOUSE_B);
    expect(mocks.callWalletPaymentRpc).toHaveBeenCalledWith(admin, expect.objectContaining({ p_house_id: HOUSE_B }));
  });

  it('still refuses an explicit house that is not the resident\'s', async () => {
    mocks.residentHasHouse.mockResolvedValue({ ok: false, error: 'The selected house is not associated with this resident' });

    const result = await createPaymentAsSystem({ ...INPUT, house_id: HOUSE_B }, SOURCE);

    expect(result.error).toBe('The selected house is not associated with this resident');
    expect(admin.inserts).toEqual([]);
  });

  it.each([
    ['returns an error', { data: null, error: { message: 'boom' } }],
    ['throws', new Error('network down')],
  ] as const)('creates the payment with no house, and logs, when the lookup %s', async (_label, houseLookup) => {
    useAdmin(houseLookup);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await createPaymentAsSystem(INPUT, SOURCE);

    expect(result.success).toBe(true);
    expect(admin.inserts[0].house_id).toBeUndefined();
    expect(consoleError).toHaveBeenCalledWith('Payment house lookup failed for resident', RESIDENT_ID, expect.anything());
    consoleError.mockRestore();
  });
});
