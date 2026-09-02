-- ============================================================================
-- Migration: get_my_role() resolves roles outside the built-in five
-- ============================================================================
-- Purpose: Roles & Permissions can create a role, but the database could not
--          see it. get_my_role() maps app_roles.name onto the legacy user_role
--          enum with an explicit CASE and returned NULL for anything unmapped —
--          and ~85 RLS policies are written as
--          `get_my_role() IN ('admin','chairman','financial_secretary')`.
--
--          So a role created through the UI passed authorizePermission() in the
--          server action and then got zero rows back from Postgres.
--
--          This is not only a custom-role problem: the SHIPPED `secretary` and
--          `project_manager` roles are absent from the CASE too, and have been
--          resolving to NULL — denied by those policies — since they were
--          seeded. This migration fixes them as well.
--
-- Approach: keep the explicit CASE for the five mapped built-ins so their
-- behaviour is bit-for-bit unchanged, and replace only the ELSE arm with a
-- fallback derived from the app_roles row already joined:
--
--   category = 'resident'  -> NULL   (residents must never gain admin RLS)
--   level = 0              -> admin  (a peer of super_admin)
--   otherwise              -> chairman
--
-- A custom role therefore inherits a legacy *bucket* for the old policies while
-- its real, fine-grained permissions continue to govern every check that goes
-- through authorizePermission(). Moving those policies onto has_permission() is
-- the durable fix and is tracked separately; this unblocks custom roles without
-- rewriting 85 policies in one step.
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
    v_category  TEXT;
    v_level     INT;
BEGIN
    -- Only an approved account resolves a role at all.
    SELECT ar.name, ar.category, ar.level
      INTO v_role_name, v_category, v_level
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
        ELSE NULL; -- fall through to the derived fallback below
    END CASE;

    -- Resident-category roles get no administrative bucket, ever.
    IF v_category = 'resident' THEN
        RETURN NULL;
    END IF;

    -- Level 0 is the top of the hierarchy, alongside super_admin.
    IF v_level = 0 THEN
        RETURN 'admin'::user_role;
    END IF;

    RETURN 'chairman'::user_role;
END;
$fn$;

COMMENT ON FUNCTION public.get_my_role() IS
'Returns the legacy user_role enum for the current user, derived from profiles.role_id -> app_roles.name. Returns NULL unless approval_status is active. The five built-in admin roles map explicitly; any other non-resident role falls back to admin (level 0) or chairman, so roles created through Roles & Permissions are visible to the legacy RLS policies. Resident-category roles always return NULL. The legacy profiles.role fallback was removed deliberately: it allowed a client-supplied signup metadata role to become real RLS access.';

COMMIT;
