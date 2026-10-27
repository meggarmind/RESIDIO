import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema } from '@/__tests__/helpers/pglite-schema';

/**
 * #1195: moving a payment between billing and collections, in one transaction. The schema is replayed
 * into PGlite with every migration; the tests call the real functions as service_role. Each test is
 * rolled back.
 */

const MIGRATION = '20261103130000_collections_intake.sql';
const ACTOR = null;

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await db.query<Row>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await q(sql, params))[0];

async function asRole(claims: Record<string, unknown>, sql: string, params: unknown[] = []): Promise<{ rows?: Row[]; message?: string }> {
  await db.exec('SAVEPOINT r');
  try {
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify(claims)]);
    const rows = (await db.query<Row>(sql, params)).rows;
    await db.exec('RELEASE SAVEPOINT r');
    return { rows };
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT r');
    await db.exec('RELEASE SAVEPOINT r');
    return { message: (e as Error).message };
  }
}
const asService = (sql: string, params: unknown[] = []) => asRole({ role: 'service_role' }, sql, params);
const rpc = async (sql: string, params: unknown[] = []) => {
  const r = await asService(sql, params);
  if (!r.rows) throw new Error(r.message);
  return r.rows[0].r;
};

let seq = 0;
async function resident(): Promise<string> {
  seq++;
  return (
    await one(`INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Test', $1, $2) RETURNING id`, [
      `M${seq}`,
      `+23413000${String(seq).padStart(5, '0')}`,
    ])
  ).id;
}
async function invoice(residentId: string, amount = 1000): Promise<string> {
  seq++;
  return (
    await one(
      `INSERT INTO public.invoices (resident_id, invoice_number, amount_due, status, due_date, period_start, period_end)
       VALUES ($1, $2, $3, 'unpaid', DATE '2026-11-15', DATE '2026-11-01', DATE '2026-11-30') RETURNING id`,
      [residentId, `MV-${seq}`, amount]
    )
  ).id;
}
async function payment(residentId: string, amount: number): Promise<string> {
  return (
    await one(
      `INSERT INTO public.payment_records (resident_id, amount, payment_date, status, method, reference_number)
       VALUES ($1, $2, DATE '2026-11-20', 'paid', 'bank_transfer', 'REF-1') RETURNING id`,
      [residentId, amount]
    )
  ).id;
}
async function collection(type: 'contribution' | 'item_purchase' = 'contribution'): Promise<string> {
  seq++;
  return (
    await one(
      `INSERT INTO public.collections (name, collection_type, item_price, opens_on) VALUES ($1, $2, $3, DATE '2026-01-01') RETURNING id`,
      [`Party ${seq}`, type, type === 'item_purchase' ? 2000 : null]
    )
  ).id;
}
const payer = async (residentId: string) =>
  (await one(`INSERT INTO public.collection_payers (resident_id) VALUES ($1) RETURNING id`, [residentId])).id;
const balance = async (residentId: string, category = 'dues') =>
  Number((await one(`SELECT balance FROM public.resident_wallets WHERE resident_id = $1 AND charge_category = $2`, [residentId, category]))?.balance ?? 0);
const invoicePaid = async (id: string) => Number((await one(`SELECT amount_paid FROM public.invoices WHERE id = $1`, [id])).amount_paid);

/** A payment settled the normal way: credit and invoice allocation in one batch. */
const settle = (residentId: string, paymentId: string, amount: number, invoiceIds: string[]) =>
  rpc(
    `SELECT public.settle_wallet_invoices(p_resident_id => $1, p_invoice_ids => $2::uuid[], p_batch_type => 'payment_received',
       p_payment_date => DATE '2026-11-20', p_source_payment_id => $3, p_credit_amount => $4, p_batch_amount => $4) AS r`,
    [residentId, invoiceIds, paymentId, amount]
  );

const toCollection = (paymentId: string, collectionId: string, payerId: string, quantity: number | null = null, unitPrice: number | null = null) =>
  asService(`SELECT public.move_payment_to_collection($1, $2, $3, NULL, $4, $5, 'Party money', $6) AS r`, [
    paymentId, collectionId, payerId, quantity, unitPrice, ACTOR,
  ]);
const toBilling = (collectionPaymentId: string, residentId: string, invoiceIds: string[], category = 'dues') =>
  asService(`SELECT public.move_collection_payment_to_billing($1, $2, NULL, $3, $4::uuid[], 'Was dues', $5) AS r`, [
    collectionPaymentId, residentId, category, invoiceIds, ACTOR,
  ]);

beforeAll(async () => {
  const all = laterMigrations();
  expect(all).toContain(MIGRATION);
  db = await loadSchema(all);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('BEGIN');
  return async () => {
    await db.exec('ROLLBACK');
  };
});

