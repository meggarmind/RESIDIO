-- ============================================================================
-- Migration: Add account lifecycle status to profiles
-- ============================================================================
-- Purpose: Introduce an explicit approval lifecycle for auth accounts so that a
--          newly created user (password signup OR social/OAuth) holds no access
--          until an administrator approves them.
--
-- Context: Before this change every new auth.users row received a profile with
--          role = 'security_officer' (see handle_new_user), and get_my_role()
--          fell back to that legacy column whenever role_id was NULL. Because
--          ~85 RLS policies gate on get_my_role(), any self-registered account
--          could read the active resident directory. approval_status becomes the
--          single chokepoint those helpers consult.
--
-- Safety:  Every profile that exists at migration time is grandfathered to
--          'active', so no current user loses access here. Tightening of the
--          ambiguous default-role accounts happens in the backfill migration.
-- ============================================================================

BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_approval_status') THEN
        CREATE TYPE public.profile_approval_status AS ENUM (
            'pending',    -- awaiting administrator approval, no access
            'active',     -- approved, permissions resolve normally
            'rejected',   -- application declined, cannot sign in
            'suspended'   -- previously active, access revoked
        );
    END IF;
END
$$;

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS approval_status public.profile_approval_status NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Grandfather every pre-existing account so nobody is locked out by this step.
UPDATE public.profiles
SET approval_status = 'active',
    approved_at = COALESCE(approved_at, created_at)
WHERE approval_status = 'pending';

-- Partial index: the pending-accounts queue is the only hot read on this column.
CREATE INDEX IF NOT EXISTS idx_profiles_pending
    ON public.profiles (created_at DESC)
    WHERE approval_status = 'pending';

COMMENT ON COLUMN public.profiles.approval_status IS
'Account lifecycle gate. Only ''active'' profiles resolve a role or resident via the
get_my_role()/get_my_resident_id()/is_super_admin() helpers, so pending, rejected and
suspended accounts are denied by every RLS policy that depends on them.';
COMMENT ON COLUMN public.profiles.approved_at IS 'When the account was approved.';
COMMENT ON COLUMN public.profiles.approved_by IS 'Profile of the administrator who approved the account.';
COMMENT ON COLUMN public.profiles.rejection_reason IS 'Reason shown to the user when approval_status is ''rejected''.';

COMMIT;
