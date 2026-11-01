import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, migrationsDir, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * Resident names are stored in capitals (#1414), run for real: the baseline and every migration after it
 * are replayed into PGlite (in-process Postgres, no network). Each trigger test runs in a transaction that
 * is rolled back. The backfill test loads a second schema without the migration, inserts a mixed-case
 * resident, then runs the migration file.
 */

const MIGRATION = '20261106100000_residents_uppercase_names.sql';

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const q = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Row[]> => (await db.query<Row>(sql, params)).rows;
const one = async (db: PGlite, sql: string, params: unknown[] = []): Promise<Row> => (await q(db, sql, params))[0];

let seq = 0;
async function resident(db: PGlite, extra: Record<string, unknown> = {}): Promise<string> {
  seq++;
  const cols = { first_name: 'Test', last_name: `R${seq}`, phone_primary: `+23400000${String(seq).padStart(5, '0')}`, ...extra };
  const keys = Object.keys(cols);
  return (
    await one(
      db,
      `INSERT INTO public.residents (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING id`,
      Object.values(cols)
    )
  ).id;
}
const names = (db: PGlite, id: string) =>
  one(db, 'SELECT first_name, last_name, company_name FROM public.residents WHERE id = $1', [id]);

describe('residents_uppercase_names trigger', () => {
  let db: PGlite;

  beforeAll(async () => {
    const later = laterMigrations();
    expect(later).toContain(MIGRATION);
    db = await loadSchema(later);
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  beforeEach(async () => {
    await db.exec('ROLLBACK').catch(() => {});
    await db.exec('BEGIN');
    return async () => {
      await db.exec('ROLLBACK');
    };
  });

  it('uppercases first_name, last_name and company_name on INSERT', async () => {
    const id = await resident(db, { first_name: 'Ada', last_name: 'Obi Okafor', company_name: 'Acme Ltd' });
    expect(await names(db, id)).toEqual({ first_name: 'ADA', last_name: 'OBI OKAFOR', company_name: 'ACME LTD' });
  });

  it('uppercases a name changed by UPDATE', async () => {
    const id = await resident(db, { first_name: 'Ada' });
    await db.query('UPDATE public.residents SET first_name = $1 WHERE id = $2', ['chika', id]);
    expect((await names(db, id)).first_name).toBe('CHIKA');
    await db.query('UPDATE public.residents SET last_name = $1 WHERE id = $2', ['Eze', id]);
    expect((await names(db, id)).last_name).toBe('EZE');
    await db.query('UPDATE public.residents SET company_name = $1 WHERE id = $2', ['Beta Ltd', id]);
    expect((await names(db, id)).company_name).toBe('BETA LTD');
  });

  it('leaves a NULL company_name NULL', async () => {
    const id = await resident(db, { first_name: 'Ada' });
    expect((await names(db, id)).company_name).toBeNull();
  });
});

describe('residents uppercase names backfill', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await loadSchema(laterMigrations().filter((f) => f !== MIGRATION));
  }, 180_000);

  afterAll(async () => {
    await db?.close();
  });

  it('uppercases existing mixed-case rows when the migration runs', async () => {
    const id = await resident(db, { first_name: 'Ada', last_name: 'Obi Okafor', company_name: 'Acme Ltd' });
    expect(await names(db, id)).toEqual({ first_name: 'Ada', last_name: 'Obi Okafor', company_name: 'Acme Ltd' });
    const companyOnly = await resident(db, { first_name: 'KEMI', last_name: 'BELLO', company_name: 'Gamma Ltd' });

    await replay(db, MIGRATION, readFileSync(path.join(migrationsDir, MIGRATION), 'utf8'));

    expect(await names(db, id)).toEqual({ first_name: 'ADA', last_name: 'OBI OKAFOR', company_name: 'ACME LTD' });
    expect((await names(db, companyOnly)).company_name).toBe('GAMMA LTD');
  });
});
