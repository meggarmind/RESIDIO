-- Fix RLS infinite recursion on app_roles and role_permissions
-- The issue: FOR ALL policies that reference app_roles cause infinite recursion when SELECT happens

-- =====================================================
-- STEP 1: Drop problematic policies
-- =====================================================

DROP POLICY IF EXISTS "Allow insert/update/delete for admins only" ON app_roles;
DROP POLICY IF EXISTS "Allow modify for admins only" ON role_permissions;

-- =====================================================
-- STEP 2: Create helper function to check super_admin status
-- This uses SECURITY DEFINER to bypass RLS during the check
-- =====================================================

CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
STABLE
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM profiles p
        WHERE p.id = auth.uid()
        AND p.role_id IN (
            SELECT id FROM app_roles WHERE name = 'super_admin'
        )
    );
$$;

-- =====================================================
-- STEP 3: Recreate policies using the helper function
-- Split into specific operations instead of FOR ALL
-- =====================================================

-- app_roles: Admin-only write operations
CREATE POLICY "Allow insert for super_admin" ON app_roles
    FOR INSERT
    WITH CHECK (is_super_admin());

CREATE POLICY "Allow update for super_admin" ON app_roles
    FOR UPDATE
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

CREATE POLICY "Allow delete for super_admin" ON app_roles
    FOR DELETE
    USING (is_super_admin());

-- role_permissions: Admin-only write operations
CREATE POLICY "Allow insert for super_admin" ON role_permissions
    FOR INSERT
    WITH CHECK (is_super_admin());

CREATE POLICY "Allow update for super_admin" ON role_permissions
    FOR UPDATE
    USING (is_super_admin())
    WITH CHECK (is_super_admin());

CREATE POLICY "Allow delete for super_admin" ON role_permissions
    FOR DELETE
    USING (is_super_admin());

-- =====================================================
-- STEP 4: Ensure SELECT policies are correct
-- =====================================================

-- These should already exist but let's make sure
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON app_roles;
DROP POLICY IF EXISTS "Allow read access to all authenticated users" ON role_permissions;

CREATE POLICY "Allow read access to all authenticated users" ON app_roles
    FOR SELECT
    USING (auth.role() = 'authenticated');

CREATE POLICY "Allow read access to all authenticated users" ON role_permissions
    FOR SELECT
    USING (auth.role() = 'authenticated');

-- =====================================================
-- STEP 5: Add comment
-- =====================================================

COMMENT ON FUNCTION is_super_admin() IS 'Checks if current user has super_admin role. Uses SECURITY DEFINER to avoid RLS recursion.';
