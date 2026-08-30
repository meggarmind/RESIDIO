-- ============================================================================
-- Migration: RBAC table writes follow system.manage_roles, not a role name
-- ============================================================================
-- Purpose: Writes to app_roles and role_permissions were gated on
--          is_super_admin(). Every function in src/actions/roles/index.ts
--          writes through the caller's client, so granting system.manage_roles
--          to any other role passed authorizePermission() in the action and
--          then silently did nothing at the database.
--
--          Silently, because updateRolePermissions deletes-then-inserts: under
--          RLS the DELETE matched zero rows and returned no error, and only the
--          INSERT failed. The same class of bug was diagnosed and fixed for
--          assignRoleToUser (src/actions/roles/index.ts) with an admin client.
--
-- Approach: authorize on the permission the application already checks, with
-- is_super_admin() retained as an OR term so a super_admin whose grants are
-- somehow incomplete never locks itself out of role management.
--
-- has_permission() is SECURITY DEFINER (20251222000000), so evaluating it
-- inside a role_permissions policy does not recurse through RLS.
--
-- This does not widen access today: after the Chairman revoke, super_admin is
-- the only role holding system.manage_roles. It makes the grant mean something.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- app_roles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert for super_admin" ON app_roles;
DROP POLICY IF EXISTS "Allow update for super_admin" ON app_roles;
DROP POLICY IF EXISTS "Allow delete for super_admin" ON app_roles;

CREATE POLICY "Allow insert for role managers" ON app_roles
    FOR INSERT
    WITH CHECK (public.has_permission('system.manage_roles') OR is_super_admin());

CREATE POLICY "Allow update for role managers" ON app_roles
    FOR UPDATE
    USING (public.has_permission('system.manage_roles') OR is_super_admin())
    WITH CHECK (public.has_permission('system.manage_roles') OR is_super_admin());

CREATE POLICY "Allow delete for role managers" ON app_roles
    FOR DELETE
    USING (public.has_permission('system.manage_roles') OR is_super_admin());

-- ---------------------------------------------------------------------------
-- role_permissions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Allow insert for super_admin" ON role_permissions;
DROP POLICY IF EXISTS "Allow update for super_admin" ON role_permissions;
DROP POLICY IF EXISTS "Allow delete for super_admin" ON role_permissions;

CREATE POLICY "Allow insert for role managers" ON role_permissions
    FOR INSERT
    WITH CHECK (public.has_permission('system.manage_roles') OR is_super_admin());

CREATE POLICY "Allow update for role managers" ON role_permissions
    FOR UPDATE
    USING (public.has_permission('system.manage_roles') OR is_super_admin())
    WITH CHECK (public.has_permission('system.manage_roles') OR is_super_admin());

CREATE POLICY "Allow delete for role managers" ON role_permissions
    FOR DELETE
    USING (public.has_permission('system.manage_roles') OR is_super_admin());

COMMIT;
