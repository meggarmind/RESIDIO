-- Migration: at least one active profile must always hold the super_admin role
-- Issue:     #184 (epic #182 "Remove the legacy role vocabulary"), ADR-0007
--
-- Residio's original bootstrap was a default administrator, tied to the super
-- administrator role and undeletable. That intent survives the removal of the
-- legacy role vocabulary, restated positively and in RBAC terms: **at least one
-- active profile must always hold `super_admin`.** Protecting one specific row
-- was the weaker idea -- it breaks the day that person leaves, and it invites a
-- workaround. This covers deletion, demotion and deactivation in one rule.
--
-- It is enforced by trigger rather than in application code because the paths
-- that have historically created and modified administrators on this project
-- include direct database access. The checks added to the server actions in the
-- same commit only produce a readable error message; the trigger is the boundary.
--
-- TWO tables can violate the invariant, and the second is the one that is easy
-- to miss:
--
--   1. `profiles`  -- DELETE, a change of `role_id`, or a change of
--                     `approval_status` away from 'active'.
--   2. `app_roles` -- DELETE of the super administrator role itself.
--                     `profiles.role_id` is declared ON DELETE SET NULL
--                     (verified 2026-09-04: profiles_role_id_fkey), so dropping
--                     that role silently nulls every holder's role and no
--                     trigger on `profiles` would observe a violating state.
--
-- The triggers are DEFERRABLE INITIALLY DEFERRED so the check runs once at
-- COMMIT against the transaction's final state. A transaction that hands the
-- role from one administrator to another therefore succeeds, while one that
-- merely leaves nobody holding it fails.
--
-- If the invariant is already violated this migration FAILS and says so. It
-- deliberately does not grant `super_admin` to satisfy itself: a migration that
-- grants super_admin is exactly the privilege-escalation shape that
-- 20260829100400_harden_handle_new_user.sql was written to close.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS app_roles_require_active_super_admin ON public.app_roles;
--   DROP TRIGGER IF EXISTS profiles_require_active_super_admin ON public.profiles;
--   DROP FUNCTION IF EXISTS public.assert_active_super_admin_exists();

-- ---------------------------------------------------------------------------
-- 1. Refuse to install the invariant onto data that already violates it.
-- ---------------------------------------------------------------------------

DO $precondition$
DECLARE
  v_holders integer;
BEGIN
  SELECT count(*) INTO v_holders
  FROM public.profiles p
  JOIN public.app_roles ar ON ar.id = p.role_id
  WHERE p.approval_status = 'active'
    AND ar.name = 'super_admin';

  IF v_holders = 0 THEN
    RAISE EXCEPTION
      'Cannot install the super_admin invariant: no active profile holds super_admin'
      USING HINT =
        'Grant super_admin to an active account by hand, then re-run. This migration '
        'will not do it: a migration that grants super_admin is the privilege-escalation '
        'shape 20260829100400 hardened handle_new_user() against.';
  END IF;
END
$precondition$;

-- ---------------------------------------------------------------------------
-- 2. The invariant.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_active_super_admin_exists()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- SECURITY DEFINER so the count sees every profile: `profiles` is under RLS,
  -- and a caller who can see only their own row would otherwise conclude the
  -- last administrator had vanished and block an unrelated write.
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.app_roles ar ON ar.id = p.role_id
    WHERE p.approval_status = 'active'
      AND ar.name = 'super_admin'
  ) THEN
    RAISE EXCEPTION
      'At least one active account must hold the Super Administrator role'
      USING ERRCODE = 'restrict_violation',
            HINT = 'Grant Super Administrator to another active account before removing, '
                   'demoting or deactivating the last one.';
  END IF;

  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.assert_active_super_admin_exists() IS
'Enforces Residio''s bootstrap invariant (ADR-0007, issue #184): at least one profile with approval_status = ''active'' must hold the super_admin role. Attached as a deferred constraint trigger to public.profiles (DELETE, UPDATE OF role_id/approval_status) and public.app_roles (DELETE), so the check runs at COMMIT against the transaction''s final state and handing the role between administrators inside one transaction is allowed.';

-- Deletion, demotion, deactivation.
DROP TRIGGER IF EXISTS profiles_require_active_super_admin ON public.profiles;
CREATE CONSTRAINT TRIGGER profiles_require_active_super_admin
AFTER DELETE OR UPDATE OF role_id, approval_status ON public.profiles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_active_super_admin_exists();

-- Deleting the role itself, which ON DELETE SET NULL would otherwise make silent.
DROP TRIGGER IF EXISTS app_roles_require_active_super_admin ON public.app_roles;
CREATE CONSTRAINT TRIGGER app_roles_require_active_super_admin
AFTER DELETE ON public.app_roles
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION public.assert_active_super_admin_exists();
