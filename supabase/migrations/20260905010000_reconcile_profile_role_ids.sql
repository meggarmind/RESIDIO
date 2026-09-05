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
-- This migration does NOT record, anywhere queryable after the fact, which
-- rows it wrote. Its own forward run is the only record: step 1 below emits
-- a NOTICE listing the exact ids it backfilled, precisely so a rollback has
-- something honest to act on.
--
-- A rollback that instead re-derives "affected" by matching on VALUE --
-- "role_id currently equals the app_roles row this migration's mapping would
-- assign for this profile's legacy role" -- is NOT safe, and was the shape
-- of an earlier draft of this block. It is wrong because that predicate
-- matches every profile that already held the correct role_id before this
-- migration ran, not only the ones this migration itself set, and those two
-- sets are provably not the same: on 2026-09-05, live data showed this
-- migration's step 1 backfilling 0 rows (every legacy-role profile had
-- already been correctly backfilled by 20260829100100), while a
-- value-matching rollback predicate matched all 3 profiles in the database
-- and would have stripped super_admin, chairman and financial_officer from
-- every account that legitimately holds them.
--
-- So: to roll back, take the id list from step 1's NOTICE (captured in the
-- migration run log) and paste it into the WHERE id IN (...) below. Do not
-- run this against a guess, and do not restore the value-matching predicate
-- described above.
--
-- These are SQL comments, not executable statements.
--
-- BEGIN;
--
-- UPDATE public.profiles
-- SET role_id = NULL
-- WHERE id IN (
--   -- Paste the ids from this migration's own NOTICE output here, e.g.:
--   -- 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
--   -- 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
-- );
--
-- COMMIT;
-- ============================================================================
--
-- If no NOTICE was captured for this migration's run (log not retained),
-- this rollback cannot be automated at all -- identify the affected accounts
-- by other means (a pre-migration backup, or the audit trail) before
-- touching role_id. Note also that even a misidentified revert fails safe
-- rather than locking anyone out: 20260904215745_require_active_super_admin.sql's
-- constraint trigger is DEFERRABLE INITIALLY DEFERRED, so it is checked at
-- COMMIT and raises 23001 ("At least one active account must hold the Super
-- Administrator role") instead of silently completing if the revert would
-- leave no active super_admin.
-- ============================================================================

BEGIN;

-- 1. Backfill the three legacy values that unambiguously identify a
--    deliberate admin-side role grant. 'security_officer' is excluded on
--    purpose (see above) -- CASE has no branch for it, so those rows are
--    left with role_id NULL and fall into the guard below.
--
--    The UPDATE is wrapped in a data-modifying CTE purely so RETURNING can
--    feed a NOTICE listing exactly which ids were touched: that NOTICE is
--    the only record of this migration's own provenance, and the rollback
--    block above depends on it existing.
DO $$
DECLARE
    v_backfilled_count INT;
    v_backfilled_ids TEXT;
BEGIN
    WITH updated AS (
        UPDATE public.profiles p
        SET role_id = ar.id
        FROM public.app_roles ar
        WHERE p.role_id IS NULL
          AND p.role IS NOT NULL
          AND ar.name = CASE p.role
              WHEN 'admin'               THEN 'super_admin'
              WHEN 'chairman'            THEN 'chairman'
              WHEN 'financial_secretary' THEN 'financial_officer'
          END
        RETURNING p.id
    )
    SELECT COUNT(*), string_agg(id::text, ', ')
    INTO v_backfilled_count, v_backfilled_ids
    FROM updated;

    IF v_backfilled_count > 0 THEN
        RAISE NOTICE
            '[reconcile_profile_role_ids] backfilled role_id for % profile(s): %. These ids are the only safe rollback target.',
            v_backfilled_count, v_backfilled_ids;
    ELSE
        RAISE NOTICE '[reconcile_profile_role_ids] no profiles needed backfilling.';
    END IF;
END
$$;

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
