-- Limit wrong guesses on contact-verification codes (#556 item 6).
--
-- WHAT CHANGES
--   1. ADD COLUMN public.verification_tokens.attempts INTEGER NOT NULL DEFAULT 0 (>= 0).
--   2. CREATE OR REPLACE FUNCTION public.record_failed_verification_attempt(
--        p_resident_id uuid, p_token_type text, p_max_attempts integer DEFAULT 5)
--      RETURNS TABLE (attempts integer, invalidated boolean). One atomic UPDATE on the
--      resident's ACTIVE tokens of that type (used_at IS NULL AND expires_at > now()):
--      attempts + 1, and used_at = now() once attempts reaches p_max_attempts.
--   3. REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role.
--
-- WHY
--   verifyContactToken matched the code in the WHERE clause, so a wrong code matched
--   no row and nothing counted guesses: a 6-digit code could be brute-forced inside
--   its expiry window. Owner decision 2026-10-14: after 5 wrong attempts the code is
--   invalidated and must be re-sent. used_at is the existing invalidation mechanism.
--
-- WHO IS AFFECTED
--   Only the verification flow. Existing rows get attempts = 0 (constant default, no
--   table rewrite). The function is SECURITY INVOKER and only service_role (the admin
--   client used by the server action) can execute it, so it is not reachable through
--   PostgREST by anon or any logged-in user.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE; REVOKE/GRANT are repeatable.
--
-- ROLLBACK (dropping the column loses attempt counts only; tokens themselves are kept):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.record_failed_verification_attempt(uuid, text, integer);
--   ALTER TABLE public.verification_tokens DROP COLUMN IF EXISTS attempts;
--   COMMIT;
--   Roll the application code back first (or at the same time): the new action calls
--   the function and fails closed (never verifies) if it is missing.
--
-- VERIFY (run on the database after applying):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'verification_tokens' AND column_name = 'attempts';
--     -- expect 1 row: integer, NO, 0
--   SELECT p.proname, p.prosecdef, p.proconfig
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'record_failed_verification_attempt';
--     -- expect 1 row: prosecdef false, proconfig {search_path=}
--   SELECT has_function_privilege('anon', 'public.record_failed_verification_attempt(uuid, text, integer)', 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', 'public.record_failed_verification_attempt(uuid, text, integer)', 'EXECUTE') AS authenticated,
--          has_function_privilege('service_role', 'public.record_failed_verification_attempt(uuid, text, integer)', 'EXECUTE') AS service_role;
--     -- expect false, false, true
--   SELECT aclexplode(proacl) FROM pg_proc WHERE proname = 'record_failed_verification_attempt';
--     -- expect no grantee 0 (PUBLIC), no anon, no authenticated

BEGIN;

ALTER TABLE public.verification_tokens
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0);

CREATE OR REPLACE FUNCTION public.record_failed_verification_attempt(
  p_resident_id uuid,
  p_token_type text,
  p_max_attempts integer DEFAULT 5
)
RETURNS TABLE (attempts integer, invalidated boolean)
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  UPDATE public.verification_tokens AS vt
     SET attempts = vt.attempts + 1,
         used_at = CASE WHEN vt.attempts + 1 >= p_max_attempts THEN now() ELSE vt.used_at END
   WHERE vt.resident_id = p_resident_id
     AND vt.token_type = p_token_type::public.verification_type
     AND vt.used_at IS NULL
     AND vt.expires_at > now()
  RETURNING vt.attempts, (vt.used_at IS NOT NULL);
$fn$;

REVOKE ALL ON FUNCTION public.record_failed_verification_attempt(uuid, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_failed_verification_attempt(uuid, text, integer) TO service_role;

COMMIT;
