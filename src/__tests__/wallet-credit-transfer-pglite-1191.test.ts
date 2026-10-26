import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1191: transfer_wallet_credit and reverse_wallet_transfer. The schema is replayed into PGlite
 * through every migration; the tests call the real RPCs as service_role (and as signed-in users for
 * the permission check). Each test is rolled back.
 */

const MIGRATION = '20261103110000_wallet_credit_transfers.sql';
const ADMIN = '11111111-1111-1111-1111-111111111111';
const NO_PERMISSION = '22222222-2222-2222-2222-222222222222';

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = async (sql: string, params: unknown[] = []): Promise<Row[]> => (await db.query<Row>(sql, params)).rows;
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await q(sql, params))[0];

/** Runs sql as service_role, or as a signed-in user; returns the rows or the error message. */
async function as(sub: string | 'service', sql: string, params: unknown[] = []): Promise<{ rows?: Row[]; message?: string }> {
  await db.exec('SAVEPOINT svc');
  try {
    await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
      JSON.stringify(sub === 'service' ? { role: 'service_role' } : { role: 'authenticated', sub }),
    ]);
    if (sub !== 'service') await db.exec('SET LOCAL ROLE authenticated');
    const rows = (await db.query<Row>(sql, params)).rows;
    await db.exec('RESET ROLE');
    await db.exec('RELEASE SAVEPOINT svc');
    return { rows };
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT svc');
    await db.exec('RELEASE SAVEPOINT svc');
    return { message: (e as Error).message };
  }
}

let seq = 0;
async function resident(): Promise<string> {
  seq++;
  return (
    await one(`INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Test', $1, $2) RETURNING id`, [
      `T${seq}`,
      `+23412000${String(seq).padStart(5, '0')}`,
    ])
  ).id;
}
async function house(): Promise<string> {
  seq++;
  return (
    await one(`INSERT INTO public.houses (house_number, street_id, short_name) SELECT $1, id, $2 FROM public.streets LIMIT 1 RETURNING id`, [
      `TR-${seq}`,
      `TR${seq}`,
    ])
  ).id;
}
const link = (residentId: string, houseId: string, role: string, active = true) =>
  q(`INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES ($1, $2, $3, $4)`, [
    residentId,
    houseId,
    role,
    active,
  ]);
async function wallet(residentId: string, category: string, balance: number): Promise<string> {
  return (
    await one(`INSERT INTO public.resident_wallets (resident_id, charge_category, balance) VALUES ($1, $2, $3) RETURNING id`, [
      residentId,
      category,
      balance,
    ])
  ).id;
}
const balanceOf = async (walletId: string) => Number((await one(`SELECT balance FROM public.resident_wallets WHERE id = $1`, [walletId])).balance);
const transfer = (from: string, to: { resident: string; category: string }, amount: number, reason: string | null = 'Use levy credit for dues', sub: string = 'service') =>
  as(sub, `SELECT public.transfer_wallet_credit($1, $2, $3, $4, $5) AS r`, [from, to.resident, to.category, amount, reason]);
const walletCount = async (residentId: string) =>
  Number((await one(`SELECT count(*) AS n FROM public.resident_wallets WHERE resident_id = $1`, [residentId])).n);
const reverse = (transferId: string, reason: string | null = 'Entered in error', sub: string = 'service') =>
  as(sub, `SELECT public.reverse_wallet_transfer($1, $2) AS r`, [transferId, reason]);

