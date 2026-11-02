-- Remember this computer for 30 days (#1390, parent #1388).
--
-- WHAT CHANGES
--   1. CREATE TABLE public.two_factor_trusted_devices: one row per remembered computer. After a
--      successful second factor the admin can choose "Yes, remember it". The server sets an HttpOnly
--      cookie with a random 32-byte token and stores only its SHA-256 hash (token_hash, hex), bound
--      to profile_id. expires_at is 30 days after created_at. On a later sign-in, a cookie whose hash
--      matches a live row (not revoked, not expired) of the SAME user gets the normal residio_2fa
--      marker for the new session; last_used_at is set then. revoked_at/revoked_reason end a row.
--      Service role only, like the other two-factor tables: RLS on, no anon or authenticated grant,
--      no client policy.
--   2. public.two_factor_trusted_devices_revoke_all(profile, reason): revokes all live rows of a
--      profile and writes one two_factor_audit_log row (action settings_updated, metadata.event
--      trusted_device_forgotten), as the #1389 events are written. Not callable by clients.
--   3. Triggers that call it, so every path is covered, not only the app's own actions:
--      - AFTER UPDATE OF encrypted_password ON auth.users: a password change (reset page, Supabase
--        dashboard, admin API). Same precedent as on_auth_user_created (20260829100400).
--      - AFTER UPDATE OF role_id, two_factor_enabled ON public.profiles: a role removed or changed
--        (any action), and two-factor turned off (by the user or reset by an admin).
--      New backup codes revoke the rows in the app (generateBackupCodes): that has no column change.
--   two_factor_audit_log is not changed: events use existing actions with metadata.event.
--
-- WHY
--   residio_2fa is bound to the login session and lasts 24 hours, so each sign-in asked for the
--   second factor again. The owner chose "WhatsApp approval + 30-day device" (31 Oct 2026).
--
-- DEPLOY ORDER: apply this migration before deploying the application code that reads the table.
--   Applying it first is safe: the old code does not touch it, and the triggers only revoke rows.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP ... IF EXISTS.
--
-- ROLLBACK (loses the remembered computers; every admin is asked for the second factor again):
--   BEGIN;
--   DROP TRIGGER IF EXISTS two_factor_trusted_devices_password_changed ON auth.users;
--   DROP TRIGGER IF EXISTS two_factor_trusted_devices_profile_changed ON public.profiles;
--   DROP FUNCTION IF EXISTS public.two_factor_trusted_devices_on_password_change();
--   DROP FUNCTION IF EXISTS public.two_factor_trusted_devices_on_profile_change();
--   DROP FUNCTION IF EXISTS public.two_factor_trusted_devices_revoke_all(uuid, text);
--   DROP TABLE IF EXISTS public.two_factor_trusted_devices;
--   COMMIT;
--   Roll the application code back first: it reads and writes the table.
--
-- VERIFY (run on the database after applying):
--   SELECT has_table_privilege('authenticated', 'public.two_factor_trusted_devices', 'SELECT');  -- expect false
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.two_factor_trusted_devices'::regclass;  -- expect true
--   SELECT has_function_privilege('authenticated', 'public.two_factor_trusted_devices_revoke_all(uuid, text)', 'EXECUTE');  -- expect false
--   SELECT tgname FROM pg_trigger WHERE tgname LIKE 'two_factor_trusted_devices_%';  -- expect 2 rows

CREATE TABLE IF NOT EXISTS public.two_factor_trusted_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL,
  user_agent_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '30 days'),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  revoked_reason TEXT,
  CONSTRAINT two_factor_trusted_devices_token_hash_check CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT two_factor_trusted_devices_revoked_reason_check CHECK (
    revoked_reason IS NULL OR revoked_reason IN (
      'forgotten', 'forgotten_all', 'password_changed', 'two_factor_disabled',
      'backup_codes_regenerated', 'role_changed'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS two_factor_trusted_devices_token_hash_key
  ON public.two_factor_trusted_devices (token_hash);
CREATE INDEX IF NOT EXISTS idx_two_factor_trusted_devices_profile_live
  ON public.two_factor_trusted_devices (profile_id, created_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE public.two_factor_trusted_devices ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.two_factor_trusted_devices FROM anon, authenticated;
GRANT ALL ON TABLE public.two_factor_trusted_devices TO service_role;

DROP POLICY IF EXISTS "two_factor_trusted_devices_service_role_all" ON public.two_factor_trusted_devices;
CREATE POLICY "two_factor_trusted_devices_service_role_all"
  ON public.two_factor_trusted_devices FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.two_factor_trusted_devices_revoke_all(p_profile_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  revoked INTEGER;
BEGIN
  UPDATE public.two_factor_trusted_devices
     SET revoked_at = timezone('utc', now()), revoked_reason = p_reason
   WHERE profile_id = p_profile_id AND revoked_at IS NULL;
  GET DIAGNOSTICS revoked = ROW_COUNT;
  IF revoked > 0 THEN
    INSERT INTO public.two_factor_audit_log (profile_id, action, metadata)
    VALUES (p_profile_id, 'settings_updated',
            jsonb_build_object('event', 'trusted_device_forgotten', 'reason', p_reason, 'count', revoked));
  END IF;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.two_factor_trusted_devices_on_password_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  PERFORM public.two_factor_trusted_devices_revoke_all(NEW.id, 'password_changed');
  RETURN NEW;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.two_factor_trusted_devices_on_profile_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF OLD.two_factor_enabled IS TRUE AND NEW.two_factor_enabled IS NOT TRUE THEN
    PERFORM public.two_factor_trusted_devices_revoke_all(NEW.id, 'two_factor_disabled');
  ELSE
    PERFORM public.two_factor_trusted_devices_revoke_all(NEW.id, 'role_changed');
  END IF;
  RETURN NEW;
END;
$fn$;

REVOKE ALL ON FUNCTION public.two_factor_trusted_devices_revoke_all(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.two_factor_trusted_devices_on_password_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.two_factor_trusted_devices_on_profile_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS two_factor_trusted_devices_password_changed ON auth.users;
CREATE TRIGGER two_factor_trusted_devices_password_changed
  AFTER UPDATE OF encrypted_password ON auth.users
  FOR EACH ROW
  WHEN (OLD.encrypted_password IS DISTINCT FROM NEW.encrypted_password)
  EXECUTE FUNCTION public.two_factor_trusted_devices_on_password_change();

DROP TRIGGER IF EXISTS two_factor_trusted_devices_profile_changed ON public.profiles;
CREATE TRIGGER two_factor_trusted_devices_profile_changed
  AFTER UPDATE OF role_id, two_factor_enabled ON public.profiles
  FOR EACH ROW
  WHEN (
    OLD.role_id IS DISTINCT FROM NEW.role_id
    OR (OLD.two_factor_enabled IS TRUE AND NEW.two_factor_enabled IS NOT TRUE)
  )
  EXECUTE FUNCTION public.two_factor_trusted_devices_on_profile_change();
