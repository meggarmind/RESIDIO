-- ============================================================================
-- Migration: Harden handle_new_user()
-- ============================================================================
-- Fixes two defects in the auth.users -> profiles provisioning trigger.
--
-- 1. PRIVILEGE ESCALATION. The previous body did:
--        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'security_officer')
--    raw_user_meta_data is populated from the CLIENT via signUp options.data, so
--        supabase.auth.signUp({ options: { data: { role: 'admin' } } })
--    minted a profile whose get_my_role() returned 'admin'. Even without that,
--    the 'security_officer' default granted every self-registered account read
--    access to the active resident directory. New profiles now start with
--    role_id NULL, role NULL and approval_status 'pending' - no access until an
--    administrator approves them.
--
-- 2. GUARANTEED PK COLLISION. registerResidentPortal
--    (src/actions/auth/register-resident-portal.ts) calls
--    auth.admin.createUser() and then plain-INSERTs into profiles. This trigger
--    has already created that row, so the insert violated the primary key and
--    the action rolled back every time - resident portal registration has been
--    failing 100% of the time. ON CONFLICT DO NOTHING makes the trigger
--    idempotent; the action is changed to UPDATE the row in the same commit.
--
-- full_name falls back through the keys Supabase populates for Google OAuth
-- (full_name, then name) before settling on the email address.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $fn$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, role, role_id, approval_status)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(
            NULLIF(TRIM(NEW.raw_user_meta_data->>'full_name'), ''),
            NULLIF(TRIM(NEW.raw_user_meta_data->>'name'), ''),
            NEW.email
        ),
        NULL,       -- legacy role: deprecated, never trusted
        NULL,       -- role_id: assigned by an administrator on approval
        'pending'   -- no access until approved
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.handle_new_user() IS
'Provisions a public.profiles row for each new auth.users row. Deliberately ignores
raw_user_meta_data->>''role'': that value is client-supplied and was a privilege-escalation
vector. New accounts start pending with no role and gain access only via administrator
approval.';

-- The trigger itself is unchanged, but recreate it defensively so a database
-- rebuilt purely from migrations ends in the intended state.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_new_user();

COMMIT;
