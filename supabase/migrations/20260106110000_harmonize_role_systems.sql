-- ============================================================================
-- Migration: Harmonize Role Systems
-- ============================================================================
-- Purpose: Update get_my_role() function to read from new RBAC system (app_roles)
--          instead of legacy profiles.role field.
--
-- This allows all 85+ existing RLS policies to work with the new RBAC system
-- without modifying each policy individually.
--
-- Role Mapping:
--   RBAC 'super_admin'       -> Legacy 'admin'
--   RBAC 'chairman'          -> Legacy 'chairman'
--   RBAC 'vice_chairman'     -> Legacy 'chairman' (same access level)
--   RBAC 'financial_officer' -> Legacy 'financial_secretary'
--   RBAC 'security_officer'  -> Legacy 'security_officer'
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    v_role_name TEXT;
    v_legacy_role user_role;
BEGIN
    -- Get role from new RBAC system (profiles.role_id -> app_roles.name)
    SELECT ar.name INTO v_role_name
    FROM profiles p
    JOIN app_roles ar ON ar.id = p.role_id
    WHERE p.id = auth.uid();

    IF v_role_name IS NOT NULL THEN
        -- Map RBAC role names to legacy enum values for backward compatibility
        v_legacy_role := CASE v_role_name
            WHEN 'super_admin' THEN 'admin'::user_role
            WHEN 'chairman' THEN 'chairman'::user_role
            WHEN 'vice_chairman' THEN 'chairman'::user_role
            WHEN 'financial_officer' THEN 'financial_secretary'::user_role
            WHEN 'security_officer' THEN 'security_officer'::user_role
            ELSE NULL
        END;
        RETURN v_legacy_role;
    END IF;

    -- Fallback: return legacy role if RBAC role_id not set
    SELECT role INTO v_legacy_role FROM profiles WHERE id = auth.uid();
    RETURN v_legacy_role;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated;

COMMENT ON FUNCTION public.get_my_role() IS
'Returns legacy user_role enum by reading from new RBAC system (app_roles via role_id).
Maps new role names to legacy enum values for backward compatibility with existing RLS policies.
Falls back to legacy profiles.role field if role_id is not set.';
