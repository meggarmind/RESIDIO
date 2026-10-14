-- get_my_access(): the signed-in user's role id, role name and permissions in
-- ONE round trip (#534, parent #531).
--
-- authorizePermission() used to resolve access with four sequential queries
-- (profiles, app_roles, role_permissions, app_permissions). This function does
-- the same resolution in one call and is gated exactly like get_my_permissions():
-- the caller must be the signed-in user (auth.uid()) and their profile must be
-- approved ('active'). A user who is not approved, or has no role, gets zero rows.
--
-- Shape: one row per active permission of the role. A role that has no
-- permissions (or only inactive ones) still returns exactly one row with a NULL
-- permission_name, so "role resolved, no permissions" is distinguishable from
-- "no access" (zero rows). app_roles.is_active is deliberately NOT filtered:
-- the existing application code never did.

CREATE OR REPLACE FUNCTION public.get_my_access()
RETURNS TABLE(role_id UUID, role_name TEXT, permission_name TEXT)
SECURITY DEFINER
STABLE
SET search_path = public, auth, extensions, pg_temp
LANGUAGE plpgsql
AS $fn$
BEGIN
    RETURN QUERY
    SELECT pr.role_id, ar.name::TEXT, ap.name::TEXT
    FROM profiles pr
    JOIN app_roles ar ON ar.id = pr.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = pr.role_id
    LEFT JOIN app_permissions ap ON ap.id = rp.permission_id AND ap.is_active = TRUE
    WHERE pr.id = auth.uid()
      AND pr.approval_status = 'active';
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_my_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_access() TO authenticated, service_role;
