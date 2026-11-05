import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1460: write_off_invoices and undo_invoice_write_off. The schema is replayed into PGlite through
 * every migration; the tests call the real RPCs as service_role and as signed-in users. Each test is
 * rolled back.
 */

const MIGRATION = '20261107140000_invoice_write_offs.sql';
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
    if (sub !== 'service') await db.exec('SET LOCAL row_security = on; SET LOCAL ROLE authenticated');
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
      `W${seq}`,
      `+23413000${String(seq).padStart(5, '0')}`,
    ])
  ).id;
}
async function invoice(residentId: string, amountDue: number, amountPaid = 0, status = 'unpaid', month = '2020-07'): Promise<string> {
  seq++;
  return (
    await one(
      `INSERT INTO public.invoices (resident_id, invoice_number, amount_due, amount_paid, status, due_date, period_start, period_end)
       VALUES ($1, $2, $3, $4, $5::public.invoice_status, ($6 || '-28')::date, ($6 || '-01')::date, ($6 || '-28')::date) RETURNING id`,
      [residentId, `INV-WO-${seq}`, amountDue, amountPaid, status, month]
    )
  ).id;
}
const bill = (id: string) => one(`SELECT status, amount_due::numeric AS due, amount_paid::numeric AS paid FROM public.invoices WHERE id = $1`, [id]);
/** What the resident still owes on bills, as the debt screens count it. */
const owed = async (residentId: string) =>
  Number(
    (
      await one(
        `SELECT coalesce(sum(amount_due - amount_paid), 0) AS n FROM public.invoices
          WHERE resident_id = $1 AND status IN ('unpaid', 'partially_paid')`,
        [residentId]
      )
    ).n
  );
/** Collected on bills, as the collection reports count it (non-void amount_paid). */
const collected = async (residentId: string) =>
  Number((await one(`SELECT coalesce(sum(amount_paid), 0) AS n FROM public.invoices WHERE resident_id = $1 AND status <> 'void'`, [residentId])).n);

const writeOff = (ids: string[], reason: string | null = 'exco_settlement', note: string | null = 'Exco settlement 4 Nov', sub = 'service') =>
  as(sub, `SELECT public.write_off_invoices($1::uuid[], $2, $3, $4) AS r`, [ids, reason, note, sub === 'service' ? ADMIN : null]);
const undo = (batchId: string, sub = 'service') => as(sub, `SELECT public.undo_invoice_write_off($1) AS r`, [batchId]);

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

describe('#1460 permission seed', () => {
  it('grants billing.write_off_invoices to super_admin and chairman only', async () => {
    // The PGlite schema may not hold every built-in role; the grant must equal the ones it holds.
    const present = await q(`SELECT name FROM public.app_roles WHERE name IN ('super_admin', 'chairman') ORDER BY 1`);
    expect(present.map((r) => r.name)).toContain('super_admin');
    const roles = await q(
      `SELECT r.name FROM public.role_permissions rp JOIN public.app_roles r ON r.id = rp.role_id
         JOIN public.app_permissions p ON p.id = rp.permission_id
        WHERE p.name = 'billing.write_off_invoices' ORDER BY 1`
    );
    expect(roles.map((r) => r.name)).toEqual(present.map((r) => r.name));
  });
});

describe('#1460 invoice_write_offs table', () => {
  it('names the foreign keys the app embeds by', async () => {
    const names = await q(
      `SELECT conname FROM pg_constraint WHERE conrelid = 'public.invoice_write_offs'::regclass AND contype = 'f' ORDER BY 1`
    );
    expect(names.map((r) => r.conname)).toEqual([
      'invoice_write_offs_house_id_fkey',
      'invoice_write_offs_invoice_id_fkey',
      'invoice_write_offs_resident_id_fkey',
      'invoice_write_offs_written_off_by_fkey',
    ]);
  });
});

