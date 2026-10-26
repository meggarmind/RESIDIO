import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * #1195: collections intake actions. The collection helpers, the payment core and the database are
 * mocked; the tests cover the permission checks, the split arithmetic and what each action writes.
 */

const h = vi.hoisted(() => ({
  authorizePermission: vi.fn(),
  logAudit: vi.fn(),
  createAdminClient: vi.fn(),
  createServerSupabaseClient: vi.fn(),
  resolveCollectionParts: vi.fn(),
  postCollectionParts: vi.fn(),
  reverseCollectionParts: vi.fn(),
  noticePostedParts: vi.fn(),
  findOrCreatePayer: vi.fn(),
  createPaymentCore: vi.fn(),
  residentHasHouse: vi.fn(),
  eligibleSettlementInvoiceIds: vi.fn(),
}));

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: h.authorizePermission }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: h.logAudit }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: h.createAdminClient, createServerSupabaseClient: h.createServerSupabaseClient }));
vi.mock('@/lib/collections/intake', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/collections/intake')>()),
  resolveCollectionParts: h.resolveCollectionParts,
  postCollectionParts: h.postCollectionParts,
  reverseCollectionParts: h.reverseCollectionParts,
  noticePostedParts: h.noticePostedParts,
}));
vi.mock('@/lib/collections/payers', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/collections/payers')>()),
  findOrCreatePayer: h.findOrCreatePayer,
}));
vi.mock('@/lib/payments/create-payment', () => ({ createPaymentCore: h.createPaymentCore }));
vi.mock('@/lib/payments/house-membership', () => ({ residentHasHouse: h.residentHasHouse }));
vi.mock('@/lib/billing/eligible-invoices', () => ({ eligibleSettlementInvoiceIds: h.eligibleSettlementInvoiceIds }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import {
  assignBankRowToCollections,
  moveCollectionPaymentToBilling,
  movePaymentToCollection,
  recordSplitPayment,
} from '@/actions/collections/intake';
import { PERMISSIONS } from '@/lib/auth/action-roles';

const ROW = '11111111-1111-4111-8111-111111111111';
const RESIDENT = '22222222-2222-4222-8222-222222222222';
const COLLECTION = '33333333-3333-4333-8333-333333333333';
const PAYMENT = '44444444-4444-4444-8444-444444444444';
const COLLECTION_PAYMENT = '55555555-5555-4555-8555-555555555555';
const PAYER = '66666666-6666-4666-8666-666666666666';

/** Reads return tables[table]; updates are recorded. Every chain method returns the chain. */
function fakeDb(tables: Record<string, unknown>) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const rpc = vi.fn(async () => ({ data: rpcResult, error: rpcError }));
  let rpcResult: unknown = null;
  let rpcError: { message: string } | null = null;
  const client = {
    rpc,
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const m of ['select', 'eq', 'in', 'is', 'order']) chain[m] = () => chain;
      chain.update = (values: Record<string, unknown>) => (updates.push({ table, values }), chain);
      const result = () => ({ data: tables[table] ?? null, error: null });
      chain.single = async () => result();
      chain.maybeSingle = async () => result();
      chain.then = (res: (v: unknown) => unknown) => Promise.resolve(result()).then(res);
      return chain;
    },
  };
  return {
    client,
    updates,
    setRpc(data: unknown, error: { message: string } | null = null) {
      rpcResult = data;
      rpcError = error;
    },
  };
}

const part = (amount: number) => ({ collection_id: COLLECTION, payer_id: PAYER, house_id: null, quantity: null, unit_price: null, amount });