beforeAll(async () => {
  const later = laterMigrations();
  expect(later).toContain(MIGRATION);
  db = await loadSchema(later);
  await replay(
    db,
    'fixtures',
    `
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.test'), ('${NO_PERMISSION}', 'sec@example.test');
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${ADMIN}', 'admin@example.test', 'Admin', id, 'active' FROM public.app_roles WHERE name = 'super_admin'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${NO_PERMISSION}', 'sec@example.test', 'Sec', id, 'active' FROM public.app_roles WHERE name = 'test_staff'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.streets (name) VALUES ('Transfer Street');
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

describe('#1191 transfer_wallet_credit', () => {
  it('moves credit between the wallets of one person, as a linked debit and credit pair', async () => {
    const mrA = await resident();
    const levy = await wallet(mrA, 'development_levy', 5000);
    const dues = await wallet(mrA, 'dues', 0);

    const { rows, message } = await transfer(levy, { resident: mrA, category: 'dues' }, 1500);
    expect(message).toBeUndefined();
    const result = rows![0].r;
    expect(await balanceOf(levy)).toBe(3500);
    expect(await balanceOf(dues)).toBe(1500);

    const pair = await q(
      `SELECT id, wallet_id, type, amount, reference_type, reference_id, description FROM public.wallet_transactions
        WHERE id IN ($1, $2) ORDER BY type`,
      [result.transfer_id, result.credit_transaction_id]
    );
    expect(pair.map((row) => [row.wallet_id, row.type, Number(row.amount), row.reference_type])).toEqual([
      [dues, 'credit', 1500, 'wallet_transfer'],
      [levy, 'debit', 1500, 'wallet_transfer'],
    ]);
    // Each row references the other.
    expect(pair[0].reference_id).toBe(pair[1].id);
    expect(pair[1].reference_id).toBe(pair[0].id);
    expect(pair[1].id).toBe(result.transfer_id);
    expect(pair[1].description).toContain('Use levy credit for dues');
  });

  it('moves credit to a different person linked to the same house', async () => {
    const landlord = await resident();
    const tenant = await resident();
    const h = await house();
    await link(landlord, h, 'non_resident_landlord');
    await link(tenant, h, 'tenant');
    const from = await wallet(landlord, 'dues', 2000);
    const to = await wallet(tenant, 'dues', 0);

    expect((await transfer(from, { resident: tenant, category: 'dues' }, 2000)).message).toBeUndefined();
    expect(await balanceOf(from)).toBe(0);
    expect(await balanceOf(to)).toBe(2000);
  });

  it('refuses two persons with no shared active house link', async () => {
    const a = await resident();
    const b = await resident();
    const h1 = await house();
    const h2 = await house();
    await link(a, h1, 'non_resident_landlord');
    await link(b, h2, 'tenant');
    const from = await wallet(a, 'dues', 2000);
    const to = await wallet(b, 'dues', 0);
    expect((await transfer(from, { resident: b, category: 'dues' }, 100)).message).toMatch(/linked to the same house/);

    // A shared house where one link is no longer active does not count.
    await link(b, h1, 'tenant', false);
    expect((await transfer(from, { resident: b, category: 'dues' }, 100)).message).toMatch(/linked to the same house/);
    expect(await balanceOf(from)).toBe(2000);
  });

  it('refuses an amount above the source balance, a bad amount, an empty reason and the same wallet', async () => {
    const r = await resident();
    const levy = await wallet(r, 'development_levy', 500);
    const dues = await wallet(r, 'dues', 0);

    expect((await transfer(levy, { resident: r, category: 'dues' }, 500.01)).message).toMatch(/more than the source wallet balance/);
    expect((await transfer(levy, { resident: r, category: 'dues' }, 0)).message).toMatch(/greater than zero/);
    expect((await transfer(levy, { resident: r, category: 'dues' }, -5)).message).toMatch(/greater than zero/);
    expect((await transfer(levy, { resident: r, category: 'dues' }, 100, '   ')).message).toMatch(/reason is required/);
    expect((await transfer(levy, { resident: r, category: 'dues' }, 100, null)).message).toMatch(/reason is required/);
    expect((await transfer(levy, { resident: r, category: 'development_levy' }, 100)).message).toMatch(/two different wallets/);
    expect(await balanceOf(levy)).toBe(500);
    expect(Number((await one(`SELECT count(*) AS n FROM public.wallet_transactions WHERE wallet_id IN ($1, $2)`, [levy, dues])).n)).toBe(0);
  });

  it('creates the target wallet on a transfer, and none when the transfer is refused', async () => {
    const landlord = await resident();
    const tenant = await resident();
    const stranger = await resident();
    const h = await house();
    await link(landlord, h, 'non_resident_landlord');
    await link(tenant, h, 'tenant');
    const from = await wallet(landlord, 'dues', 1000);

    expect((await transfer(from, { resident: stranger, category: 'dues' }, 100)).message).toMatch(/linked to the same house/);
    expect((await transfer(from, { resident: tenant, category: 'dues' }, 1000.01)).message).toMatch(/more than the source wallet balance/);
    expect(await walletCount(stranger)).toBe(0);
    expect(await walletCount(tenant)).toBe(0);

    expect((await transfer(from, { resident: tenant, category: 'dues' }, 400)).message).toBeUndefined();
    expect(await walletCount(tenant)).toBe(1);
  });

  it('requires billing.transfer_wallet_credit', async () => {
    const r = await resident();
    const levy = await wallet(r, 'development_levy', 500);
    const dues = await wallet(r, 'dues', 0);

    expect((await transfer(levy, { resident: r, category: 'dues' }, 100, 'x', NO_PERMISSION)).message).toMatch(/Not authorized/);
    expect((await transfer(levy, { resident: r, category: 'dues' }, 100, 'Admin moves it', ADMIN)).message).toBeUndefined();
    expect(await balanceOf(dues)).toBe(100);
  });
});

describe('#1191 reverse_wallet_transfer', () => {
  async function funded() {
    const r = await resident();
    const levy = await wallet(r, 'development_levy', 1000);
    const dues = await wallet(r, 'dues', 0);
    const { rows } = await transfer(levy, { resident: r, category: 'dues' }, 600);
    return { levy, dues, transferId: rows![0].r.transfer_id as string };
  }

  it('moves the amount back once', async () => {
    const { levy, dues, transferId } = await funded();

    const { rows, message } = await reverse(transferId);
    expect(message).toBeUndefined();
    expect(rows![0].r.amount).toBe(600);
    expect(await balanceOf(levy)).toBe(1000);
    expect(await balanceOf(dues)).toBe(0);
    const reversal = await q(
      `SELECT wallet_id, type, description FROM public.wallet_transactions
        WHERE reference_type = 'wallet_transfer_reversal' AND reference_id = $1 ORDER BY type`,
      [transferId]
    );
    expect(reversal.map((row) => [row.wallet_id, row.type])).toEqual([
      [levy, 'credit'],
      [dues, 'debit'],
    ]);
    expect(reversal[0].description).toBe('Reversal of transfer: Entered in error');

    expect((await reverse(transferId)).message).toMatch(/already reversed/);
    expect(await balanceOf(levy)).toBe(1000);
  });

  it('refuses when the target wallet no longer holds the amount', async () => {
    const { levy, dues, transferId } = await funded();
    await q(`UPDATE public.resident_wallets SET balance = 599.99 WHERE id = $1`, [dues]);

    expect((await reverse(transferId)).message).toMatch(/no longer holds the transferred amount/);
    expect(await balanceOf(levy)).toBe(400);
  });

  it('refuses an id that is not a transfer, the credit row of a transfer, and a caller without the permission', async () => {
    const { transferId } = await funded();
    const creditRow = (await one(`SELECT reference_id FROM public.wallet_transactions WHERE id = $1`, [transferId])).reference_id;

    expect((await reverse('99999999-9999-9999-9999-999999999999')).message).toMatch(/Transfer not found/);
    expect((await reverse(creditRow)).message).toMatch(/Transfer not found/);
    expect((await reverse(transferId, 'x', NO_PERMISSION)).message).toMatch(/Not authorized/);
  });
});
