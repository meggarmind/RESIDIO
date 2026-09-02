-- ============================================================================
-- Migration: Backfill profiles.role_id from the legacy profiles.role column
-- ============================================================================
-- Purpose: Make role_id authoritative BEFORE the next migration removes the
--          legacy-role fallback from get_my_role(). Any active profile left
--          without a role_id after this runs would silently lose access, so
--          this migration must run first and must be verified.
--
-- Mapping follows LEGACY_TO_NEW_ROLE_MAP in src/types/database.ts:
--          admin               -> super_admin
--          chairman            -> chairman
--          financial_secretary -> financial_officer
--          security_officer    -> (deliberately NOT mapped - see below)
--
-- Why 'security_officer' is not mapped
-- ------------------------------------
-- 'security_officer' is the value handle_new_user() assigned to EVERY new auth
-- user, so the column cannot distinguish a real security officer from an account
-- that was granted the role by accident simply by signing up. Mapping it would
-- convert an accidental grant into a permanent one.
--
-- These accounts are therefore moved to approval_status = 'pending' (fail closed)
-- and surface in the Pending Accounts queue, where one click restores anyone who
-- is legitimate. Accounts linked to a resident are given the 'resident' role
-- instead, since their legacy value is the same trigger default.
--
-- Review the NOTICE output of this migration before promoting it past staging.
-- ============================================================================

BEGIN;

-- 1. Deliberate admin grants: map straight across, these are never trigger defaults.
UPDATE public.profiles p
SET role_id = ar.id
FROM public.app_roles ar
WHERE p.role_id IS NULL
  AND ar.name = CASE p.role
      WHEN 'admin'               THEN 'super_admin'
      WHEN 'chairman'            THEN 'chairman'
      WHEN 'financial_secretary' THEN 'financial_officer'
  END;

-- 2. Portal users: linked to a resident, so the base 'resident' role is correct
--    regardless of whatever the legacy column happens to say.
UPDATE public.profiles p
SET role_id = ar.id
FROM public.app_roles ar
WHERE p.role_id IS NULL
  AND p.resident_id IS NOT NULL
  AND ar.name = 'resident';

-- 3. Ambiguous remainder: role_id NULL, no resident link. Fail closed.
DO $$
DECLARE
    v_count INT;
    v_emails TEXT;
BEGIN
    SELECT COUNT(*), string_agg(email, ', ' ORDER BY email)
    INTO v_count, v_emails
    FROM public.profiles
    WHERE role_id IS NULL AND resident_id IS NULL AND approval_status = 'active';

    IF v_count > 0 THEN
        UPDATE public.profiles
        SET approval_status = 'pending',
            approved_at = NULL
        WHERE role_id IS NULL AND resident_id IS NULL AND approval_status = 'active';

        RAISE NOTICE '[backfill_profile_role_ids] % account(s) had no assignable role and were moved to pending: %',
            v_count, v_emails;
        RAISE NOTICE '[backfill_profile_role_ids] Approve any legitimate accounts in Settings -> Roles -> Pending Accounts.';
    ELSE
        RAISE NOTICE '[backfill_profile_role_ids] No ambiguous accounts found.';
    END IF;
END
$$;

-- 4. Assert the invariant the next migration depends on: no active profile is
--    left without a role_id. Fails the migration loudly rather than silently
--    locking someone out once the legacy fallback is removed.
DO $$
DECLARE
    v_orphans INT;
BEGIN
    SELECT COUNT(*) INTO v_orphans
    FROM public.profiles
    WHERE approval_status = 'active' AND role_id IS NULL;

    IF v_orphans > 0 THEN
        RAISE EXCEPTION
            'Backfill incomplete: % active profile(s) still have a NULL role_id. Removing the get_my_role() legacy fallback would lock them out.',
            v_orphans;
    END IF;
END
$$;

COMMIT;
