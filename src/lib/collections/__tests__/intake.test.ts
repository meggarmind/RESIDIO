import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn() }));
vi.mock('@/lib/collections/notify', () => ({ queueCollectionPaymentNotices: vi.fn() }));
vi.mock('@/lib/collections/payers', () => ({ findOrCreatePayer: vi.fn() }));

import { logAudit } from '@/lib/audit/logger';
import { findOrCreatePayer } from '@/lib/collections/payers';
import { postCollectionParts, resolveCollectionParts, type CollectionPart } from '@/lib/collections/intake';

/** #1195: pricing and posting collection parts. The database is a stub. */

const PARTY = '11111111-1111-4111-8111-111111111111';
const STICKER = '22222222-2222-4222-8222-222222222222';
const PAYER = '33333333-3333-4333-8333-333333333333';
const RESIDENT = '44444444-4444-4444-8444-444444444444';

const collections = [
  { id: PARTY, name: 'Party', collection_type: 'contribution', opens_on: '2026-01-01', closes_on: '2026-12-31', item_price: null, non_resident_price: null, is_active: true },
  { id: STICKER, name: 'Sticker', collection_type: 'item_purchase', opens_on: '2026-01-01', closes_on: null, item_price: 2000, non_resident_price: 3000, is_active: true },
];

function stub(insertError: (n: number) => string | null = () => null) {
  const inserts: Record<string, unknown>[] = [];
  const updates: Array<{ values: Record<string, unknown>; id: unknown }> = [];
  const client = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      let mode = 'select';
      let values: Record<string, unknown> = {};
      let id: unknown;
      chain.select = () => chain;
      chain.in = () => chain;
      chain.is = () => chain;
      chain.eq = (_c: string, v: unknown) => ((id = v), chain);
      chain.insert = (v: Record<string, unknown>) => ((mode = 'insert'), (values = v), inserts.push(v), chain);
      chain.update = (v: Record<string, unknown>) => ((mode = 'update'), (values = v), chain);
      chain.single = async () => {
        const message = insertError(inserts.length);
        return message ? { data: null, error: { message } } : { data: { id: `cp-${inserts.length}`, receipt_number: `COL-2026-00000${inserts.length}`, amount: values.amount }, error: null };
      };
      chain.then = (res: (v: unknown) => unknown) => {
        if (mode === 'update') updates.push({ values, id });
        return Promise.resolve(table === 'collections' ? { data: collections, error: null } : { data: null, error: null }).then(res);
      };
      return chain;
    },
  };
  return { client: client as never, inserts, updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findOrCreatePayer).mockResolvedValue({ id: PAYER, isResident: false });
});

describe('resolveCollectionParts', () => {
  it('prices each part for the payer: a contribution takes its amount, an item quantity x price', async () => {
    const res = await resolveCollectionParts(stub().client, [
      { collection_id: PARTY, amount: 1500.5 },
      { collection_id: STICKER, quantity: 2, amount: 1 },
    ], { payer: { kind: 'non_resident', full_name: 'Mr B', phone: null, email: null }, paymentDate: '2026-11-20', userId: 'u' });

    expect(res).toEqual({ parts: [
      { collection_id: PARTY, payer_id: PAYER, house_id: null, quantity: null, unit_price: null, amount: 1500.5 },
      { collection_id: STICKER, payer_id: PAYER, house_id: null, quantity: 2, unit_price: 3000, amount: 6000 },
    ] });
  });

  it('refuses a collection that is closed on the payment date', async () => {
    const res = await resolveCollectionParts(stub().client, [{ collection_id: PARTY, amount: 100 }], {
      payer: { kind: 'resident', resident_id: RESIDENT }, paymentDate: '2027-01-02', userId: 'u',
    });
    expect(res).toEqual({ error: 'Party: The payment date is after the collection closes' });
  });
});

describe('postCollectionParts', () => {
  const parts: CollectionPart[] = [
    { collection_id: PARTY, payer_id: PAYER, house_id: null, quantity: null, unit_price: null, amount: 1000 },
    { collection_id: PARTY, payer_id: PAYER, house_id: null, quantity: null, unit_price: null, amount: 500 },
  ];
  const context = { paymentDate: '2026-11-20', method: 'bank_transfer' as const, reference: 'R', notes: null, bankRowId: 'row-1', userId: 'u' };

  it('records one collection payment per part, linked to the bank line, and audits each', async () => {
    const db = stub();
    const res = await postCollectionParts(db.client, parts, context);

    expect(res).toEqual({ posted: [
      { id: 'cp-1', receipt_number: 'COL-2026-000001', amount: 1000 },
      { id: 'cp-2', receipt_number: 'COL-2026-000002', amount: 500 },
    ] });
    expect(db.inserts.map((row) => [row.amount, row.bank_row_id, row.method])).toEqual([[1000, 'row-1', 'bank_transfer'], [500, 'row-1', 'bank_transfer']]);
    expect(logAudit).toHaveBeenCalledTimes(2);
  });

  it('reverses the parts already recorded when a later one fails', async () => {
    const db = stub((n) => (n === 2 ? 'insert failed' : null));
    const res = await postCollectionParts(db.client, parts, context);

    expect(res).toEqual({ error: 'insert failed' });
    expect(db.updates).toEqual([{ values: expect.objectContaining({ reversal_reason: 'Not recorded: insert failed' }), id: 'cp-1' }]);
  });

  it('records nothing when a collection has closed since the line was assigned', async () => {
    const db = stub();
    expect(await postCollectionParts(db.client, parts, { ...context, paymentDate: '2027-02-01' })).toEqual({ error: 'Party: The payment date is after the collection closes' });
    expect(db.inserts).toEqual([]);
  });
});
