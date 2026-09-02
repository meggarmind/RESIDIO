-- ============================================================================
-- Migration: Gate the RLS auth helpers on approval_status
-- ============================================================================
-- Purpose: Make a non-active account resolve to "no role, no resident, no
--          permissions". Because ~85 RLS policies are written in terms of these
--          SECURITY DEFINER helpers, gating them here denies pending, rejected
--          and suspended accounts everywhere at once, without editing a single
--          policy.
--
-- Also removes the legacy profiles.role fallback from get_my_role(). That
-- fallback was the privilege-escalation vector: handle_new_user() copied a
-- CLIENT-SUPPLIED raw_user_meta_data->>'role' into profiles.role, so
-- signUp({ data: { role: 'admin' } }) yielded full super-admin RLS. The
-- preceding migration made role_id authoritative, so the fallback is now dead
-- weight as well as dangerous.
--
-- search_path is pinned to the hardened value established in
-- 20260824200000_harden_database_security_and_health_indexes.sql. CREATE OR
-- REPLACE would otherwise silently revert it.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- get_my_role() - legacy user_role enum, still consulted by most RLS policies
-- ---------------------------------------------------------------------------
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
    SELECT ar.name INTO v_role_name
    FROM profiles p
    JOIN app_roles ar ON ar.id = p.role_id
    WHERE p.id = auth.uid()
      AND p.approval_status = 'active';

    IF v_role_name IS NULL THEN
        RETURN NULL;
    END IF;

    -- Map RBAC role names onto the legacy enum for backward compatibility.
    RETURN CASE v_role_name
        WHEN 'super_admin'       THEN 'admin'::user_role
        WHEN 'chairman'          THEN 'chairman'::user_role
        WHEN 'vice_chairman'     THEN 'chairman'::user_role
        WHEN 'financial_officer' THEN 'financial_secretary'::user_role
        WHEN 'security_officer'  THEN 'security_officer'::user_role
        ELSE NULL
    END;
END;
$fn$;

COMMENT ON FUNCTION public.get_my_role() IS
'Returns the legacy user_role enum for the current user, derived from profiles.role_id -> app_roles.name. Returns NULL unless approval_status is active. The legacy profiles.role fallback was removed deliberately: it allowed a client-supplied signup metadata role to become real RLS access.';

-- ---------------------------------------------------------------------------
-- Resident helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_resident_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $fn$
  SELECT resident_id
  FROM public.profiles
  WHERE id = auth.uid()
    AND approval_status = 'active'
$fn$;

COMMENT ON FUNCTION public.get_my_resident_id() IS
'Resident linked to the current user, or NULL if unlinked or not an approved account.';

CREATE OR REPLACE FUNCTION public.is_resident()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND resident_id IS NOT NULL
      AND approval_status = 'active'
  )
$fn$;

COMMENT ON FUNCTION public.is_resident() IS
'TRUE only for an approved account linked to a resident record.';

-- ---------------------------------------------------------------------------
-- RBAC helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $fn$
    SELECT EXISTS (
        SELECT 1
        FROM profiles p
        JOIN app_roles ar ON ar.id = p.role_id
        WHERE p.id = auth.uid()
          AND p.approval_status = 'active'
          AND ar.name = 'super_admin'
    );
$fn$;

COMMENT ON FUNCTION public.is_super_admin() IS
'TRUE only for an approved account holding the super_admin role.';

CREATE OR REPLACE FUNCTION public.has_permission(p_permission_name TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions, pg_temp
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_has_perm BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM profiles pr
        JOIN role_permissions rp ON rp.role_id = pr.role_id
        JOIN app_permissions ap ON ap.id = rp.permission_id
        WHERE pr.id = auth.uid()
          AND pr.approval_status = 'active'
          AND ap.name = p_permission_name
          AND ap.is_active = TRUE
    ) INTO v_has_perm;

    RETURN COALESCE(v_has_perm, FALSE);
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
RETURNS TABLE(permission_name TEXT, category public.permission_category)
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions, pg_temp
LANGUAGE plpgsql
AS $fn$
BEGIN
    RETURN QUERY
    SELECT ap.name::TEXT, ap.category
    FROM profiles pr
    JOIN role_permissions rp ON rp.role_id = pr.role_id
    JOIN app_permissions ap ON ap.id = rp.permission_id
    WHERE pr.id = auth.uid()
      AND pr.approval_status = 'active'
      AND ap.is_active = TRUE;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.get_my_role_name()
RETURNS TEXT
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions, pg_temp
LANGUAGE plpgsql
AS $fn$
DECLARE
    v_role_name TEXT;
BEGIN
    SELECT ar.name INTO v_role_name
    FROM profiles pr
    JOIN app_roles ar ON ar.id = pr.role_id
    WHERE pr.id = auth.uid()
      AND pr.approval_status = 'active';

    RETURN v_role_name;
END;
$fn$;

-- ---------------------------------------------------------------------------
-- Re-assert execution grants. CREATE OR REPLACE preserves ACLs, but these are
-- restated so the hardened state is visible in one place and survives a rebuild
-- of the database from migrations.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_resident_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_resident() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role_name() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_resident_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_resident() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role_name() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_my_house_ids() exists in the live database but has no migration file in
-- this repo (it was applied out of band; see src/types/database.generated.ts).
-- If its body reads profiles directly rather than delegating to
-- get_my_resident_id(), it is NOT covered by this migration and must be gated
-- the same way. Warns loudly rather than leaving the gap unnoticed.
-- ---------------------------------------------------------------------------
DO $chk$
DECLARE
    v_src TEXT;
BEGIN
    SELECT prosrc INTO v_src
    FROM pg_proc
    WHERE proname = 'get_my_house_ids'
      AND pronamespace = 'public'::regnamespace;

    IF v_src IS NULL THEN
        RAISE NOTICE '[gate_auth_helpers] get_my_house_ids() not present; nothing to check.';
    ELSIF v_src LIKE '%get_my_resident_id%' THEN
        RAISE NOTICE '[gate_auth_helpers] get_my_house_ids() delegates to get_my_resident_id() and is gated transitively.';
    ELSE
        RAISE WARNING '[gate_auth_helpers] get_my_house_ids() reads profiles directly and is NOT gated on approval_status. Review and gate it. Body: %', v_src;
    END IF;
END
$chk$;

COMMIT;
