import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizePermission } from '@/lib/auth/authorize';
import { createAdminClient } from '@/lib/supabase/server';
import { getCollection, getCollections } from '../collections';

vi.mock('@/lib/auth/authorize', () => ({ authorizePermission: vi.fn() }));
vi.mock('@/lib/audit/logger', () => ({ logAudit: vi.fn(), getChangedValues: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/collections/notify', () => ({ queueCollectionPaymentNotices: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const CID = '11111111-1111-4111-8111-111111111111';
const OTHER = '99999999-9999-4999-8999-999999999999';
const MAX_ROWS = 1000;
const collection = { id: CID, name: 'Book', description: null, collection_type: 'item_purchase', opens_on: '2026-01-01', closes_on: null, target_amount: null, item_price: 10, non_resident_price: null, is_active: true, created_at: '' };

// Fake PostgREST: honours eq/in filters and caps every response at MAX_ROWS.
function table(rows: Array<Record<string, unknown>>) {
  let out = rows;
  const chain: Record<string, unknown> = {
    select: () => chain, order: () => chain,
    eq: (col: string, v: unknown) => { out = out.filter((r) => r[col] === v); return chain; },
    in: (col: string, vs: unknown[]) => { out = out.filter((r) => vs.includes(r[col])); return chain; },
    range: (from: number, to: number) => Promise.resolve({ data: out.slice(from, Math.min(to + 1, from + MAX_ROWS)), error: null }),
    maybeSingle: () => Promise.resolve({ data: out[0] ?? null, error: null }),
    then: (res: (v: unknown) => unknown) => Promise.resolve({ data: out, error: null }).then(res),
  };
  return chain;
}

const payments = Array.from({ length: 2500 }, (_, i) => ({
  id: `p${i}`, collection_id: CID, payer_id: `payer${i}`, amount: 10, quantity: 1, given_at: null, reversed_at: null,
  payment_date: '2026-01-01', created_at: '',
}));
const parties = [
  ...Array.from({ length: 1500 }, (_, i) => ({ id: `o${i}`, collection_id: OTHER, collection_payment_id: null })),
  { id: 'mine', collection_id: CID, collection_payment_id: null },
  { id: 'pp', collection_id: null, collection_payment_id: 'p2400' },
];

beforeEach(() => {
  vi.mocked(authorizePermission).mockResolvedValue({ authorized: true, userId: 'a', error: null } as never);
  const data: Record<string, Array<Record<string, unknown>>> = { collections: [collection], collection_payments: payments, collection_notified_parties: parties };
  vi.mocked(createAdminClient).mockReturnValue({ from: (t: string) => table(data[t]) } as never);
});

describe('collection reads past max_rows', () => {
  it('getCollections totals count every payment', async () => {
    const { data } = await getCollections();
    expect(data?.[0].summary.total).toBe(25000);
  });
  it('getCollection returns all payments and only this collection\'s parties', async () => {
    const { data } = await getCollection(CID);
    expect(data?.payments).toHaveLength(2500);
    expect(data?.summary.total).toBe(25000);
    expect(data?.notifiedParties.map((p) => p.id)).toEqual(['mine']);
    expect(data?.paymentParties['p2400']).toHaveLength(1);
  });
});
