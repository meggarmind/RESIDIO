import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { queueCollectionPaymentNotices } from '@/lib/collections/notify';
import {
  addCollectionNotifiedParty,
  createCollection,
  getCollection,
  getCollections,
  recordCollectionPayment,
  removeCollectionNotifiedParty,
  reverseCollectionPayment,
  setCollectionItemGiven,
  updateCollection,
} from '../collections';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(), getChangedValues: vi.fn(() => ({ old: {}, new: {} })) }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/collections/notify', () => ({ queueCollectionPaymentNotices: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const COLLECTION_ID = '11111111-1111-4111-8111-111111111111';
const RESIDENT_ID = '22222222-2222-4222-8222-222222222222';
const PAYMENT_ID = '33333333-3333-4333-8333-333333333333';
const authorized = { authorized: true, userId: 'admin-1', error: null };

type Result = { data?: unknown; error?: unknown };

function query(result: Result) {
  const chain = {} as Record<string, ReturnType<typeof vi.fn>>;
  for (const method of ['select', 'insert', 'update', 'delete', 'eq', 'in', 'is', 'or', 'order', 'limit']) chain[method] = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue(result);
  chain.maybeSingle = vi.fn().mockResolvedValue(result);
  chain.then = vi.fn((resolve: (value: unknown) => unknown) => Promise.resolve(resolve(result)));
  return chain;
}

function client(tables: Record<string, Result[]>) {
  const chains: Record<string, ReturnType<typeof query>[]> = {};
  const from = vi.fn((table: string) => {
    const next = tables[table]?.shift();
    if (!next) throw new Error(`unexpected query on ${table}`);
    const chain = query(next);
    (chains[table] ||= []).push(chain);
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as never);
  return { chains, from };
}

const itemCollection = {
  id: COLLECTION_ID, name: 'Estate Constitution Pocket Book', description: null, collection_type: 'item_purchase',
  opens_on: '2026-01-01', closes_on: null, target_amount: null, item_price: 2000, non_resident_price: null, is_active: true, created_at: '',
};
const contribution = { ...itemCollection, name: 'End of Year Party', collection_type: 'contribution', item_price: null, target_amount: 500000 };

const recorded = (extra: Record<string, unknown> = {}) => ({
  data: {
    id: PAYMENT_ID, collection_id: COLLECTION_ID, payer_id: 'payer-1', house_id: null, quantity: 2, unit_price: 2000, amount: 4000,
    payment_date: '2026-10-26', method: 'cash', reference: null, receipt_number: 'COL-2026-000001',
    payer: { id: 'payer-1', resident_id: null, full_name: 'Mr B', phone: null, email: null, resident: null }, ...extra,
  },
  error: null,
});

const basePayment = {
  collection_id: COLLECTION_ID,
  payment_date: '2026-10-26',
  method: 'cash' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorizePermission).mockResolvedValue(authorized as never);
  vi.mocked(logAudit).mockResolvedValue(undefined);
  vi.mocked(queueCollectionPaymentNotices).mockResolvedValue({ queued: 1, skipped: [] });
});

