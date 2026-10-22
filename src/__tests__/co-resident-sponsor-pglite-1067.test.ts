import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * Co-resident sponsor rule (#1067), run for real: the baseline and every later migration are
 * replayed into PGlite (in-process Postgres, no network), then resident_houses rows are written
 * directly so validate_sponsor_requirement decides. Each test runs in a transaction that is rolled back.
 */

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await db.query<Row>(sql, params)).rows[0];

/** Runs sql; returns the error message it raised, or null. */
async function attempt(sql: string, params: unknown[] = []): Promise<string | null> {
  await db.exec('SAVEPOINT attempt');
  try {
    await db.query(sql, params);
    await db.exec('RELEASE SAVEPOINT attempt');
    return null;
  } catch (e) {
    await db.exec('ROLLBACK TO SAVEPOINT attempt');
    return (e as Error).message;
  }
}

let seq = 0;
async function resident(): Promise<string> {
  seq++;
  return (
    await one(
      `INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Test', $1, $2) RETURNING id`,
      [`R${seq}`, `+23400000${String(seq).padStart(5, '0')}`]
    )
  ).id;
}
async function house(): Promise<string> {
  seq++;
  return (
    await one(
      `INSERT INTO public.houses (house_number, street_id, short_name) SELECT $1, id, $2 FROM public.streets LIMIT 1 RETURNING id`,
      [`T-${seq}`, `T${seq}`]
    )
  ).id;
}
const link = async (residentId: string, houseId: string, role: string, sponsor: string | null = null): Promise<string> =>
  (
    await one(
      `INSERT INTO public.resident_houses (resident_id, house_id, resident_role, sponsor_resident_id) VALUES ($1, $2, $3, $4) RETURNING id`,
      [residentId, houseId, role, sponsor]
    )
  ).id;
const tryLink = (residentId: string, houseId: string, role: string, sponsor: string | null, active = true) =>
  attempt(
    `INSERT INTO public.resident_houses (resident_id, house_id, resident_role, sponsor_resident_id, is_active) VALUES ($1, $2, $3, $4, $5)`,
    [residentId, houseId, role, sponsor, active]
  );

beforeAll(async () => {
  const later = laterMigrations();
  expect(later).toContain('20261028090000_co_resident_sponsor_rule.sql');
  db = await loadSchema(later);
  await replay(db, 'fixtures', `INSERT INTO public.streets (name) VALUES ('Test Street');`);
}, 180_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('BEGIN');
});
afterEach(async () => {
  await db.exec('ROLLBACK');
});

describe('co-resident sponsor rule (#1067)', () => {
  it.each(['resident_landlord', 'tenant'])('accepts a co-resident sponsored by the %s of the same house', async (role) => {
    const h = await house();
    const sponsor = await resident();
    await link(sponsor, h, role);

    expect(await tryLink(await resident(), h, 'co_resident', sponsor)).toBeNull();
  });

  it('rejects an active co-resident with no sponsor', async () => {
    const h = await house();
    await link(await resident(), h, 'tenant');

    expect(await tryLink(await resident(), h, 'co_resident', null)).toMatch(/Co-residents must have a sponsor_resident_id/);
  });

  it.each(['non_resident_landlord', 'developer', 'household_member'])('rejects a %s as sponsor', async (role) => {
    const h = await house();
    const sponsor = await resident();
    // A household member needs nothing; a primary role needs nothing either.
    await link(sponsor, h, role);

    expect(await tryLink(await resident(), h, 'co_resident', sponsor)).toMatch(/sponsor must be the Resident Landlord or Tenant/);
  });

  it('rejects a sponsor who is the resident of another house', async () => {
    const h = await house();
    const other = await house();
    const sponsor = await resident();
    await link(sponsor, other, 'tenant');

    expect(await tryLink(await resident(), h, 'co_resident', sponsor)).toMatch(/sponsor must be the Resident Landlord or Tenant/);
  });

  it('rejects a sponsor whose own row is inactive', async () => {
    const h = await house();
    const sponsor = await resident();
    const sponsorRow = await link(sponsor, h, 'tenant');
    await db.query(`UPDATE public.resident_houses SET is_active = false WHERE id = $1`, [sponsorRow]);

    expect(await tryLink(await resident(), h, 'co_resident', sponsor)).toMatch(/sponsor must be the Resident Landlord or Tenant/);
  });

  it('allows an inactive co-resident row without a sponsor (history rows)', async () => {
    const h = await house();

    expect(await tryLink(await resident(), h, 'co_resident', null, false)).toBeNull();
  });

  it('checks a co-resident row on reactivation', async () => {
    const h = await house();
    const sponsor = await resident();
    const sponsorRow = await link(sponsor, h, 'tenant');
    const co = await link(await resident(), h, 'co_resident', sponsor);
    await db.query(`UPDATE public.resident_houses SET is_active = false WHERE id = ANY($1)`, [[co, sponsorRow]]);

    const err = await attempt(`UPDATE public.resident_houses SET is_active = true WHERE id = $1`, [co]);

    expect(err).toMatch(/sponsor must be the Resident Landlord or Tenant/);
  });

  it('rejects changing a household member into a co-resident without a sponsor', async () => {
    const h = await house();
    await link(await resident(), h, 'tenant');
    const member = await link(await resident(), h, 'household_member');

    const err = await attempt(`UPDATE public.resident_houses SET resident_role = 'co_resident' WHERE id = $1`, [member]);

    expect(err).toMatch(/Co-residents must have a sponsor_resident_id/);
  });

  it('lets a co-resident be deactivated after the sponsor has left', async () => {
    const h = await house();
    const sponsor = await resident();
    const sponsorRow = await link(sponsor, h, 'resident_landlord');
    const co = await link(await resident(), h, 'co_resident', sponsor);
    await db.query(`UPDATE public.resident_houses SET resident_role = 'non_resident_landlord' WHERE id = $1`, [sponsorRow]);

    expect(await attempt(`UPDATE public.resident_houses SET is_active = false WHERE id = $1`, [co])).toBeNull();
  });
});

describe('domestic staff and caretaker rule is unchanged (#1067)', () => {
  it('still accepts a Property Owner as sponsor of a caretaker', async () => {
    const h = await house();
    const owner = await resident();
    await link(owner, h, 'non_resident_landlord');

    expect(await tryLink(await resident(), h, 'caretaker', owner)).toBeNull();
  });

  it('still rejects domestic staff with no sponsor', async () => {
    const h = await house();

    expect(await tryLink(await resident(), h, 'domestic_staff', null)).toMatch(/Domestic staff and caretakers must have a sponsor_resident_id/);
  });

  it('lets staff be deactivated after the sponsor has left', async () => {
    const h = await house();
    const sponsor = await resident();
    const sponsorRow = await link(sponsor, h, 'tenant');
    const staff = await link(await resident(), h, 'domestic_staff', sponsor);
    await db.query(`UPDATE public.resident_houses SET is_active = false WHERE id = $1`, [sponsorRow]);

    expect(await attempt(`UPDATE public.resident_houses SET is_active = false WHERE id = $1`, [staff])).toBeNull();
  });
});
