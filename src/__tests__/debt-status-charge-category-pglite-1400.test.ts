import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { loadSchema } from '@/__tests__/helpers/pglite-schema';

/**
 * #1400: get_debt_statuses takes an optional charge. With one, only that charge's invoices are owed
 * and only that charge's wallet is read; with none it does what it did before. The whole migration
 * list is replayed into PGlite, so the new migration is applied over the real function.
 */

let db: PGlite;
type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await db.query<Row>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await q(sql, params))[0];

let house: string;
let tenant: string;

beforeAll(async () => {
  db = await loadSchema();
  await db.exec(`INSERT INTO public.streets (name) VALUES ('Test Street')`);
  house = (await one(`INSERT INTO public.houses (house_number, street_id, short_name) SELECT '1', id, 'T1' FROM public.streets LIMIT 1 RETURNING id`)).id;
  tenant = (await one(`INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Ten', 'Ant', '+2349000000011') RETURNING id`)).id;
  await db.query(`INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES ($1, $2, 'tenant', true)`, [tenant, house]);
  const inv = (n: string, category: string) =>
    db.query(
      `INSERT INTO public.invoices (resident_id, house_id, invoice_number, amount_due, status, due_date, period_start, period_end, charge_category)
       VALUES ($1, $2, $3, 1000, 'unpaid', DATE '2026-01-15', DATE '2026-01-01', DATE '2026-01-31', $4)`,
      [tenant, house, n, category]
    );
  await inv('D-1', 'dues');
  await inv('D-2', 'dues');
  await inv('F-1', 'transformer_fee');
  await db.query(`INSERT INTO public.resident_wallets (resident_id, charge_category, balance) VALUES ($1, 'dues', 100), ($1, 'transformer_fee', 700)`, [tenant]);
}, 240_000);

afterAll(async () => {
  await db?.close();
});

const status = (args: string) => one(`SELECT status, owed_invoice_count, wallet_balance FROM public.get_debt_statuses(${args}) WHERE house_id = $1`, [house]);

describe('get_debt_statuses with a charge (#1400)', () => {
  it('without a charge it counts every invoice and sums the wallets, as before', async () => {
    const row = await status(`ARRAY['${house}']::uuid[], NULL`);
    expect(row).toMatchObject({ owed_invoice_count: 3, status: 'outstanding' });
    expect(Number(row.wallet_balance)).toBe(800);
  });

  it('with a charge it counts only that charge and reads only its wallet', async () => {
    const dues = await status(`ARRAY['${house}']::uuid[], NULL, 'dues'`);
    expect(dues.owed_invoice_count).toBe(2);
    expect(Number(dues.wallet_balance)).toBe(100);
    const fee = await status(`ARRAY['${house}']::uuid[], NULL, 'transformer_fee'`);
    expect(fee.owed_invoice_count).toBe(1);
    expect(Number(fee.wallet_balance)).toBe(700);
    const levy = await status(`ARRAY['${house}']::uuid[], NULL, 'development_levy'`);
    expect(levy).toMatchObject({ owed_invoice_count: 0, status: 'paid_in_full' });
    expect(Number(levy.wallet_balance)).toBe(0);
  });

  it('a call with two arguments is not ambiguous, and there is one function', async () => {
    expect((await one(`SELECT count(*)::int AS n FROM public.get_debt_statuses(NULL, NULL)`)).n).toBeGreaterThan(0);
    const fns = await q(`SELECT pg_get_function_identity_arguments(oid) AS a FROM pg_proc WHERE proname = 'get_debt_statuses'`);
    expect(fns).toEqual([{ a: 'p_house_ids uuid[], p_resident_id uuid, p_charge_category text' }]);
  });

  it('get_resident_indebtedness, which calls it with two arguments, still works', async () => {
    const r = await one(`SELECT public.get_resident_indebtedness($1) AS r`, [tenant]);
    expect(r.r).toBeTruthy();
  });
});