describe('#1460 write_off_invoices', () => {
  it('voids unpaid bills and records one write-off row each, under one batch', async () => {
    const r = await resident();
    const a = await invoice(r, 5000, 0, 'unpaid', '2020-07');
    const b = await invoice(r, 5000, 0, 'unpaid', '2020-08');
    const keep = await invoice(r, 10000, 0, 'unpaid', '2025-01');

    const { rows, message } = await writeOff([a, b]);
    expect(message).toBeUndefined();
    const result = rows![0].r;
    expect(result).toMatchObject({ success: true, count: 2, total: 10000, resident_id: r });

    expect((await bill(a)).status).toBe('void');
    expect((await bill(b)).status).toBe('void');
    expect((await bill(keep)).status).toBe('unpaid');
    expect(await owed(r)).toBe(10000);

    const wo = await q(`SELECT invoice_id, batch_id, amount_written_off::numeric AS amt, original_status, reason, note, written_off_by
                          FROM public.invoice_write_offs WHERE resident_id = $1 ORDER BY invoice_id`, [r]);
    expect(wo).toHaveLength(2);
    expect(new Set(wo.map((w) => w.batch_id))).toEqual(new Set([result.batch_id]));
    expect(wo.every((w) => Number(w.amt) === 5000 && w.original_status === 'unpaid' && w.reason === 'exco_settlement')).toBe(true);
    expect(wo[0].written_off_by).toBe(ADMIN);
  });

  it('writes off only the unpaid balance of a part-paid bill and keeps its paid part counted', async () => {
    const r = await resident();
    const part = await invoice(r, 5000, 2000, 'partially_paid');
    const before = await collected(r);

    const { rows, message } = await writeOff([part]);
    expect(message).toBeUndefined();
    expect(rows![0].r).toMatchObject({ success: true, count: 1, total: 3000 });

    const after = await bill(part);
    expect(after.status).toBe('paid');
    expect(Number(after.due)).toBe(2000);
    expect(Number(after.paid)).toBe(2000);
    expect(await owed(r)).toBe(0);
    expect(await collected(r)).toBe(before);
    const wo = await one(`SELECT amount_written_off::numeric AS amt, original_amount_due::numeric AS due, original_status FROM public.invoice_write_offs WHERE invoice_id = $1`, [part]);
    expect([Number(wo.amt), Number(wo.due), wo.original_status]).toEqual([3000, 5000, 'partially_paid']);
  });

  it('refuses bills of two residents, a paid or void bill, a missing bill, a bad reason or a short note, writing nothing', async () => {
    const r1 = await resident();
    const r2 = await resident();
    const a = await invoice(r1, 5000);
    const other = await invoice(r2, 5000);
    const paid = await invoice(r1, 5000, 5000, 'paid');
    const voided = await invoice(r1, 5000, 0, 'void');

    const err = async (p: ReturnType<typeof writeOff>) => (await p).rows![0].r.error as string;
    expect(await err(writeOff([a, other]))).toMatch(/one resident/);
    expect(await err(writeOff([a, paid]))).toMatch(/Only unpaid or part-paid/);
    expect(await err(writeOff([a, voided]))).toMatch(/Only unpaid or part-paid/);
    expect(await err(writeOff([a, '33333333-3333-3333-3333-333333333333']))).toMatch(/not found/);
    expect(await err(writeOff([]))).toMatch(/at least one bill/);
    expect(await err(writeOff([a], 'goodwill'))).toMatch(/reason/);
    expect(await err(writeOff([a], 'hardship', '  ab  '))).toMatch(/at least 5 characters/);

    expect((await bill(a)).status).toBe('unpaid');
    expect(Number((await one(`SELECT count(*) AS n FROM public.invoice_write_offs WHERE resident_id IN ($1, $2)`, [r1, r2])).n)).toBe(0);
  });

  it('refuses a signed-in user without the permission, and records the signed-in actor, not p_actor', async () => {
    const r = await resident();
    const a = await invoice(r, 5000);
    expect((await as(NO_PERMISSION, `SELECT public.write_off_invoices($1::uuid[], 'other', 'A valid note', NULL) AS r`, [[a]])).message).toMatch(
      /Not authorized/
    );
    expect((await bill(a)).status).toBe('unpaid');

    const { rows, message } = await as(ADMIN, `SELECT public.write_off_invoices($1::uuid[], 'other', 'A valid note', $2) AS r`, [[a], NO_PERMISSION]);
    expect(message).toBeUndefined();
    expect(rows![0].r.success).toBe(true);
    expect((await one(`SELECT written_off_by FROM public.invoice_write_offs WHERE invoice_id = $1`, [a])).written_off_by).toBe(ADMIN);
  });

  it('lets an admin read write-off rows and hides them from a user with no billing or report permission', async () => {
    const r = await resident();
    const a = await invoice(r, 5000);
    await writeOff([a]);
    const read = (sub: string) => as(sub, `SELECT count(*) AS n FROM public.invoice_write_offs WHERE invoice_id = $1`, [a]);
    const asAdmin = await read(ADMIN);
    expect(asAdmin.message).toBeUndefined();
    expect(Number(asAdmin.rows![0].n)).toBe(1);
    expect(Number((await read(NO_PERMISSION)).rows![0].n)).toBe(0);
    expect((await as(ADMIN, `DELETE FROM public.invoice_write_offs WHERE invoice_id = $1`, [a])).message).toMatch(/permission denied/);
  });
});

