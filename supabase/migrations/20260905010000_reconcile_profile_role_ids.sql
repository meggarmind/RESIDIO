-- ============================================================================
-- Migration: Reconcile profiles.role_id from the legacy profiles.role column
-- ============================================================================
-- Purpose: Issue #192 (epic #182), immediately before #193 renames
--          profiles.role. auth-provider.tsx:288-301 still runs a reverse
--          lookup today -- a profile with no role_id but a legacy role
--          string gets its effective role resolved by querying app_roles by
--          name. That lookup is the safety net #193 removes when the column
--          it reads goes away. This migration is the proof, taken at the last
--          possible moment before that removal, that no account depends on
--          it for access it cannot get any other way.
--
--          The August backfill (20260829100100_backfill_profile_role_ids.sql)
--          already asserted this once for every *then-active* profile.
--          Nothing has enforced it since: handle_new_user() (see
--          20260829100400_harden_handle_new_user.sql) writes role_id = NULL
--          for every new signup, and role_id IS NULL is therefore a normal,
--          ongoing state for accounts still pending approval. This migration
--          re-checks the same invariant against whatever profiles exist now,
--          scoped to the population that actually matters: a profile with a
--          legacy role value AND no role_id. A pending signup with role_id
--          NULL and role NULL (the post-hardening shape) is not this
--          migration's concern and is left alone.
--
-- Mapping (same three as the August backfill, same reasoning):
--          admin               -> super_admin
--          chairman            -> chairman
--          financial_secretary -> financial_officer
--          security_officer    -> (deliberately NOT mapped - see below)
--
-- Why 'security_officer' is not mapped
-- ------------------------------------
-- Before 20260829100400_harden_handle_new_user.sql, 'security_officer' was
-- the trigger default handle_new_user() assigned to EVERY new auth user, so
-- the column alone cannot distinguish a real security officer from an
-- account that received the role only by virtue of signing up. Mapping it
-- here would convert that accidental grant into a permanent RBAC role. A
-- profile stuck at legacy role = 'security_officer' with no role_id is
-- exactly the ambiguous case the original backfill also refused to resolve
-- automatically, and the same judgement holds: a human must look at it.
--
-- Failure behaviour (the actual deliverable)
-- -------------------------------------------
-- Unlike the August backfill -- which, for its own ambiguous remainder,
-- moved the affected accounts to approval_status = 'pending' and let the
-- migration succeed -- this migration HARD FAILS. It is the last checkpoint
-- before #193 deletes the column these accounts are still relying on, so
-- silently degrading them to pending and moving on is not an option: the
-- migration must stop, and it must name exactly who is affected (id and
-- email, not a count) so the failure is actionable from the migration log
-- alone.
-- ============================================================================

-- ============================================================================
-- ROLLBACK: undo the backfill performed by step 1 below
-- ============================================================================
-- Reverts only the rows this migration itself could have set -- profiles
-- whose role_id currently matches the app_roles row this migration's mapping
-- would assign for their legacy role. It cannot distinguish "set by this
-- migration" from "was already correct and happened to match" any more
-- precisely than that; the same limitation applies to the August backfill's
-- own step 1 and is accepted there for the same reason: nothing else records
-- provenance for this column. Step 2 (the guard) makes no writes, so there is
-- nothing to roll back for it.
--
-- These are SQL comments, not executable statements.
--
-- BEGIN;
--
-- UPDATE public.profiles p
-- SET role_id = NULL
-- FROM public.app_roles ar
-- WHERE p.role_id = ar.id
--   AND p.role IS NOT NULL
--   AND ar.name = CASE p.role
--       WHEN 'admin'               THEN 'super_admin'
--       WHEN 'chairman'            THEN 'chairman'
--       WHEN 'financial_secretary' THEN 'financial_officer'
--   END;
--
-- COMMIT;
-- ============================================================================

BEGIN;

-- 1. Backfill the three legacy values that unambiguously identify a
--    deliberate admin-side role grant. 'security_officer' is excluded on
--    purpose (see above) -- CASE has no branch for it, so those rows are
--    left with role_id NULL and fall into the guard below.
UPDATE public.profiles p
SET role_id = ar.id
FROM public.app_roles ar
WHERE p.role_id IS NULL
  AND p.role IS NOT NULL
  AND ar.name = CASE p.role
      WHEN 'admin'               THEN 'super_admin'
      WHEN 'chairman'            THEN 'chairman'
      WHEN 'financial_secretary' THEN 'financial_officer'
  END;

-- 2. Guard: any profile that still has a legacy role value and no role_id
--    could not be resolved above (either it is 'security_officer', or its
--    mapped app_roles row was not found -- e.g. renamed or deleted).
--    List the accounts by id and email and fail the migration outright.
DO $$
DECLARE
    v_count INT;
    v_accounts TEXT;
BEGIN
    SELECT COUNT(*), string_agg(id || ' <' || COALESCE(email, 'no email') || '>', ', ' ORDER BY email)
    INTO v_count, v_accounts
    FROM public.profiles
    WHERE role_id IS NULL AND role IS NOT NULL;

    IF v_count > 0 THEN
        RAISE EXCEPTION
            'Reconciliation failed: % profile(s) hold a legacy role with no role_id and could not be resolved: %',
            v_count, v_accounts;
    END IF;
END
$$;

COMMIT;