describe('move_payment_to_collection', () => {
  it('reverses the settlement, records the collection payment and removes the payment', async () => {
    const r = await resident();
    const inv = await invoice(r, 1000);
    const p = await payment(r, 5000);
    await settle(r, p, 5000, [inv]);
    expect(await balance(r)).toBe(4000);
    expect(await invoicePaid(inv)).toBe(1000);
    const c = await collection();

    const res = await toCollection(p, c, await payer(r));

    expect(res.message).toBeUndefined();
    expect(res.rows?.[0].r).toMatchObject({ success: true });
    expect(await balance(r)).toBe(0);
    expect(await invoicePaid(inv)).toBe(0);
    expect(await q(`SELECT id FROM public.payment_records WHERE id = $1`, [p])).toEqual([]);
    const cp = await one(`SELECT amount, method, reference, notes, receipt_number FROM public.collection_payments WHERE collection_id = $1`, [c]);
    expect(cp).toMatchObject({ amount: '5000.00', method: 'bank_transfer', reference: 'REF-1' });
    expect(cp.notes).toMatch(/Party money/);
    expect(cp.receipt_number).toMatch(/^COL-2026-\d{6}$/);
  });

  it('debits a plain wallet credit when the payment paid no invoice', async () => {
    const r = await resident();
    const p = await payment(r, 3000);
    await rpc(`SELECT public.adjust_wallet_credit($1, 3000, 'payment', $2, 'credit') AS r`, [r, p]);
    const c = await collection();

    expect((await toCollection(p, c, await payer(r))).message).toBeUndefined();
    expect(await balance(r)).toBe(0);
  });

  it('refuses, and changes nothing, when the credit has been spent', async () => {
    const r = await resident();
    const p = await payment(r, 3000);
    await rpc(`SELECT public.adjust_wallet_credit($1, 3000, 'payment', $2, 'credit') AS r`, [r, p]);
    await rpc(`SELECT public.adjust_wallet_debit($1, 2500, 'invoice', NULL, 'spent') AS r`, [r]);
    const c = await collection();

    expect((await toCollection(p, c, await payer(r))).message).toMatch(/Insufficient wallet balance/);
    expect(await balance(r)).toBe(500);
    expect(await q(`SELECT id FROM public.payment_records WHERE id = $1`, [p])).toHaveLength(1);
    expect(await q(`SELECT id FROM public.collection_payments WHERE collection_id = $1`, [c])).toEqual([]);
  });

  it('refuses a settled payment whose leftover credit has been spent, and leaves the settlement', async () => {
    const r = await resident();
    const inv = await invoice(r, 1000);
    const p = await payment(r, 5000);
    await settle(r, p, 5000, [inv]);
    await rpc(`SELECT public.adjust_wallet_debit($1, 3500, 'invoice', NULL, 'spent') AS r`, [r]);
    const c = await collection();

    expect((await toCollection(p, c, await payer(r))).message).toMatch(/already been spent/);
    expect(await balance(r)).toBe(500);
    expect(await invoicePaid(inv)).toBe(1000);
    expect(await q(`SELECT id FROM public.payment_records WHERE id = $1`, [p])).toHaveLength(1);
  });

  it('refuses an item purchase whose quantity x price is not the payment amount', async () => {
    const r = await resident();
    const p = await payment(r, 5000);
    await rpc(`SELECT public.adjust_wallet_credit($1, 5000, 'payment', $2, 'credit') AS r`, [r, p]);
    const c = await collection('item_purchase');

    expect((await toCollection(p, c, await payer(r), 2, 2000)).message).toMatch(/is not the payment amount/);
    expect(await balance(r)).toBe(5000);
  });

  it('refuses a caller that is not service_role', async () => {
    const r = await resident();
    const p = await payment(r, 1000);
    const res = await asRole(
      { role: 'authenticated', sub: '99999999-9999-4999-8999-999999999999' },
      `SELECT public.move_payment_to_collection($1, $2, $3, NULL, NULL, NULL, 'x', NULL) AS r`,
      [p, await collection(), await payer(r)]
    );
    expect(res.message).toMatch(/Not authorized|permission denied/);
  });
});

describe('move_collection_payment_to_billing', () => {
  it('reverses the collection payment, records a payment and settles the invoices', async () => {
    const r = await resident();
    const inv = await invoice(r, 1000);
    const c = await collection();
    const cp = (
      await one(
        `INSERT INTO public.collection_payments (collection_id, payer_id, amount, payment_date, method, reference)
         VALUES ($1, $2, 4000, DATE '2026-11-20', 'cash', 'R-9') RETURNING id`,
        [c, await payer(r)]
      )
    ).id;

    const res = await toBilling(cp, r, [inv]);

    expect(res.message).toBeUndefined();
    const paymentId = res.rows?.[0].r.payment_id;
    expect(await one(`SELECT resident_id, amount, method, reference_number, charge_category, paid_by_resident_id FROM public.payment_records WHERE id = $1`, [paymentId])).toEqual({
      resident_id: r, amount: '4000.00', method: 'cash', reference_number: 'R-9', charge_category: 'dues', paid_by_resident_id: r,
    });
    expect(await invoicePaid(inv)).toBe(1000);
    expect(await balance(r)).toBe(3000);
    const reversed = await one(`SELECT reversed_at, reversal_reason FROM public.collection_payments WHERE id = $1`, [cp]);
    expect(reversed.reversed_at).not.toBeNull();
    expect(reversed.reversal_reason).toMatch(/Moved to billing: Was dues/);
  });

  it('credits the wallet of the category when no invoice is given, and refuses a second move', async () => {
    const r = await resident();
    const c = await collection();
    const cp = (
      await one(
        `INSERT INTO public.collection_payments (collection_id, payer_id, amount, payment_date, method)
         VALUES ($1, $2, 2500, DATE '2026-11-20', 'cash') RETURNING id`,
        [c, await payer(r)]
      )
    ).id;

    expect((await toBilling(cp, r, [], 'development_levy')).message).toBeUndefined();
    expect(await balance(r, 'development_levy')).toBe(2500);
    expect((await toBilling(cp, r, [])).message).toMatch(/was reversed/);
  });

  it('a payment moved to a collection and back credits the wallet again', async () => {
    const r = await resident();
    const p = await payment(r, 3000);
    await rpc(`SELECT public.adjust_wallet_credit($1, 3000, 'payment', $2, 'credit') AS r`, [r, p]);
    const c = await collection();
    const moved = (await toCollection(p, c, await payer(r))).rows?.[0].r;

    expect((await toBilling(moved.collection_payment_id, r, [])).message).toBeUndefined();
    expect(await balance(r)).toBe(3000);
  });
});