describe('#1460 undo_invoice_write_off', () => {
  it('puts every bill of the batch back as it was and removes the rows', async () => {
    const r = await resident();
    const a = await invoice(r, 5000);
    const part = await invoice(r, 5000, 2000, 'partially_paid');
    const batch = (await writeOff([a, part])).rows![0].r.batch_id as string;

    const { rows, message } = await undo(batch);
    expect(message).toBeUndefined();
    expect(rows![0].r).toMatchObject({ success: true, count: 2, total: 8000 });
    expect(await bill(a)).toMatchObject({ status: 'unpaid' });
    const restored = await bill(part);
    expect([restored.status, Number(restored.due), Number(restored.paid)]).toEqual(['partially_paid', 5000, 2000]);
    expect(await owed(r)).toBe(8000);
    expect(Number((await one(`SELECT count(*) AS n FROM public.invoice_write_offs WHERE batch_id = $1`, [batch])).n)).toBe(0);
  });

  it('refuses when a bill has changed since the write-off, and an unknown batch', async () => {
    const r = await resident();
    const part = await invoice(r, 5000, 2000, 'partially_paid');
    const batch = (await writeOff([part])).rows![0].r.batch_id as string;
    await q(`UPDATE public.invoices SET amount_paid = 1500 WHERE id = $1`, [part]);

    expect((await undo(batch)).rows![0].r.error).toMatch(/changed since the write-off/);
    expect(Number((await one(`SELECT count(*) AS n FROM public.invoice_write_offs WHERE batch_id = $1`, [batch])).n)).toBe(1);
    expect((await undo('44444444-4444-4444-4444-444444444444')).rows![0].r.error).toMatch(/not found/);
  });

  it('refuses a second undo of the same batch and changes nothing', async () => {
    const r = await resident();
    const a = await invoice(r, 5000);
    const batch = (await writeOff([a])).rows![0].r.batch_id as string;
    expect((await undo(batch)).rows![0].r.success).toBe(true);
    // A later write-off of the same bill must not be touched by a repeated undo of the first batch.
    const again = (await writeOff([a])).rows![0].r.batch_id as string;

    const second = (await undo(batch)).rows![0].r;
    expect(second.success).toBe(false);
    expect(second.total ?? null).toBeNull();
    expect((await bill(a)).status).toBe('void');
    expect(Number((await one(`SELECT count(*) AS n FROM public.invoice_write_offs WHERE batch_id = $1`, [again])).n)).toBe(1);
  });

  it('refuses a signed-in user without the permission', async () => {
    const r = await resident();
    const a = await invoice(r, 5000);
    const batch = (await writeOff([a])).rows![0].r.batch_id as string;
    expect((await undo(batch, NO_PERMISSION)).message).toMatch(/Not authorized/);
    expect((await bill(a)).status).toBe('void');
  });
});