describe('collections permission gating (#1194)', () => {
  it.each([
    ['createCollection', () => createCollection({ name: 'X', collection_type: 'contribution', opens_on: '2026-01-01' })],
    ['updateCollection', () => updateCollection(COLLECTION_ID, { name: 'X', collection_type: 'contribution', opens_on: '2026-01-01' })],
    ['recordCollectionPayment', () => recordCollectionPayment({ ...basePayment, payer: { kind: 'resident', resident_id: RESIDENT_ID } })],
    ['setCollectionItemGiven', () => setCollectionItemGiven(PAYMENT_ID, true)],
    ['reverseCollectionPayment', () => reverseCollectionPayment(PAYMENT_ID, 'wrong')],
    ['addCollectionNotifiedParty', () => addCollectionNotifiedParty(COLLECTION_ID, { name: 'A', email: 'a@x.ng', channels: ['email'] })],
    ['removeCollectionNotifiedParty', () => removeCollectionNotifiedParty('party-1')],
  ])('%s needs collections.manage and touches nothing when denied', async (_name, call) => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(call()).resolves.toEqual({ data: null, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith('collections.manage');
    expect(createAdminClient).not.toHaveBeenCalled();
    expect(logAudit).not.toHaveBeenCalled();
  });

  it.each([
    ['getCollections', () => getCollections()],
    ['getCollection', () => getCollection(COLLECTION_ID)],
  ])('%s needs collections.view', async (_name, call) => {
    vi.mocked(authorizePermission).mockResolvedValue({ authorized: false, error: 'Forbidden' } as never);
    await expect(call()).resolves.toEqual({ data: null, error: 'Forbidden' });
    expect(authorizePermission).toHaveBeenCalledWith('collections.view');
    expect(createAdminClient).not.toHaveBeenCalled();
  });
});

describe('recording a collection payment (#1194)', () => {
  it('records a non-resident payer and prices an item purchase as quantity x price', async () => {
    const { chains, from } = client({
      collections: [{ data: itemCollection, error: null }],
      collection_payers: [{ data: [], error: null }, { data: { id: 'payer-1' }, error: null }],
      collection_payments: [recorded()],
    });

    const result = await recordCollectionPayment({
      ...basePayment,
      payer: { kind: 'non_resident', full_name: 'Mr B', phone: '0803 123 4567', email: '' },
      quantity: 2,
      amount: 1,
    });

    expect(result).toEqual({ data: { id: PAYMENT_ID, receipt_number: 'COL-2026-000001', notices: { queued: 1, skipped: [] } }, error: null });
    expect(chains.collection_payers[1].insert).toHaveBeenCalledWith({ full_name: 'Mr B', phone: '+2348031234567', email: null, created_by: 'admin-1' });
    expect(chains.collection_payments[0].insert).toHaveBeenCalledWith(expect.objectContaining({ payer_id: 'payer-1', quantity: 2, unit_price: 2000, amount: 4000 }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'collection_payments', entityId: PAYMENT_ID }));
    expect(queueCollectionPaymentNotices).toHaveBeenCalledWith(PAYMENT_ID);
    // Collections never touch wallets, invoices or payment records.
    const tables = from.mock.calls.map(([table]) => table);
    expect(tables.filter((table) => !table.startsWith('collection'))).toEqual([]);
  });

  it('reuses an earlier non-resident payer with the same phone', async () => {
    const { chains } = client({
      collections: [{ data: itemCollection, error: null }],
      collection_payers: [{ data: [{ id: 'payer-9' }], error: null }],
      collection_payments: [recorded({ payer_id: 'payer-9' })],
    });
    await recordCollectionPayment({ ...basePayment, payer: { kind: 'non_resident', full_name: 'Mr B', phone: '08031234567' }, quantity: 1 });
    expect(chains.collection_payers[0].or).toHaveBeenCalledWith('phone.eq.+2348031234567');
    expect(chains.collection_payments[0].insert).toHaveBeenCalledWith(expect.objectContaining({ payer_id: 'payer-9' }));
  });

  it('a resident payer gets one payer row, and a contribution keeps the chosen amount', async () => {
    const { chains } = client({
      collections: [{ data: contribution, error: null }],
      residents: [{ data: { id: RESIDENT_ID }, error: null }],
      collection_payers: [{ data: null, error: null }, { data: { id: 'payer-2' }, error: null }],
      collection_payments: [recorded({ quantity: null, unit_price: null, amount: 15000 })],
    });
    await recordCollectionPayment({ ...basePayment, payer: { kind: 'resident', resident_id: RESIDENT_ID }, amount: 15000, quantity: 3 });
    expect(chains.collection_payers[1].insert).toHaveBeenCalledWith({ resident_id: RESIDENT_ID, created_by: 'admin-1' });
    expect(chains.collection_payments[0].insert).toHaveBeenCalledWith(expect.objectContaining({ quantity: null, unit_price: null, amount: 15000 }));
  });

  it('saves a notified party on the payment for an item purchase, and audits it', async () => {
    const { chains } = client({
      collections: [{ data: itemCollection, error: null }],
      collection_payers: [{ data: { id: 'payer-1' }, error: null }],
      collection_payments: [recorded()],
      collection_notified_parties: [{ data: { id: 'party-1' }, error: null }],
    });
    await recordCollectionPayment({
      ...basePayment,
      payer: { kind: 'non_resident', full_name: 'Mr B' },
      quantity: 2,
      notified_party: { name: 'Fleet manager', email: 'fleet@co.ng', channels: ['email'] },
    });
    expect(chains.collection_notified_parties[0].insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Fleet manager', email: 'fleet@co.ng', channels: ['email'], collection_payment_id: PAYMENT_ID }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ entityType: 'collection_notified_parties', entityId: 'party-1' }));
  });

  it('refuses a notified party on a contribution, before any payer is written', async () => {
    const { from } = client({ collections: [{ data: contribution, error: null }] });
    const result = await recordCollectionPayment({
      ...basePayment,
      payer: { kind: 'non_resident', full_name: 'Mr B' },
      amount: 100,
      notified_party: { name: 'X', email: 'x@x.ng', channels: ['email'] },
    });
    expect(result.error).toBe('A notified party can be added to an item purchase only');
    expect(from).toHaveBeenCalledTimes(1);
  });

  it('refuses a payment into a closed collection or dated after it closes', async () => {
    client({ collections: [{ data: { ...itemCollection, is_active: false }, error: null }] });
    expect((await recordCollectionPayment({ ...basePayment, payer: { kind: 'non_resident', full_name: 'B' }, quantity: 1 })).error).toBe('This collection is closed to new payments');
    client({ collections: [{ data: { ...itemCollection, closes_on: '2026-10-01' }, error: null }] });
    expect((await recordCollectionPayment({ ...basePayment, payer: { kind: 'non_resident', full_name: 'B' }, quantity: 1 })).error).toBe('The payment date is after the collection closes');
  });
});

describe('item given and reversal (#1194)', () => {
  it('marks items given and audits the change', async () => {
    const { chains } = client({
      collection_payments: [
        { data: { id: PAYMENT_ID, collection_id: COLLECTION_ID, receipt_number: 'COL-2026-000001', quantity: 2, given_at: null, given_by: null, reversed_at: null }, error: null },
        { data: null, error: null },
      ],
    });
    await expect(setCollectionItemGiven(PAYMENT_ID, true)).resolves.toEqual({ data: { id: PAYMENT_ID }, error: null });
    expect(chains.collection_payments[1].update).toHaveBeenCalledWith({ given_at: expect.any(String), given_by: 'admin-1' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityType: 'collection_payments' }));
  });

  it('a contribution has no items to give', async () => {
    client({ collection_payments: [{ data: { id: PAYMENT_ID, quantity: null, reversed_at: null }, error: null }] });
    await expect(setCollectionItemGiven(PAYMENT_ID, true)).resolves.toEqual({ data: null, error: 'Only an item purchase has items to give' });
  });

  it('a reversal needs a reason, is stored with who and why, and is audited', async () => {
    await expect(reverseCollectionPayment(PAYMENT_ID, '  ')).resolves.toEqual({ data: null, error: 'Enter the reason for the reversal' });

    const { chains } = client({
      collection_payments: [
        { data: { id: PAYMENT_ID, collection_id: COLLECTION_ID, receipt_number: 'COL-2026-000001', amount: 4000, reversed_at: null }, error: null },
        { data: null, error: null },
      ],
    });
    await expect(reverseCollectionPayment(PAYMENT_ID, 'Recorded twice')).resolves.toEqual({ data: { id: PAYMENT_ID }, error: null });
    expect(chains.collection_payments[1].update).toHaveBeenCalledWith({ reversed_at: expect.any(String), reversed_by: 'admin-1', reversal_reason: 'Recorded twice' });
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'UPDATE', entityId: PAYMENT_ID, newValues: expect.objectContaining({ reversal_reason: 'Recorded twice' }) }));
  });
});

