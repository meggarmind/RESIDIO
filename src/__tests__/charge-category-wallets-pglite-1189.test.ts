import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, migrationsDir, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1189: one wallet per charge category. The schema is replayed into PGlite up to the migration
 * before this one, a funded single wallet and an invoice are added, then the #1189 migration runs
 * over them. The tests call the real RPCs as service_role; each test is rolled back.
 */

const MIGRATION = '20261103100000_charge_category_wallets.sql';
const ACTOR = '11111111-1111-1111-1111-111111111111';
const EXISTING = '33333333-3333-3333-3333-333333333333';

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await db.query<Row>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await q(sql, params))[0];

/** Runs sql as service_role; returns the rows or the error message. */
async function asService(sql: string, params: unknown[] = []): Promise<{ rows?: Row[]; message?: string }> {
  await db.exec('SAVEPOINT svc');
  try {
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ role: 'service_role' })]);
    const rows = (await db.query<Row>(sql, params)).rows;
    await db.exec('RELEASE SAVEPOINT svc');
    return { rows };
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT svc');
    await db.exec('RELEASE SAVEPOINT svc');
    return { message: (e as Error).message };
  }
}
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
      `C${seq}`,
      `+23411000${String(seq).padStart(5, '0')}`,
    ])
  ).id;
}
async function invoice(residentId: string, category: string, amount = 1000): Promise<string> {
  seq++;
  return (
    await one(
      `INSERT INTO public.invoices (resident_id, invoice_number, amount_due, status, due_date, period_start, period_end, charge_category)
       VALUES ($1, $2, $3, 'unpaid', DATE '2026-11-15', DATE '2026-11-01', DATE '2026-11-30', $4) RETURNING id`,
      [residentId, `CAT-${seq}`, amount, category]
    )
  ).id;
}
const credit = (residentId: string, amount: number, category: string) =>
  rpc(`SELECT public.adjust_wallet_credit($1, $2, 'adjustment', NULL, 'test credit', $3) AS r`, [residentId, amount, category]);
const balance = async (residentId: string, category: string) =>
  Number((await one(`SELECT balance FROM public.resident_wallets WHERE resident_id = $1 AND charge_category = $2`, [residentId, category]))?.balance ?? 0);
const settle = (residentId: string, invoiceIds: string[], category?: string) =>
  asService(
    category
      ? `SELECT public.settle_wallet_invoices(p_resident_id => $1, p_invoice_ids => $2::uuid[], p_batch_type => 'existing_wallet_settlement', p_payment_date => DATE '2026-11-20', p_charge_category => $3) AS r`
      : `SELECT public.settle_wallet_invoices(p_resident_id => $1, p_invoice_ids => $2::uuid[], p_batch_type => 'existing_wallet_settlement', p_payment_date => DATE '2026-11-20') AS r`,
    category ? [residentId, invoiceIds, category] : [residentId, invoiceIds]
  );