beforeEach(() => {
  vi.clearAllMocks();
  h.authorizePermission.mockResolvedValue({ authorized: true, userId: 'user-1' });
  h.logAudit.mockResolvedValue(undefined);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('assignBankRowToCollections', () => {
  function setup(amount = 5000) {
    const server = fakeDb({
      bank_statement_rows: { id: ROW, import_id: 'imp', amount, transaction_type: 'credit', transaction_date: '2026-11-20' },
      bank_statement_imports: { status: 'processing' },
    });
    const admin = fakeDb({ charge_categories: { code: 'dues' } });
    h.createServerSupabaseClient.mockResolvedValue(server.client);
    h.createAdminClient.mockReturnValue(admin.client);
    return server;
  }
  const input = (billing: { charge_category: string } | null = null) => ({
    row_id: ROW,
    payer: { kind: 'resident' as const, resident_id: RESIDENT },
    parts: [{ collection_id: COLLECTION, amount: 2000 }],
    billing,
  });

  it('needs both imports.review and collections.manage', async () => {
    setup();
    h.authorizePermission.mockImplementation(async (permission: string) =>
      permission === PERMISSIONS.COLLECTIONS_MANAGE ? { authorized: false, error: 'Forbidden' } : { authorized: true, userId: 'user-1' }
    );
    expect(await assignBankRowToCollections(input())).toEqual({ data: null, error: 'Forbidden' });
    expect(h.resolveCollectionParts).not.toHaveBeenCalled();
  });

  it('marks a whole line Collection: no resident, so the import never credits a wallet', async () => {
    const server = setup(5000);
    h.resolveCollectionParts.mockResolvedValue({ parts: [part(5000)] });

    const res = await assignBankRowToCollections(input());

    expect(res).toEqual({ data: { billing_amount: 0 }, error: null });
    expect(server.updates).toEqual([{
      table: 'bank_statement_rows',
      values: expect.objectContaining({ status: 'matched', matched_resident_id: null, matched_charge_category: null, collection_parts: [part(5000)] }),
    }]);
    expect(h.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'ASSIGN', entityId: ROW }));
  });

  it('refuses parts that do not add up to the bank amount without a billing part', async () => {
    const server = setup(5000);
    h.resolveCollectionParts.mockResolvedValue({ parts: [part(4999.99)] });
    expect((await assignBankRowToCollections(input())).error).toMatch(/must add up to the bank amount/);
    h.resolveCollectionParts.mockResolvedValue({ parts: [part(5000.01)] });
    expect((await assignBankRowToCollections(input())).error).toMatch(/more than the bank amount/);
    expect(server.updates).toEqual([]);
  });

  it('splits a line: the rest goes to the resident payer in the chosen category', async () => {
    const server = setup(5000);
    h.resolveCollectionParts.mockResolvedValue({ parts: [part(1500.5)] });

    const res = await assignBankRowToCollections(input({ charge_category: 'dues' }));

    expect(res.data).toEqual({ billing_amount: 3499.5 });
    expect(server.updates[0].values).toMatchObject({ matched_resident_id: RESIDENT, matched_charge_category: 'dues' });
  });

  it('refuses a billing part for a non-resident payer, and a split with nothing left for billing', async () => {
    setup(5000);
    expect((await assignBankRowToCollections({ ...input({ charge_category: 'dues' }), payer: { kind: 'non_resident', full_name: 'Mr B' } })).error)
      .toMatch(/Only a resident payer/);
    h.resolveCollectionParts.mockResolvedValue({ parts: [part(5000)] });
    expect((await assignBankRowToCollections(input({ charge_category: 'dues' }))).error).toMatch(/no billing part/);
  });

  it('refuses a debit line', async () => {
    const server = setup();
    server.client.from = ((original) => (table: string) => {
      const chain = original(table) as Record<string, unknown>;
      if (table === 'bank_statement_rows') chain.single = async () => ({ data: { id: ROW, import_id: 'imp', amount: 10, transaction_type: 'debit' }, error: null });
      return chain;
    })(server.client.from.bind(server.client));
    expect((await assignBankRowToCollections(input())).error).toMatch(/Only money received/);
  });
});

