-- ============================================================================
-- Migration: preserve legacy RLS boundaries for built-in roles
-- ============================================================================
-- Purpose: get_my_role() maps app_roles.name onto the legacy user_role enum.
--          ~85 RLS policies are written as
--          `get_my_role() IN ('admin','chairman','financial_secretary')`.
--
-- Approach: preserve the explicit mapping for the five built-in roles and deny
-- every other role at this legacy RLS boundary. A custom role must not inherit
-- a legacy bucket based on its category or level: direct PostgREST calls bypass
-- application-side authorizePermission() checks.
--
-- Preserved from 20260829100200 (do not drop either):
--   * the approval_status = 'active' gate — pending, rejected and suspended
--     accounts must keep resolving to no role at all;
--   * the pinned search_path from 20260824200000 — CREATE OR REPLACE silently
--     reverts it otherwise.
--
-- Deliberately NOT restored: the legacy profiles.role fallback removed by
-- 20260829100200. handle_new_user() copied a client-supplied
-- raw_user_meta_data->>'role' into that column, so signUp({ data: { role:
-- 'admin' } }) yielded full super-admin RLS. It stays gone.
-- ============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions, pg_temp
AS $fn$
DECLARE
    v_role_name TEXT;
BEGIN
    -- Only an approved account resolves a role at all.
    SELECT ar.name
      INTO v_role_name
    FROM profiles p
    JOIN app_roles ar ON ar.id = p.role_id
    WHERE p.id = auth.uid()
      AND p.approval_status = 'active';

    IF v_role_name IS NULL THEN
        RETURN NULL;
    END IF;

    -- Built-in roles keep their exact historical mapping.
    CASE v_role_name
        WHEN 'super_admin'       THEN RETURN 'admin'::user_role;
        WHEN 'chairman'          THEN RETURN 'chairman'::user_role;
        WHEN 'vice_chairman'     THEN RETURN 'chairman'::user_role;
        WHEN 'financial_officer' THEN RETURN 'financial_secretary'::user_role;
        WHEN 'security_officer'  THEN RETURN 'security_officer'::user_role;
        ELSE RETURN NULL;
    END CASE;
END;
$fn$;

COMMENT ON FUNCTION public.get_my_role() IS
'Returns the legacy user_role enum for the current user, derived from profiles.role_id -> app_roles.name. Returns NULL unless approval_status is active. Only the five built-in admin roles map to legacy RLS buckets; custom and resident-category roles return NULL until affected policies use explicit permission checks. The legacy profiles.role fallback was removed deliberately: it allowed a client-supplied signup metadata role to become real RLS access.';

COMMIT;