beforeAll(async () => {
  const later = laterMigrations();
  expect(later).toContain(MIGRATION);
  db = await loadSchema(later.filter((f) => f < MIGRATION));
  await replay(
    db,
    'pre-migration data',
    `
    INSERT INTO auth.users (id, email) VALUES ('${ACTOR}', 'sa@example.test');
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${ACTOR}', 'sa@example.test', 'SA', id, 'active' FROM public.app_roles WHERE name = 'super_admin'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.streets (name) VALUES ('Test Street');
    INSERT INTO public.billing_profiles (name) VALUES ('Old Dues Profile');
    INSERT INTO public.residents (id, first_name, last_name, phone_primary) VALUES ('${EXISTING}', 'Old', 'Wallet', '+2349000000001');
    INSERT INTO public.resident_wallets (resident_id, balance) VALUES ('${EXISTING}', 4321.50);
    INSERT INTO public.invoices (resident_id, invoice_number, amount_due, status, due_date) VALUES ('${EXISTING}', 'OLD-1', 100, 'unpaid', DATE '2026-01-15');
    `
  );
  for (const f of later.filter((f) => f >= MIGRATION)) await replay(db, f, readFileSync(path.join(migrationsDir, f), 'utf8'));
  await replay(
    db,
    'fixtures',
    `
    INSERT INTO public.billing_profiles (name, charge_category) VALUES ('Levy Profile', 'development_levy');
    INSERT INTO public.billing_profile_versions (billing_profile_id, effective_from)
      SELECT id, DATE '2026-01-01' FROM public.billing_profiles WHERE name = 'Levy Profile';
    INSERT INTO public.invoice_generation_runs (status) VALUES ('draft');
    `
  );
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

describe('#1189 migration over existing data', () => {
  it('makes every existing wallet, invoice and profile Dues, with the same balance', async () => {
    expect(await q(`SELECT code FROM public.charge_categories ORDER BY sort_order`)).toEqual([
      { code: 'dues' },
      { code: 'development_levy' },
      { code: 'transformer_fee' },
    ]);
    expect(await q(`SELECT charge_category, balance FROM public.resident_wallets WHERE resident_id = $1`, [EXISTING])).toEqual([
      { charge_category: 'dues', balance: '4321.50' },
    ]);
    expect((await one(`SELECT charge_category FROM public.invoices WHERE invoice_number = 'OLD-1'`)).charge_category).toBe('dues');
    expect((await one(`SELECT charge_category FROM public.billing_profiles WHERE name = 'Old Dues Profile'`)).charge_category).toBe('dues');
  });

  it('allows one wallet per category per resident, and only one', async () => {
    const r = await resident();
    await db.query(`INSERT INTO public.resident_wallets (resident_id, charge_category, balance) VALUES ($1, 'dues', 0), ($1, 'development_levy', 0)`, [r]);
    await expect(db.query(`INSERT INTO public.resident_wallets (resident_id, charge_category, balance) VALUES ($1, 'dues', 0)`, [r])).rejects.toThrow(
      /resident_wallets_resident_id_charge_category_key/
    );
  });
});

describe('wallet per charge category', () => {
  it('holds a Dues and a Development Levy wallet with separate balances', async () => {
    const r = await resident();
    expect(await credit(r, 500, 'dues')).toMatchObject({ success: true, new_balance: 500, charge_category: 'dues' });
    expect(await credit(r, 2000, 'development_levy')).toMatchObject({ success: true, new_balance: 2000, charge_category: 'development_levy' });
    expect(await rpc(`SELECT public.adjust_wallet_debit($1, 200, 'adjustment', NULL, 'test debit') AS r`, [r])).toMatchObject({ new_balance: 300 });
    expect([await balance(r, 'dues'), await balance(r, 'development_levy')]).toEqual([300, 2000]);
    // A debit larger than one wallet is refused even when the resident's total would cover it.
    expect((await asService(`SELECT public.adjust_wallet_debit($1, 400, 'adjustment', NULL, 'x', 'dues') AS r`, [r])).message).toMatch(/Insufficient wallet balance/);
  });

  it('refuses to settle a levy invoice from the Dues wallet', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    const levy = await invoice(r, 'development_levy');
    expect((await settle(r, [levy])).message).toMatch(/is a development_levy charge and cannot be paid from the dues wallet/);
    expect((await one(`SELECT amount_paid FROM public.invoices WHERE id = $1`, [levy])).amount_paid).toBe('0.00');
    expect(await balance(r, 'dues')).toBe(5000);
  });

  it('settles a levy invoice from the levy wallet only, and reverses it back there', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    await credit(r, 600, 'development_levy');
    const levy = await invoice(r, 'development_levy');
    const result = (await settle(r, [levy], 'development_levy')).rows![0].r;
    expect(result).toMatchObject({ success: true, total_allocated: 600, new_wallet_balance: 0, charge_category: 'development_levy' });
    expect([await balance(r, 'dues'), await balance(r, 'development_levy')]).toEqual([5000, 0]);
    const batch = await one(`SELECT charge_category FROM public.wallet_payment_batches WHERE id = $1`, [result.batch_id]);
    expect(batch.charge_category).toBe('development_levy');

    await rpc(`SELECT public.reverse_wallet_payment_batch($1) AS r`, [result.batch_id]);
    expect([await balance(r, 'dues'), await balance(r, 'development_levy')]).toEqual([5000, 600]);
    expect((await one(`SELECT amount_paid FROM public.invoices WHERE id = $1`, [levy])).amount_paid).toBe('0.00');
  });

  it('passes the category through settle_wallet_invoices_idempotent', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    const levy = await invoice(r, 'development_levy');
    const refused = await asService(
      `SELECT public.settle_wallet_invoices_idempotent(gen_random_uuid(), $1, $2::uuid[], 'existing_wallet_settlement', DATE '2026-11-20') AS r`,
      [r, [levy]]
    );
    expect(refused.message).toMatch(/cannot be paid from the dues wallet/);
  });

  it('pays an invoice only from the wallet of its own category', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    const levy = await invoice(r, 'development_levy');
    expect(await rpc(`SELECT public.pay_invoice_with_wallet($1) AS r`, [levy])).toMatchObject({ success: false, error: 'Insufficient wallet balance' });

    await credit(r, 1000, 'development_levy');
    expect(await rpc(`SELECT public.pay_invoice_with_wallet($1) AS r`, [levy])).toMatchObject({ success: true, amount_paid: 1000, new_wallet_balance: 0 });
    expect(await balance(r, 'dues')).toBe(5000);

    await rpc(`SELECT public.reverse_invoice_payment_allocation($1, 400) AS r`, [levy]);
    expect([await balance(r, 'dues'), await balance(r, 'development_levy')]).toEqual([5000, 400]);
  });

  it('refuses one wallet payment across two categories', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    const dues = await invoice(r, 'dues');
    const levy = await invoice(r, 'development_levy');
    const items = JSON.stringify([{ invoice_id: dues }, { invoice_id: levy }]);
    expect(await rpc(`SELECT public.pay_invoices_with_wallet($1::jsonb) AS r`, [items])).toMatchObject({
      success: false,
      error: 'All invoices must belong to the same charge category',
    });
    expect(await rpc(`SELECT public.pay_invoices_with_wallet($1::jsonb) AS r`, [JSON.stringify([{ invoice_id: dues }])])).toMatchObject({
      success: true,
      total_paid: 1000,
    });
  });

  it('gives a generated invoice its profile category and settles it from that wallet only', async () => {
    const r = await resident();
    await credit(r, 5000, 'dues');
    await credit(r, 300, 'development_levy');
    const house = (
      await one(`INSERT INTO public.houses (house_number, street_id, short_name) SELECT 'CAT-H', id, 'CATH' FROM public.streets LIMIT 1 RETURNING id`)
    ).id;
    const candidate = (
      await one(
        `INSERT INTO public.invoice_generation_candidates (
           run_id, resident_id, house_id, billing_profile_id, billing_profile_version_id,
           period_start, period_end, due_date, amount_due, invoice_items, wallet_allocation_requested)
         SELECT run.id, $1, $2, v.billing_profile_id, v.id, DATE '2026-11-01', DATE '2026-11-30', DATE '2026-11-15',
           1000, '[{"description": "Levy", "amount": 1000}]'::jsonb, true
         FROM public.invoice_generation_runs run, public.billing_profile_versions v
         JOIN public.billing_profiles bp ON bp.id = v.billing_profile_id AND bp.name = 'Levy Profile'
         LIMIT 1
         RETURNING id`,
        [r, house]
      )
    ).id;
    const result = (await one(`SELECT public.create_generated_invoice($1, $2) AS r`, [candidate, ACTOR])).r;
    expect(result).toMatchObject({ status: 'created', wallet_allocated: 300 });
    expect(await one(`SELECT charge_category, amount_paid FROM public.invoices WHERE id = $1`, [result.invoice_id])).toEqual({
      charge_category: 'development_levy',
      amount_paid: '300.00',
    });
    expect([await balance(r, 'dues'), await balance(r, 'development_levy')]).toEqual([5000, 0]);
  });

  it('reports the sum of all wallets in the debt status', async () => {
    const r = await resident();
    await credit(r, 500, 'dues');
    await credit(r, 250, 'transformer_fee');
    const status = (await one(`SELECT public.get_resident_indebtedness($1) AS r`, [r])).r;
    expect(status).toMatchObject({ debtStatus: 'credit', walletBalance: 750 });
  });
});