describe('recordSplitPayment', () => {
  const payment = {
    resident_id: RESIDENT,
    amount: 10000,
    payment_date: new Date('2026-11-20T10:00:00Z'),
    status: 'paid' as const,
    method: 'bank_transfer' as const,
    reference_number: 'REF-7',
    charge_category: 'dues',
    is_verified: true,
    bank_row_id: ROW,
  };

  beforeEach(() => {
    h.createAdminClient.mockReturnValue(fakeDb({}).client);
    h.resolveCollectionParts.mockResolvedValue({ parts: [part(2500)] });
    h.postCollectionParts.mockResolvedValue({ posted: [{ id: 'cp-1', receipt_number: 'COL-2026-000001', amount: 2500 }] });
  });

  it('records the collection part and the rest as a billing payment in one split group', async () => {
    h.createPaymentCore.mockResolvedValue({ success: true, data: { id: PAYMENT } });

    const res = await recordSplitPayment(payment, [{ collection_id: COLLECTION, amount: 2500 }]);

    expect(res.collectionReceipts).toEqual(['COL-2026-000001']);
    const core = h.createPaymentCore.mock.calls[0][0];
    expect(core.amount).toBe(7500);
    expect(core).not.toHaveProperty('is_verified');
    expect(core).not.toHaveProperty('bank_row_id');
    const context = h.postCollectionParts.mock.calls[0][2];
    expect(context.splitPaymentGroupId).toBe(core.split_payment_group_id);
    expect(context).toMatchObject({ method: 'bank_transfer', reference: 'REF-7' });
    expect(h.resolveCollectionParts.mock.calls[0][2].payer).toEqual({ kind: 'resident', resident_id: RESIDENT });
    expect(h.noticePostedParts).toHaveBeenCalled();
  });

  it('reverses the collection part when the billing payment fails', async () => {
    h.createPaymentCore.mockResolvedValue({ error: 'Duplicate Payment Detected: same reference' });

    const res = await recordSplitPayment(payment, [{ collection_id: COLLECTION, amount: 2500 }]);

    expect(res.error).toMatch(/Duplicate/);
    expect(h.reverseCollectionParts).toHaveBeenCalledWith(expect.anything(), [expect.objectContaining({ id: 'cp-1' })], expect.stringMatching(/Billing part not recorded/), 'user-1');
    expect(h.noticePostedParts).not.toHaveBeenCalled();
  });

  it('refuses parts that leave nothing for billing, before writing anything', async () => {
    h.resolveCollectionParts.mockResolvedValue({ parts: [part(10000)] });
    expect((await recordSplitPayment(payment, [{ collection_id: COLLECTION, amount: 10000 }])).error).toMatch(/leave nothing for billing/);
    expect(h.postCollectionParts).not.toHaveBeenCalled();
    expect(h.createPaymentCore).not.toHaveBeenCalled();
  });
});

