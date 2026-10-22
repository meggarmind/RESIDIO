import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #996: the "Generate invoices" dialog asks create_generated_invoice to settle each new invoice from
 * the resident's wallet. A resident with an empty wallet must still get the invoice; a funded wallet
 * is settled as before. Runs the real migrations in PGlite; each test is rolled back.
 */

const ACTOR = '11111111-1111-1111-1111-111111111111';

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await db.query<Row>(sql, params)).rows[0];

let seq = 0;
/** A resident, a house and a pending candidate for one ₦5,000 invoice with wallet settlement on. */
async function candidate(walletBalance: number | null): Promise<{ id: string; resident: string }> {
  seq++;
  const resident = (
    await one(`INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Test', $1, $2) RETURNING id`, [
      `R${seq}`,
      `+23400000${String(seq).padStart(5, '0')}`,
    ])
  ).id;
  const house = (
    await one(`INSERT INTO public.houses (house_number, street_id, short_name) SELECT $1, id, $2 FROM public.streets LIMIT 1 RETURNING id`, [
      `T-${seq}`,
      `T${seq}`,
    ])
  ).id;
  if (walletBalance !== null) {
    await db.query(`INSERT INTO public.resident_wallets (resident_id, balance) VALUES ($1, $2)`, [resident, walletBalance]);
  }
  const id = (
    await one(
      `INSERT INTO public.invoice_generation_candidates (
         run_id, resident_id, house_id, billing_profile_id, billing_profile_version_id,
         period_start, period_end, due_date, amount_due, invoice_items, wallet_allocation_requested)
       SELECT r.id, $1, $2, v.billing_profile_id, v.id, DATE '2026-11-01', DATE '2026-11-30', DATE '2026-11-15',
         5000, '[{"description": "Service charge", "amount": 5000}]'::jsonb, true
       FROM public.invoice_generation_runs r, public.billing_profile_versions v LIMIT 1
       RETURNING id`,
      [resident, house]
    )
  ).id;
  return { id, resident };
}

const generate = async (candidateId: string) =>
  (await one(`SELECT public.create_generated_invoice($1, $2) AS r`, [candidateId, ACTOR])).r;

beforeAll(async () => {
  db = await loadSchema(laterMigrations());
  await replay(
    db,
    'fixtures',
    `
    INSERT INTO auth.users (id, email) VALUES ('${ACTOR}', 'sa@example.test');
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${ACTOR}', 'sa@example.test', 'SA', id, 'active' FROM public.app_roles WHERE name = 'super_admin'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.streets (name) VALUES ('Test Street');
    INSERT INTO public.billing_profiles (name) VALUES ('Test Profile');
    INSERT INTO public.billing_profile_versions (billing_profile_id, effective_from)
      SELECT id, DATE '2026-01-01' FROM public.billing_profiles LIMIT 1;
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

describe('create_generated_invoice with wallet settlement requested', () => {
  it.each([
    ['no wallet row', null],
    ['a ₦0 wallet', 0],
  ])('creates the unpaid invoice for a resident with %s', async (_label, balance) => {
    const c = await candidate(balance);
    const result = await generate(c.id);

    expect(result).toMatchObject({ status: 'created', wallet_allocated: 0 });
    const invoice = await one(`SELECT status, amount_paid FROM public.invoices WHERE id = $1`, [result.invoice_id]);
    expect(invoice).toMatchObject({ status: 'unpaid', amount_paid: '0.00' });
    expect(await one(`SELECT status, error_message FROM public.invoice_generation_candidates WHERE id = $1`, [c.id])).toMatchObject({
      status: 'created',
      error_message: null,
    });
    expect((await one(`SELECT count(*)::int AS n FROM public.wallet_payment_batches WHERE resident_id = $1`, [c.resident])).n).toBe(0);
  });

  it('still settles from a funded wallet', async () => {
    const c = await candidate(3000);
    const result = await generate(c.id);

    expect(result).toMatchObject({ status: 'created', wallet_allocated: 3000 });
    const invoice = await one(`SELECT status, amount_paid FROM public.invoices WHERE id = $1`, [result.invoice_id]);
    expect(invoice).toMatchObject({ status: 'partially_paid', amount_paid: '3000.00' });
    expect((await one(`SELECT balance FROM public.resident_wallets WHERE resident_id = $1`, [c.resident])).balance).toBe('0.00');
    expect((await one(`SELECT count(*)::int AS n FROM public.wallet_payment_batches WHERE resident_id = $1`, [c.resident])).n).toBe(1);
  });
});
