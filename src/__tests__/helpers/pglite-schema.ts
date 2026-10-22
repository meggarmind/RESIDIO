import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
import { uuid_ossp } from '@electric-sql/pglite/contrib/uuid_ossp';

/**
 * Replays the schema into PGlite (in-process Postgres, no network) behind Supabase stand-ins: the
 * baseline, then every migration after it. Shared by the *-pglite tests.
 */

const root = fileURLToPath(new URL('../../..', import.meta.url));
export const migrationsDir = path.join(root, 'supabase/migrations');
const BASELINE_CUTOFF = '20260907000000';

// Split SQL into statements, respecting quotes, dollar quotes and comments.
export function split(sql: string): string[] {
  const out: string[] = [];
  let cur = '';
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];
    if (c === '-' && sql[i + 1] === '-') {
      const j = sql.indexOf('\n', i);
      const end = j === -1 ? sql.length : j;
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") { j += 2; continue; }
        if (sql[j] === "'") break;
        j++;
      }
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '"') {
      const j = sql.indexOf('"', i + 1);
      cur += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z_0-9]*)?\$/.exec(sql.slice(i));
      if (m) {
        const tag = m[0];
        const j = sql.indexOf(tag, i + tag.length);
        cur += sql.slice(i, j + tag.length);
        i = j + tag.length;
        continue;
      }
    }
    if (c === ';') {
      out.push(cur + ';');
      cur = '';
      i++;
      continue;
    }
    cur += c;
    i++;
  }
  if (cur.trim()) out.push(cur);
  return out.filter((s) => s.replace(/--[^\n]*/g, '').trim() && s.replace(/--[^\n]*/g, '').trim() !== ';');
}


export const PRELUDE = `
CREATE SCHEMA IF NOT EXISTS auth; CREATE SCHEMA IF NOT EXISTS extensions; CREATE SCHEMA IF NOT EXISTS storage;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
GRANT USAGE ON SCHEMA public, auth, extensions, storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, raw_user_meta_data jsonb, raw_app_meta_data jsonb, created_at timestamptz DEFAULT now(), phone text, email_confirmed_at timestamptz, last_sign_in_at timestamptz);
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(coalesce(current_setting('request.jwt.claim.sub', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')), '')::uuid $$;
CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT coalesce(current_setting('request.jwt.claim.role', true), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role')) $$;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS $$ SELECT coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE FUNCTION auth.email() RETURNS text LANGUAGE sql STABLE AS $$ SELECT auth.jwt() ->> 'email' $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO anon, authenticated, service_role;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now(), owner uuid);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb, created_at timestamptz DEFAULT now());
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql AS $$ SELECT string_to_array(name, '/') $$;
`;

// The only two statements allowed to fail on a database that never had Supabase's seed data.
const TOLERATED = [/role model seed: a built-in role is missing/, /#956: public\.estate_bank_accounts policies/];

export async function replay(db: PGlite, label: string, sql: string) {
  for (const st of split(sql)) {
    const bare = st.replace(/--[^\n]*/g, '').trim();
    if (/^(BEGIN|COMMIT);$/i.test(bare)) continue;
    try {
      await db.exec(st);
    } catch (e) {
      const message = (e as Error).message;
      if (!TOLERATED.some((re) => re.test(message))) throw new Error(`${label}: ${message}\n${bare.slice(0, 300)}`);
    }
  }
}

/** Migration file names after the baseline, in apply order. */
export const laterMigrations = (): string[] =>
  readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql') && f.slice(0, 14) > BASELINE_CUTOFF)
    .sort();

/** A fresh PGlite with the prelude, the baseline, the two built-in test roles and the given migrations. */
export async function loadSchema(migrations: string[] = laterMigrations()): Promise<PGlite> {
  const db = new PGlite({ extensions: { pg_trgm, uuid_ossp } });
  await replay(db, 'prelude', PRELUDE);

  const baseline = readFileSync(path.join(root, 'supabase/baseline/00000000000000_baseline.sql'), 'utf8')
    .replace(/CREATE EXTENSION IF NOT EXISTS pgcrypto[^;]*;/, '')
    .replace(/CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;/, 'CREATE EXTENSION IF NOT EXISTS pg_trgm;');
  await replay(db, 'baseline', baseline);

  // The baseline is public-schema only; these documents-bucket storage policies predate it
  // (20251228100000_create_document_management) and later migrations alter them.
  const docPolicy = (name: string, cmd: string, clause: string, perm: string) =>
    `CREATE POLICY "${name}" ON storage.objects FOR ${cmd} TO authenticated ${clause} (bucket_id = 'documents' AND EXISTS (SELECT 1 FROM profiles p JOIN role_permissions rp ON rp.role_id = p.role_id JOIN app_permissions ap ON ap.id = rp.permission_id WHERE p.id = auth.uid() AND ap.name = '${perm}'));`;
  await replay(
    db,
    'storage policies',
    [
      docPolicy('Users can upload documents to storage', 'INSERT', 'WITH CHECK', 'documents.upload'),
      docPolicy('Users can download documents from storage', 'SELECT', 'USING', 'documents.view'),
      docPolicy('Users can delete documents from storage', 'DELETE', 'USING', 'documents.delete'),
      docPolicy('Users can update documents in storage', 'UPDATE', 'USING', 'documents.update'),
    ].join('\n')
  );

  await replay(
    db,
    'roles',
    `INSERT INTO public.app_roles (name, display_name) SELECT 'super_admin', 'Super Admin' WHERE NOT EXISTS (SELECT 1 FROM public.app_roles WHERE name = 'super_admin');
     INSERT INTO public.app_roles (name, display_name) SELECT 'test_staff', 'Test Staff' WHERE NOT EXISTS (SELECT 1 FROM public.app_roles WHERE name = 'test_staff');`
  );

  for (const f of migrations) await replay(db, f, readFileSync(path.join(migrationsDir, f), 'utf8'));
  return db;
}