describe('movePaymentToCollection', () => {
  function setup(collection: Record<string, unknown>) {
    const admin = fakeDb({
      payment_records: { id: PAYMENT, resident_id: RESIDENT, house_id: null, amount: 4000, payment_date: '2026-11-20', status: 'paid' },
      collections: { id: COLLECTION, name: 'Stickers', opens_on: '2026-01-01', closes_on: null, is_active: true, non_resident_price: null, ...collection },
    });
    h.createAdminClient.mockReturnValue(admin.client);
    h.findOrCreatePayer.mockResolvedValue({ id: PAYER, isResident: true });
    return admin;
  }

  it('needs payments.delete', async () => {
    setup({ collection_type: 'contribution', item_price: null });
    h.authorizePermission.mockImplementation(async (permission: string) =>
      permission === PERMISSIONS.PAYMENTS_DELETE ? { authorized: false, error: 'Forbidden' } : { authorized: true, userId: 'user-1' }
    );
    expect((await movePaymentToCollection(PAYMENT, { collection_id: COLLECTION, reason: 'Party' })).error).toBe('Forbidden');
  });

  it('moves the payment in one database call and audits both sides', async () => {
    const admin = setup({ collection_type: 'item_purchase', item_price: 2000 });
    admin.setRpc({ collection_payment_id: COLLECTION_PAYMENT, receipt_number: 'COL-2026-000009', payment: { id: PAYMENT, amount: 4000 } });

    const res = await movePaymentToCollection(PAYMENT, { collection_id: COLLECTION, quantity: 2, reason: 'Stickers' });

    expect(res).toEqual({ data: { collection_payment_id: COLLECTION_PAYMENT, receipt_number: 'COL-2026-000009' }, error: null });
    expect(admin.client.rpc).toHaveBeenCalledWith('move_payment_to_collection', expect.objectContaining({
      p_payment_id: PAYMENT, p_collection_id: COLLECTION, p_payer_id: PAYER, p_quantity: 2, p_unit_price: 2000, p_reason: 'Stickers',
    }));
    expect(h.findOrCreatePayer.mock.calls[0][1]).toEqual({ kind: 'resident', resident_id: RESIDENT });
    expect(h.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'DELETE', entityType: 'payments', entityId: PAYMENT, oldValues: { id: PAYMENT, amount: 4000 } }));
    expect(h.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'collection_payments', entityId: COLLECTION_PAYMENT }));
  });

  it('refuses an item quantity that does not make the payment amount', async () => {
    const admin = setup({ collection_type: 'item_purchase', item_price: 2000 });
    expect((await movePaymentToCollection(PAYMENT, { collection_id: COLLECTION, quantity: 3, reason: 'Stickers' })).error).toMatch(/not the payment amount/);
    expect(admin.client.rpc).not.toHaveBeenCalled();
  });

  it('reports a refusal from the database and audits nothing', async () => {
    const admin = setup({ collection_type: 'contribution', item_price: null });
    admin.setRpc(null, { message: 'Insufficient wallet balance' });
    expect((await movePaymentToCollection(PAYMENT, { collection_id: COLLECTION, reason: 'Party' })).error).toBe('Insufficient wallet balance');
    expect(h.logAudit).not.toHaveBeenCalled();
  });
});

describe('moveCollectionPaymentToBilling', () => {
  it('reverses the collection payment and settles the eligible invoices in one database call', async () => {
    const admin = fakeDb({
      collection_payments: { id: COLLECTION_PAYMENT, collection_id: COLLECTION, receipt_number: 'COL-2026-000002', amount: 3000, payment_date: '2026-11-20', reversed_at: null },
      charge_categories: { code: 'dues' },
    });
    admin.setRpc({ payment_id: PAYMENT });
    h.createAdminClient.mockReturnValue(admin.client);
    h.eligibleSettlementInvoiceIds.mockResolvedValue({ ids: ['inv-1', 'inv-2'], error: null });

    const res = await moveCollectionPaymentToBilling(COLLECTION_PAYMENT, { resident_id: RESIDENT, charge_category: 'dues', reason: 'Was dues' });

    expect(res).toEqual({ data: { payment_id: PAYMENT }, error: null });
    expect(h.eligibleSettlementInvoiceIds).toHaveBeenCalledWith(admin.client, {
      residentId: RESIDENT, houseId: null, chargeCategory: 'dues', settlementDate: '2026-11-20',
    });
    expect(admin.client.rpc).toHaveBeenCalledWith('move_collection_payment_to_billing', expect.objectContaining({
      p_collection_payment_id: COLLECTION_PAYMENT, p_resident_id: RESIDENT, p_invoice_ids: ['inv-1', 'inv-2'], p_reason: 'Was dues',
    }));
    expect(h.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'collection_payments', entityId: COLLECTION_PAYMENT }));
    expect(h.logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'payments', entityId: PAYMENT }));
  });

  it('refuses a house the resident is not linked to', async () => {
    const admin = fakeDb({
      collection_payments: { id: COLLECTION_PAYMENT, amount: 3000, payment_date: '2026-11-20', reversed_at: null },
      charge_categories: { code: 'dues' },
    });
    h.createAdminClient.mockReturnValue(admin.client);
    h.residentHasHouse.mockResolvedValue({ ok: false, error: 'Invalid house for this resident' });

    const res = await moveCollectionPaymentToBilling(COLLECTION_PAYMENT, {
      resident_id: RESIDENT, house_id: '77777777-7777-4777-8777-777777777777', reason: 'Was dues',
    });

    expect(res.error).toBe('Invalid house for this resident');
    expect(admin.client.rpc).not.toHaveBeenCalled();
  });
});
