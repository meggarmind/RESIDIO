-- Revoke TRUNCATE from the API roles on every public table (#222).
--
-- WHAT CHANGES
--   1. REVOKE TRUNCATE on all existing public tables from anon and authenticated.
--   2. ALTER DEFAULT PRIVILEGES so tables created later do not regain it.
--
-- WHY
--   PostgreSQL row-level security does not apply to TRUNCATE; only the table
--   privilege gates it. Supabase's default `GRANT ALL ... TO anon, authenticated`
--   left anon holding TRUNCATE on 82 of 96 public tables (measured 2026-10-14 on
--   Residio_Stage and Residio_Prod). Not exploitable today (anon cannot log in,
--   PostgREST exposes no TRUNCATE, no SECURITY DEFINER function truncates), but
--   that protection is incidental.
--
-- WHO IS AFFECTED
--   Nobody loses a capability the app uses. Verified by grep: no TRUNCATE in
--   src/ or scripts/ SQL, and no migration defines a function containing it.
--   service_role and the postgres/supabase_admin owners are untouched, so
--   admin tooling and migrations can still truncate.
--
-- DEFAULT PRIVILEGES (what was and was not done)
--   ALTER DEFAULT PRIVILEGES only affects objects later created by the role it
--   names. Tables are created by `postgres` (the migration role), so that role
--   is always handled. `supabase_admin` is handled only if the current role is a
--   member of it; otherwise a NOTICE is raised and that role is skipped rather
--   than failing the migration. Check the NOTICE when applying.
--
-- IDEMPOTENT: REVOKE of an absent privilege is a no-op; safe to re-run.
--
-- ROLLBACK (restores exactly the prior TRUNCATE grants, nothing broader):
--   Prior state was: TRUNCATE held by anon and authenticated on every public
--   table EXCEPT those already revoked by earlier migrations:
--     * public.profiles               -- both roles (20261011120000)
--     * public.personnel_engagements  -- authenticated only (20260815121632)
--   and default privileges for postgres/supabase_admin in public granting
--   TRUNCATE to anon and authenticated (Supabase default).
--   Before applying, capture the exact live list to be sure:
--     SELECT c.relname, has_table_privilege('anon', c.oid, 'TRUNCATE') AS anon,
--            has_table_privilege('authenticated', c.oid, 'TRUNCATE') AS auth
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--     WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;
--   Then:
--   BEGIN;
--   DO $$
--   DECLARE t record;
--   BEGIN
--     FOR t IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--              WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname <> 'profiles' LOOP
--       EXECUTE format('GRANT TRUNCATE ON public.%I TO anon', t.relname);
--       IF t.relname <> 'personnel_engagements' THEN
--         EXECUTE format('GRANT TRUNCATE ON public.%I TO authenticated', t.relname);
--       END IF;
--     END LOOP;
--   END $$;
--   ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT TRUNCATE ON TABLES TO anon, authenticated;
--   COMMIT;

BEGIN;

REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'supabase_admin')
     AND pg_has_role(current_user, 'supabase_admin', 'member') THEN
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public REVOKE TRUNCATE ON TABLES FROM anon, authenticated';
  ELSE
    RAISE NOTICE 'supabase_admin default privileges skipped: current_user is not a member';
  END IF;
END $$;

COMMIT;
