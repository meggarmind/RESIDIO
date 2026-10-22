import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1029: the database half of two-factor login. Runs the real migrations in PGlite; each test is
 * rolled back. Covers the "second step done" check inside the admin permission helpers, the atomic
 * try limit, and single-use authenticator steps.
 */

const ADMIN = '22222222-2222-2222-2222-222222222222';
const SESSION = '33333333-3333-3333-3333-333333333333';
const OTHER_SESSION = '44444444-4444-4444-4444-444444444444';
const PERMISSION = 'two_factor_test.view';

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
const one = async (sql: string, params: unknown[] = []): Promise<Row> => (await db.query<Row>(sql, params)).rows[0];

/** Act as the admin, signed in with the given login token session. */
const signIn = (sessionId: string) =>
  db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: ADMIN, session_id: sessionId })]);

const hasPermission = async () => (await one(`SELECT public.has_permission($1) AS ok`, [PERMISSION])).ok;
const claim = async (now = '2026-10-22T10:00:00Z') =>
  one(`SELECT * FROM public.two_factor_claim_attempt($1, 'login', $2::timestamptz)`, [ADMIN, now]);

beforeAll(async () => {
  db = await loadSchema(laterMigrations());
  await replay(
    db,
    'fixtures',
    `
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.test');
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${ADMIN}', 'admin@example.test', 'Admin', id, 'active' FROM public.app_roles WHERE name = 'super_admin'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
      VALUES ('${PERMISSION}', 'Test', 'Test', 'two_factor', true);
    INSERT INTO public.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM public.app_roles r, public.app_permissions p
      WHERE r.name = 'super_admin' AND p.name = '${PERMISSION}';
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

describe('second step done, checked in the database', () => {
  it('two-factor off: admin permissions work without a verified session', async () => {
    await signIn(SESSION);
    expect(await hasPermission()).toBe(true);
    expect((await one(`SELECT public.is_super_admin() AS ok`)).ok).toBe(true);
  });

  it('two-factor on and second step not done: every admin helper denies', async () => {
    await db.query(`UPDATE public.profiles SET two_factor_enabled = true WHERE id = $1`, [ADMIN]);
    await signIn(SESSION);
    expect(await hasPermission()).toBe(false);
    expect((await one(`SELECT public.is_super_admin() AS ok`)).ok).toBe(false);
    expect((await one(`SELECT public.get_my_role_name() AS r`)).r).toBeNull();
    expect((await one(`SELECT count(*)::int AS n FROM public.get_my_permissions()`)).n).toBe(0);
    expect((await one(`SELECT count(*)::int AS n FROM public.get_my_access()`)).n).toBe(0);
  });

  it('two-factor on and second step done in THIS session: allowed; another session is still denied', async () => {
    await db.query(`UPDATE public.profiles SET two_factor_enabled = true WHERE id = $1`, [ADMIN]);
    await db.query(
      `INSERT INTO public.two_factor_verified_sessions (session_id, profile_id, expires_at) VALUES ($1, $2, now() + interval '1 day')`,
      [SESSION, ADMIN]
    );
    await signIn(SESSION);
    expect(await hasPermission()).toBe(true);
    expect((await one(`SELECT public.get_my_role_name() AS r`)).r).toBe('super_admin');

    await signIn(OTHER_SESSION);
    expect(await hasPermission()).toBe(false);
  });

  it('an expired verified session is denied', async () => {
    await db.query(`UPDATE public.profiles SET two_factor_enabled = true WHERE id = $1`, [ADMIN]);
    await db.query(
      `INSERT INTO public.two_factor_verified_sessions (session_id, profile_id, expires_at) VALUES ($1, $2, now() - interval '1 minute')`,
      [SESSION, ADMIN]
    );
    await signIn(SESSION);
    expect(await hasPermission()).toBe(false);
  });
});

describe('two_factor_claim_attempt', () => {
  it('allows 5 tries in 15 minutes, then refuses until the window ends', async () => {
    const remaining: number[] = [];
    for (let i = 0; i < 5; i++) {
      const r = await claim();
      expect(r.allowed).toBe(true);
      remaining.push(r.remaining);
    }
    expect(remaining).toEqual([4, 3, 2, 1, 0]);

    const refused = await claim('2026-10-22T10:10:00Z');
    expect(refused).toMatchObject({ allowed: false, remaining: 0 });
    expect(new Date(refused.retry_at).toISOString()).toBe('2026-10-22T10:15:00.000Z');

    expect(await claim('2026-10-22T10:15:00Z')).toMatchObject({ allowed: true, remaining: 4 });
  });

  it('counts per purpose', async () => {
    for (let i = 0; i < 5; i++) await claim();
    const manage = await one(`SELECT * FROM public.two_factor_claim_attempt($1, 'manage', now())`, [ADMIN]);
    expect(manage.allowed).toBe(true);
  });

  it('is not callable by a signed-in user', async () => {
    const grant = await one(
      `SELECT has_function_privilege('authenticated', 'public.two_factor_claim_attempt(uuid,text,timestamptz)', 'EXECUTE') AS g`
    );
    expect(grant.g).toBe(false);
  });
});

describe('two_factor_accept_totp_step', () => {
  const accept = async (step: number) =>
    (await one(`SELECT public.two_factor_accept_totp_step($1, $2) AS ok`, [ADMIN, step])).ok;

  it('accepts a step once and never an older one', async () => {
    expect(await accept(100)).toBe(true);
    expect(await accept(100)).toBe(false);
    expect(await accept(99)).toBe(false);
    expect(await accept(101)).toBe(true);
  });
});
