import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { laterMigrations, loadSchema, replay } from '@/__tests__/helpers/pglite-schema';

/**
 * #1056: only accounts holding settings.manage_general may add, replace or remove files in the
 * logos bucket; anyone may still read them. Runs the real migrations in PGlite; each test is
 * rolled back.
 */

const ADMIN = '55555555-5555-5555-5555-555555555555';
const RESIDENT = '66666666-6666-6666-6666-666666666666';
const EXISTING = 'estate-logo-existing.png';

let db: PGlite;

type Row = Record<string, unknown> & Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/** Act as the given account through PostgREST's role, with row security enforced. */
const actAs = async (id: string) => {
  await db.query(`SELECT set_config('request.jwt.claims', $1, true)`, [JSON.stringify({ sub: id, role: 'authenticated' })]);
  await db.exec('SET LOCAL row_security = on; SET LOCAL ROLE authenticated');
};

const upload = () => db.exec(`SAVEPOINT s; INSERT INTO storage.objects (bucket_id, name) VALUES ('logos', 'estate-logo-new.png')`);
const replace = async () =>
  (await db.query(`UPDATE storage.objects SET name = 'estate-logo-replaced.png' WHERE name = '${EXISTING}'`)).affectedRows;
const remove = async () => (await db.query(`DELETE FROM storage.objects WHERE name = '${EXISTING}'`)).affectedRows;
const read = async () =>
  (await db.query<Row>(`SELECT count(*)::int AS n FROM storage.objects WHERE bucket_id = 'logos'`)).rows[0].n;

beforeAll(async () => {
  db = await loadSchema(laterMigrations());
  await replay(
    db,
    'fixtures',
    `
    GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated;
    INSERT INTO public.app_roles (name, display_name) SELECT 'resident', 'Resident'
      WHERE NOT EXISTS (SELECT 1 FROM public.app_roles WHERE name = 'resident');
    INSERT INTO auth.users (id, email) VALUES ('${ADMIN}', 'admin@example.test'), ('${RESIDENT}', 'resident@example.test');
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${ADMIN}', 'admin@example.test', 'Admin', id, 'active' FROM public.app_roles WHERE name = 'super_admin'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.profiles (id, email, full_name, role_id, approval_status)
      SELECT '${RESIDENT}', 'resident@example.test', 'Resident', id, 'active' FROM public.app_roles WHERE name = 'resident'
      ON CONFLICT (id) DO UPDATE SET role_id = EXCLUDED.role_id, approval_status = 'active';
    INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
      VALUES ('settings.manage_general', 'Manage general settings', 'Manage general settings', 'settings', true)
      ON CONFLICT (name) DO NOTHING;
    INSERT INTO public.role_permissions (role_id, permission_id)
      SELECT r.id, p.id FROM public.app_roles r, public.app_permissions p
      WHERE r.name = 'super_admin' AND p.name = 'settings.manage_general' ON CONFLICT DO NOTHING;
    INSERT INTO storage.objects (bucket_id, name) VALUES ('logos', '${EXISTING}');
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

describe('logos bucket writes', () => {
  it('an account without settings.manage_general cannot upload, replace or delete a logo', async () => {
    await actAs(RESIDENT);
    await expect(upload()).rejects.toThrow(/row-level security/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    expect(await replace()).toBe(0);
    expect(await remove()).toBe(0);
  });

  it('an account with settings.manage_general can upload, replace and delete a logo', async () => {
    await actAs(ADMIN);
    await upload();
    expect(await replace()).toBe(1);
    expect(await db.query(`DELETE FROM storage.objects WHERE name = 'estate-logo-replaced.png'`)).toMatchObject({ affectedRows: 1 });
  });

  it('a settings admin with two-factor on but the second step not done cannot write', async () => {
    await db.query(`UPDATE public.profiles SET two_factor_enabled = true WHERE id = $1`, [ADMIN]);
    await actAs(ADMIN);
    await expect(upload()).rejects.toThrow(/row-level security/);
    await db.exec('ROLLBACK TO SAVEPOINT s');
    expect(await remove()).toBe(0);
  });

  it('anyone can still read logos', async () => {
    await actAs(RESIDENT);
    expect(await read()).toBe(1);
    await db.exec(`SELECT set_config('request.jwt.claims', '', true); RESET ROLE; SET LOCAL ROLE anon`);
    expect(await read()).toBe(1);
  });
});
