-- Drop the legacy role vocabulary: the column, the enum, and get_my_role().
-- Issue: #194 (final slice of epic #182 "Remove the legacy role vocabulary"), ADR-0007
--
-- Preconditions, all landed and applied before this migration:
--   #190 (20260906010000) retargeted all 97 get_my_role() policies onto get_my_role_name().
--   #214 (20260906020000) removed the last four policies reading the legacy column.
--   #193 (20260906030000) renamed profiles.role -> profiles.role_deprecated_do_not_use,
--        rewrote create_generated_invoice() onto has_permission('billing.create_invoice'),
--        and stopped handle_new_user() inserting the column.
--
-- WHY THE GATE BELOW EXISTS
--
-- plpgsql is late-bound. `ALTER TABLE ... DROP COLUMN` SUCCEEDS while a function
-- body still references the dropped column, and the breakage surfaces only when
-- that branch of that function next runs -- possibly weeks later, as a runtime
-- 42703 in an unrelated feature. pg_depend does not see it, and no structural
-- test catches it. So the drop is gated on two catalogue queries returning zero
-- rows, and the migration ABORTS rather than proceeding if either does not.
-- This gate is the whole reason this slice is safe to run.
--
-- ORDER MATTERS
--
--   1. get_my_role() is dropped first: it RETURNS public.user_role.
--   2. profiles.role_deprecated_do_not_use is dropped second: its type is public.user_role.
--   3. public.user_role is dropped last, once nothing depends on it.
--
-- Dropping the type before the function and the column fails: DROP TYPE refuses
-- while a function return type or a column still uses the type.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Gate. Abort unless nothing reads the legacy column any more.
-- ---------------------------------------------------------------------------
DO $gate$
DECLARE
  offending_functions text;
  offending_policies  text;
BEGIN
  SELECT string_agg(p.proname, ', ' ORDER BY p.proname)
    INTO offending_functions
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname = 'public'
     AND p.prosrc ~ 'role_deprecated_do_not_use';

  IF offending_functions IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting #194: function(s) % still reference role_deprecated_do_not_use in the body. plpgsql is late-bound, so dropping the column would leave a function that fails at runtime instead of failing now.',
      offending_functions;
  END IF;

  SELECT string_agg(policyname, ', ' ORDER BY policyname)
    INTO offending_policies
    FROM pg_policies
   WHERE schemaname = 'public'
     AND (coalesce(qual, '') || coalesce(with_check, '')) ~ 'role_deprecated_do_not_use';

  IF offending_policies IS NOT NULL THEN
    RAISE EXCEPTION
      'Aborting #194: policy/policies % still reference role_deprecated_do_not_use.',
      offending_policies;
  END IF;
END
$gate$;

-- ---------------------------------------------------------------------------
-- 2. Drop get_my_role(). Nothing calls it: #190 retargeted all 97 policies onto
--    get_my_role_name(). It only survived this long because its return type is
--    the enum being dropped below.
-- ---------------------------------------------------------------------------
DROP FUNCTION public.get_my_role();

-- ---------------------------------------------------------------------------
-- 3. Drop the column. Nothing reads it (gated above); nothing writes it since
--    #193 removed the last writer in assignRoleToProfile().
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles DROP COLUMN role_deprecated_do_not_use;

-- ---------------------------------------------------------------------------
-- 4. Drop the enum. Its only remaining dependents were 2 and 3 above, plus the
--    implicit array type _user_role, which drops with it.
-- ---------------------------------------------------------------------------
DROP TYPE public.user_role;

COMMIT;

-- ===========================================================================
-- ROLLBACK
-- ===========================================================================
--
-- READ THIS FIRST: this is NOT a clean revert, and nothing below restores data.
--
-- `ALTER TABLE ... DROP COLUMN` destroys the column's values irrecoverably. The
-- SQL below can rebuild the enum, an EMPTY column of that type, and the
-- function -- the *shape* of the old world, not its contents. Every per-account
-- legacy role value is gone the moment this migration commits, and no rollback
-- script can bring it back. Restoring the values needs a point-in-time restore
-- of the database, not this block.
--
-- That is precisely why #193 exists: it renamed the column and left it in place
-- for one slice, so this destructive step happens only after nothing reads it.
--
-- Also note: after #190 nothing calls get_my_role(), so recreating it restores a
-- function with no callers. It restores no policy behaviour, because no policy
-- references it any more.
--
--   BEGIN;
--
--   CREATE TYPE public.user_role AS ENUM (
--     'chairman', 'financial_secretary', 'security_officer', 'admin'
--   );
--
--   ALTER TABLE public.profiles
--     ADD COLUMN role_deprecated_do_not_use public.user_role;
--   -- ^ every row is NULL here. The original values are NOT recoverable.
--
--   -- The body below is a functional equivalent of the live definition, not a
--   -- byte-for-byte restoration: the deployed function was LANGUAGE plpgsql and
--   -- this is LANGUAGE sql. The mapping and the NULL paths are identical.
--   CREATE OR REPLACE FUNCTION public.get_my_role()
--   RETURNS public.user_role
--   LANGUAGE sql
--   STABLE
--   SECURITY DEFINER
--   SET search_path = public, auth, extensions, pg_temp
--   AS $fn$
--     SELECT CASE r.name
--              WHEN 'super_admin'       THEN 'admin'::public.user_role
--              WHEN 'chairman'          THEN 'chairman'::public.user_role
--              WHEN 'vice_chairman'     THEN 'chairman'::public.user_role
--              WHEN 'financial_officer' THEN 'financial_secretary'::public.user_role
--              WHEN 'security_officer'  THEN 'security_officer'::public.user_role
--              ELSE NULL
--            END
--       FROM public.profiles p
--       JOIN public.app_roles r ON r.id = p.role_id
--      WHERE p.id = auth.uid()
--        AND p.approval_status = 'active';
--   $fn$;
--
--   -- Privileges are NOT restored by CREATE FUNCTION. A fresh function defaults
--   -- to EXECUTE TO PUBLIC, which would leave get_my_role() callable by `anon` --
--   -- a privilege regression against the hardened baseline, and exactly the
--   -- anon-exposure class src/__tests__/anonymous-read-closure.test.ts polices.
--   -- These two statements reproduce the live proacl:
--   --   {postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
--   GRANT  EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;
--
--   -- The live comment, restored verbatim.
--   COMMENT ON FUNCTION public.get_my_role() IS
--     'Returns the legacy user_role enum for the current user, derived from profiles.role_id -> app_roles.name. Returns NULL unless approval_status is active. Only the five built-in admin roles map to legacy RLS buckets; custom and resident-category roles return NULL until affected policies use explicit permission checks. The legacy profiles.role fallback was removed deliberately: it allowed a client-supplied signup metadata role to become real RLS access.';
--
--   COMMIT;
