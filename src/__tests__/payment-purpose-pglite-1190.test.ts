import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, migrationsDir, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1190: each payment records its charge category and payer, and an admin can re-tag a payment.
 * The schema is replayed into PGlite up to the migration before this one, an existing payment is
 * added, then the #1190 migration runs over it. Each test is rolled back.
 */

const MIGRATION = '20261103110000_payment_purpose_and_payer.sql';
const EXISTING = '33333333-3333-3333-3333-333333333333';

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await db.query<Row>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await q(sql, params))[0];

/** Runs sql with the given JWT claims; returns the rows or the error message. */
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
const retag = (paymentId: string, category: string) =>
  asService(`SELECT public.retag_payment_charge_category($1, $2) AS r`, [paymentId, category]);

let seq = 0;
async function resident(): Promise<string> {
  seq++;
  return (
    await one(`INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Test', $1, $2) RETURNING id`, [
      `P${seq}`,
      `+23412000${String(seq).padStart(5, '0')}`,
    ])
  ).id;
}
async function payment(residentId: string, amount: number, category = 'dues'): Promise<string> {
  return (
    await one(
      `INSERT INTO public.payment_records (resident_id, amount, payment_date, status, charge_category)
       VALUES ($1, $2, DATE '2026-11-20', 'paid', $3) RETURNING id`,
      [residentId, amount, category]
    )
  ).id;
}
const credit = (residentId: string, amount: number, category: string) =>
  rpc(`SELECT public.adjust_wallet_credit($1, $2, 'payment', NULL, 'test credit', $3) AS r`, [residentId, amount, category]);
const balance = async (residentId: string, category: string) =>
  Number((await one(`SELECT balance FROM public.resident_wallets WHERE resident_id = $1 AND charge_category = $2`, [residentId, category]))?.balance ?? 0);

beforeAll(async () => {
  const later = laterMigrations();
  expect(later).toContain(MIGRATION);
  db = await loadSchema(later.filter((f) => f < MIGRATION));
  await replay(
    db,
    'pre-migration data',
    `
    INSERT INTO public.residents (id, first_name, last_name, phone_primary) VALUES ('${EXISTING}', 'Old', 'Payer', '+2349000000002');
    INSERT INTO public.payment_records (resident_id, amount, payment_date, status) VALUES ('${EXISTING}', 2500, DATE '2026-01-15', 'paid');
    `
  );
  for (const f of later.filter((f) => f >= MIGRATION)) await replay(db, f, readFileSync(path.join(migrationsDir, f), 'utf8'));
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

describe('#1190 migration over existing data', () => {
  it('makes every existing payment Dues with no recorded payer', async () => {
    expect(await q(`SELECT charge_category, paid_by_resident_id, paid_by_name FROM public.payment_records WHERE resident_id = $1`, [EXISTING])).toEqual([
      { charge_category: 'dues', paid_by_resident_id: null, paid_by_name: null },
    ]);
  });

  it('records a payer separate from the credited resident, and refuses an unknown category', async () => {
    const tenant = await resident();
    const landlord = await resident();
    const row = await one(
      `INSERT INTO public.payment_records (resident_id, amount, payment_date, status, paid_by_resident_id, paid_by_name)
       VALUES ($1, 100, DATE '2026-11-20', 'paid', $2, 'Landlord Ltd') RETURNING charge_category, paid_by_resident_id, paid_by_name`,
      [tenant, landlord]
    );
    expect(row).toEqual({ charge_category: 'dues', paid_by_resident_id: landlord, paid_by_name: 'Landlord Ltd' });
    await expect(payment(tenant, 100, 'no_such_category')).rejects.toThrow(/payment_records_charge_category_fkey/);
  });

  it('merges re-point the payer onto the kept resident', async () => {
    expect(
      await q(`SELECT handling FROM public.resident_merge_references() WHERE table_name = 'payment_records' AND column_name = 'paid_by_resident_id'`)
    ).toEqual([{ handling: 'move' }]);
  });
});

describe('retag_payment_charge_category', () => {
  it('moves the payment amount from the old wallet to the new one, and changes the payment', async () => {
    const r = await resident();
    await credit(r, 7000, 'dues');
    const p = await payment(r, 5000);

    const res = await retag(p, 'development_levy');

    expect(res.message).toBeUndefined();
    expect(res.rows?.[0].r).toMatchObject({ success: true, old_charge_category: 'dues', new_charge_category: 'development_levy' });
    expect(await balance(r, 'dues')).toBe(2000);
    expect(await balance(r, 'development_levy')).toBe(5000);
    expect((await one(`SELECT charge_category FROM public.payment_records WHERE id = $1`, [p])).charge_category).toBe('development_levy');
    expect(
      await q(
        `SELECT w.charge_category, t.type, t.amount FROM public.wallet_transactions t JOIN public.resident_wallets w ON w.id = t.wallet_id
          WHERE t.reference_type = 'payment_retag' AND t.reference_id = $1 ORDER BY t.type`,
        [p]
      )
    ).toEqual([
      { charge_category: 'development_levy', type: 'credit', amount: '5000.00' },
      { charge_category: 'dues', type: 'debit', amount: '5000.00' },
    ]);
  });

  it('refuses a payment whose settlement already paid an invoice', async () => {
    const r = await resident();
    const p = await payment(r, 5000);
    const inv = (
      await one(
        `INSERT INTO public.invoices (resident_id, invoice_number, amount_due, status, due_date, period_start, period_end)
         VALUES ($1, 'RT-1', 1000, 'unpaid', DATE '2026-11-15', DATE '2026-11-01', DATE '2026-11-30') RETURNING id`,
        [r]
      )
    ).id;
    await rpc(
      `SELECT public.settle_wallet_invoices(p_resident_id => $1, p_invoice_ids => ARRAY[$2]::uuid[], p_batch_type => 'payment_received',
         p_payment_date => DATE '2026-11-20', p_source_payment_id => $3, p_credit_amount => 5000, p_batch_amount => 5000) AS r`,
      [r, inv, p]
    );

    expect((await retag(p, 'development_levy')).message).toMatch(/already paid invoices/);
    expect(await balance(r, 'dues')).toBe(4000);
  });

  it('refuses when the old wallet no longer holds the amount', async () => {
    const r = await resident();
    await credit(r, 1000, 'dues');
    const p = await payment(r, 5000);
    expect((await retag(p, 'development_levy')).message).toMatch(/holds less than this payment/);
    expect(await balance(r, 'dues')).toBe(1000);
  });

  it('refuses the same or an unknown category', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    const p = await payment(r, 5000);
    expect((await retag(p, 'dues')).message).toMatch(/already dues/);
    expect((await retag(p, 'no_such_category')).message).toMatch(/Unknown charge category/);
  });

  it('refuses a caller without billing.manage_wallets', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    const p = await payment(r, 5000);
    const res = await asRole(
      { role: 'authenticated', sub: '99999999-9999-4999-8999-999999999999' },
      `SELECT public.retag_payment_charge_category($1, 'development_levy') AS r`,
      [p]
    );
    expect(res.message).toMatch(/Not authorized/);
  });
});
