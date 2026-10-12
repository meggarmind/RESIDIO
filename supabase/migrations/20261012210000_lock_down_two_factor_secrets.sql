-- Stop a signed-in user reading their own 2FA secrets through the Data API (#455).
--
-- Before this migration a password-only session could, via PostgREST:
--   * SELECT two_factor_tokens.token for its own profile  -> read its own login OTP
--     in plaintext and complete the second factor without the device;
--   * SELECT two_factor_backup_codes.code_hash            -> offline-crack backup codes;
--   * SELECT profiles.two_factor_secret_encrypted         -> read a legacy PLAINTEXT
--     TOTP secret (new secrets are AES-256-GCM, but old rows are not yet backfilled).
-- Every 2FA code path in src/ uses createAdminClient() (service_role) for these
-- tables, verified by grep; service_role is unaffected by anything below.
--
-- 1. Drop the owner-readable SELECT policies and the API roles' table privileges.
-- 2. Make profiles.two_factor_secret_encrypted unreadable by anon/authenticated.
--    A column cannot be revoked on its own while a table-level SELECT grant
--    exists, so table SELECT is revoked and re-granted for every OTHER column
--    (computed from the catalogue, so it cannot drift from the real column set).
--    Consequence: `select *` on profiles through a user-session client now fails
--    with permission denied. The one such call (getStaff) is changed in this PR.
--    Columns added to profiles LATER need an explicit
--    `GRANT SELECT (col) ON public.profiles TO authenticated;` or user-session
--    reads of that column fail (same convention as the UPDATE grants in
--    20261011120000_restrict_profiles_column_updates.sql).
-- 3. Widen two_factor_tokens.token from CHAR(6)+digit CHECK to TEXT so the app can
--    store an HMAC of the OTP instead of the OTP. Existing plaintext rows stay valid
--    until they expire (the app accepts either form).
--
-- The migration ABORTS (changes nothing) if a view in any schema depends on the
-- secret column, because a security_invoker view would break for API roles.
--
-- DEPLOY ORDER: apply this migration BEFORE the code that writes hashed OTPs
-- reaches an environment. Until it is applied, sending an SMS/email login OTP fails
-- at insert (value too long for CHAR(6)); authenticator (TOTP) users are unaffected.
--
-- COLUMN CONVENTION (read this before adding a profiles column):
--   Reads of public.profiles by anon/authenticated are now granted PER COLUMN.
--   Any column added to public.profiles after this migration needs, in the same
--   migration:  GRANT SELECT (<column>) ON public.profiles TO authenticated;
--   (and TO anon only if signed-out reads need it). Without it, user-session
--   reads that name the column fail with 'permission denied'. Never
--   select('*') on profiles through a user-session client; the scan in
--   src/__tests__/profiles-no-star-select.test.ts enforces that.
--
-- Rollback. The baseline grants on these tables are not written in any migration
-- (the 2FA migration has no GRANT; profiles got GRANT ALL TO authenticated in
-- 20251206223732 and Supabase's default privileges give anon/authenticated/service_role
-- ALL on new public tables), so the exact prior grants cannot be proven from the repo.
-- This restores the standard Supabase defaults, which is what the earlier
-- migration 20261011120000 also assumed. Delete hashed OTP rows first:
--   DELETE FROM public.two_factor_tokens WHERE token LIKE 'h1$%';
--   ALTER TABLE public.two_factor_tokens ALTER COLUMN token TYPE CHAR(6);
--   ALTER TABLE public.two_factor_tokens
--     ADD CONSTRAINT two_factor_tokens_token_check CHECK (token ~ '^[0-9]{6}$');
--   GRANT SELECT ON public.profiles TO anon, authenticated;
--   GRANT ALL ON public.two_factor_tokens, public.two_factor_backup_codes
--     TO anon, authenticated, service_role;
--   CREATE POLICY "Users can view own 2FA tokens" ON public.two_factor_tokens
--     FOR SELECT TO authenticated USING (profile_id = auth.uid());
--   CREATE POLICY "Users can view own backup codes" ON public.two_factor_backup_codes
--     FOR SELECT TO authenticated USING (profile_id = auth.uid());
--   (profiles UPDATE/INSERT/DELETE grants are untouched by this migration.)

DO $$
BEGIN
  -- Refuse if any view / materialized view reads the secret column, or references
  -- profiles in a way that cannot be told apart from reading it: a dependency on
  -- the whole table (refobjsubid = 0, e.g. a whole-row reference or count(*)) with
  -- no column-level dependency at all. A view over profiles that names other
  -- columns is fine: it never touches the revoked one.
  IF EXISTS (
    SELECT 1
    FROM pg_depend d
    JOIN pg_rewrite r ON r.oid = d.objid
    JOIN pg_class v ON v.oid = r.ev_class AND v.relkind IN ('v', 'm')
    LEFT JOIN pg_attribute a ON a.attrelid = d.refobjid AND a.attnum = d.refobjsubid
    WHERE d.refobjid = 'public.profiles'::regclass
      AND (
        a.attname = 'two_factor_secret_encrypted'
        OR (
          d.refobjsubid = 0
          AND NOT EXISTS (
            SELECT 1 FROM pg_depend d2
            WHERE d2.objid = d.objid
              AND d2.refobjid = d.refobjid
              AND d2.refobjsubid > 0
          )
        )
      )
  ) THEN
    RAISE EXCEPTION 'A view depends on profiles.two_factor_secret_encrypted (directly or via a whole-row reference); refusing to restrict it';
  END IF;
END $$;

-- 1. Tokens and backup codes: server-only.
DROP POLICY IF EXISTS "Users can view own 2FA tokens" ON public.two_factor_tokens;
DROP POLICY IF EXISTS "Users can view own backup codes" ON public.two_factor_backup_codes;
REVOKE ALL ON public.two_factor_tokens FROM anon, authenticated;
REVOKE ALL ON public.two_factor_backup_codes FROM anon, authenticated;

-- 2. profiles: every column readable except the TOTP secret.
DO $$
DECLARE
  cols text;
  api_role text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name <> 'two_factor_secret_encrypted';

  FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF has_table_privilege(api_role, 'public.profiles', 'SELECT') THEN
      EXECUTE format('REVOKE SELECT ON public.profiles FROM %I', api_role);
      EXECUTE format('GRANT SELECT (%s) ON public.profiles TO %I', cols, api_role);
    END IF;
  END LOOP;
END $$;

-- 3. Room for hashed OTPs (the app writes 'h1$' + 64 hex chars).
DO $$
DECLARE
  c record;
BEGIN
  -- Drop the digit CHECK whatever it happens to be named.
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.two_factor_tokens'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%token%[0-9]%'
  LOOP
    EXECUTE format('ALTER TABLE public.two_factor_tokens DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;
ALTER TABLE public.two_factor_tokens ALTER COLUMN token TYPE TEXT;
