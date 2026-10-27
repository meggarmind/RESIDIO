import { describe, expect, it } from 'vitest';
import { loadCollectionsStatement } from '@/lib/collections/statement-data';

type Op = [string, unknown[]];

function client(tables: Record<string, unknown>) {
  const calls: Record<string, Op[]> = {};
  const from = (table: string) => {
    const ops = (calls[table] ??= []);
    const result = { data: tables[table] ?? null, error: null };
    const q: Record<string, unknown> = { then: (res: (v: unknown) => unknown) => Promise.resolve(result).then(res) };
    for (const op of ['select', 'eq', 'is', 'gte', 'lte', 'order']) q[op] = (...args: unknown[]) => { ops.push([op, args]); return q; };
    q.maybeSingle = () => Promise.resolve(result);
    return q;
  };
  return { client: { from } as never, calls };
}

const payments = [
  { id: 'c1', amount: 5000, quantity: null, unit_price: null, payment_date: '2026-10-12', reference: null, receipt_number: 'COL-2026-000001', collection: { name: 'Streetlights' } },
  { id: 'c2', amount: 6000, quantity: 2, unit_price: 3000, payment_date: '2026-10-20', reference: 'TRF1', receipt_number: 'COL-2026-000002', collection: { name: 'Vehicle Sticker' } },
];

describe('loadCollectionsStatement (#1196)', () => {
  it('prints a non-resident payer with every collection and a total', async () => {
    const { client: db, calls } = client({
      collection_payers: { id: 'p1', resident_id: null, full_name: 'Chidi Visitor', phone: '+2348012345678', email: null, resident: null },
      collection_payments: payments,
    });
    const { data, error } = await loadCollectionsStatement(db, { payerId: 'p1', fromDate: '2026-10-01', toDate: '2026-10-31' });

    expect(error).toBeNull();
    expect(data!.payer).toMatchObject({ name: 'Chidi Visitor', isResident: false, phone: '+2348012345678' });
    expect(data!.collections.lines.map((l) => l.collection_name)).toEqual(['Streetlights', 'Vehicle Sticker']);
    expect(data!.collections.total).toBe(11000);
    // A reversed payment is not part of the statement.
    expect(calls.collection_payments).toContainEqual(['is', ['reversed_at', null]]);
    expect(calls.collection_payments).toContainEqual(['eq', ['payer_id', 'p1']]);
  });

  it('names a resident payer from the resident record', async () => {
    const { client: db } = client({
      collection_payers: { id: 'p2', resident_id: 'r1', full_name: null, phone: null, email: null, resident: { first_name: 'Ada', last_name: 'Example', resident_code: 'RES001', phone_primary: '0801', email: 'ada@example.com' } },
      collection_payments: [],
    });
    const { data } = await loadCollectionsStatement(db, { payerId: 'p2', fromDate: '2026-10-01', toDate: '2026-10-31' });
    expect(data!.payer).toMatchObject({ name: 'Ada Example', isResident: true, residentCode: 'RES001', email: 'ada@example.com' });
    expect(data!.collections).toEqual({ lines: [], total: 0 });
  });

  it('reports an unknown payer and bad dates', async () => {
    expect((await loadCollectionsStatement(client({}).client, { payerId: 'x', fromDate: '2026-10-01', toDate: '2026-10-31' })).error).toBe('Payer not found');
    expect((await loadCollectionsStatement(client({}).client, { payerId: 'x', fromDate: '2026-13-01', toDate: '2026-10-31' })).error).toBe('Dates must be in YYYY-MM-DD format');
  });
});