describe('collections and notified parties (#1194)', () => {
  it('an item purchase collection needs a price per item', async () => {
    await expect(createCollection({ name: 'Stickers', collection_type: 'item_purchase', opens_on: '2026-01-01' })).resolves.toEqual({ data: null, error: 'Enter the price per item' });
  });

  it('a contribution drops item prices, and creation is audited', async () => {
    const { chains } = client({ collections: [{ data: { id: COLLECTION_ID, name: 'Party' }, error: null }] });
    await createCollection({ name: ' Party ', collection_type: 'contribution', opens_on: '2026-01-01', item_price: 50, target_amount: 1000 });
    expect(chains.collections[0].insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Party', item_price: null, non_resident_price: null, target_amount: 1000 }));
    expect(logAudit).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE', entityType: 'collections', entityId: COLLECTION_ID }));
  });

  it('a notified party on the collection is refused for a contribution', async () => {
    client({ collections: [{ data: { id: COLLECTION_ID, name: 'Party', collection_type: 'contribution' }, error: null }] });
    await expect(addCollectionNotifiedParty(COLLECTION_ID, { name: 'A', email: 'a@x.ng', channels: ['email'] }))
      .resolves.toEqual({ data: null, error: 'A notified party can be added to an item purchase collection only' });
  });

  it('a chosen channel needs its contact', async () => {
    await expect(addCollectionNotifiedParty(COLLECTION_ID, { name: 'A', channels: ['whatsapp'] }))
      .resolves.toEqual({ data: null, error: 'Enter a phone number for WhatsApp' });
  });
});
