import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1390: the database half of "Remember this computer for 30 days". Runs the real migrations in
 * PGlite; each test is rolled back. A password change, two-factor turned off and a role change
 * revoke all of the user's remembered computers, from any path; the table is service role only.
 */

const ADMIN = '55555555-5555-5555-5555-555555555555';
const OTHER = '66666666-6666-6666-6666-666666666666';
const HASH = (n: number) => String(n).repeat(64).slice(0, 64);

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await db.query<Row>(sql, params)).rows[0];
const live = async (profile = ADMIN) =>
  (await one(`SELECT count(*)::int AS n FROM public.two_factor_trusted_devices WHERE profile_id = $1 AND revoked_at IS NULL`, [profile])).n;
const reasons = async (profile = ADMIN) =>
  (await db.query<Row>(`SELECT revoked_reason FROM public.two_factor_trusted_devices WHERE profile_id = $1 ORDER BY token_hash`, [profile])).rows.map((r) => r.revoked_reason);

beforeAll(async () => {
  db = await loadSchema(laterMigrations());
  await replay(
    db,
    'fixtures',
    `
    INSERT INTO auth.users (id, email, encrypted_password) VALUES ('${ADMIN}', 'a@example.test', 'old'), ('${OTHER}', 'b@example.test', 'old');
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status, two_factor_enabled)
      SELECT u.id, u.email, 'Admin', r.id, 'active', true FROM auth.users u, public.app_roles r WHERE r.name = 'super_admin'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active', two_factor_enabled = true;
    `
  );
}, 180_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.exec('BEGIN');
  await db.query(
    `INSERT INTO public.two_factor_trusted_devices (profile_id, token_hash) VALUES ($1, $3), ($1, $4), ($2, $5)`,
    [ADMIN, OTHER, HASH(1), HASH(2), HASH(3)]
  );
  return async () => {
    await db.exec('ROLLBACK');
  };
});

describe('two_factor_trusted_devices revoke triggers', () => {
  it('a new row lasts 30 days', async () => {
    expect((await one(`SELECT (expires_at - created_at) = interval '30 days' AS ok FROM public.two_factor_trusted_devices LIMIT 1`)).ok).toBe(true);
  });

  it('a password change revokes all of that user’s rows, and only theirs, with one audit row', async () => {
    await db.query(`UPDATE auth.users SET encrypted_password = 'new' WHERE id = $1`, [ADMIN]);
    expect(await live()).toBe(0);
    expect(await reasons()).toEqual(['password_changed', 'password_changed']);
    expect(await live(OTHER)).toBe(1);
    const audit = await one(`SELECT action, metadata FROM public.two_factor_audit_log WHERE profile_id = $1`, [ADMIN]);
    expect(audit).toMatchObject({ action: 'settings_updated', metadata: { event: 'trusted_device_forgotten', reason: 'password_changed', count: 2 } });
  });

  it('another auth.users update (sign-in time) revokes nothing', async () => {
    await db.query(`UPDATE auth.users SET last_sign_in_at = now(), encrypted_password = encrypted_password WHERE id = $1`, [ADMIN]);
    expect(await live()).toBe(2);
  });

  it('turning two-factor off revokes all rows', async () => {
    await db.query(`UPDATE public.profiles SET two_factor_enabled = false WHERE id = $1`, [ADMIN]);
    expect(await live()).toBe(0);
    expect(await reasons()).toEqual(['two_factor_disabled', 'two_factor_disabled']);
  });

  it('removing or changing the role revokes all rows', async () => {
    await db.query(`UPDATE public.profiles SET role_id = NULL WHERE id = $1`, [ADMIN]);
    expect(await reasons()).toEqual(['role_changed', 'role_changed']);
    expect(await live(OTHER)).toBe(1);
    await db.query(`UPDATE public.profiles SET role_id = (SELECT id FROM public.app_roles WHERE name = 'chairman') WHERE id = $1`, [OTHER]);
    expect(await live(OTHER)).toBe(0);
  });

  it('an unrelated profile update revokes nothing', async () => {
    await db.query(`UPDATE public.profiles SET full_name = 'New name', two_factor_enabled = true WHERE id = $1`, [ADMIN]);
    expect(await live()).toBe(2);
  });

  it('only the hash of a token can be stored', async () => {
    await expect(
      db.query(`INSERT INTO public.two_factor_trusted_devices (profile_id, token_hash) VALUES ($1, 'raw-token')`, [ADMIN])
    ).rejects.toThrow(/token_hash_check/);
  });

  it('clients have no access to the table or the revoke function', async () => {
    expect((await one(`SELECT has_table_privilege('authenticated', 'public.two_factor_trusted_devices', 'SELECT') AS ok`)).ok).toBe(false);
    expect((await one(`SELECT has_table_privilege('anon', 'public.two_factor_trusted_devices', 'SELECT') AS ok`)).ok).toBe(false);
    expect((await one(`SELECT relrowsecurity AS ok FROM pg_class WHERE oid = 'public.two_factor_trusted_devices'::regclass`)).ok).toBe(true);
    expect(
      (await one(`SELECT has_function_privilege('authenticated', 'public.two_factor_trusted_devices_revoke_all(uuid, text)', 'EXECUTE') AS ok`)).ok
    ).toBe(false);
  });
});
