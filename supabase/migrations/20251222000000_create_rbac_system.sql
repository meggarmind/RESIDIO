-- Phase 10: Flexible RBAC System
-- Transforms hardcoded 4-role system to 7+ configurable roles with granular permissions

-- =====================================================
-- STEP 1: Create App Roles Table (without RLS policies that depend on role_id)
-- =====================================================

CREATE TABLE IF NOT EXISTS app_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    -- Organizational structure
    category VARCHAR(50) DEFAULT 'exco', -- 'exco' (executive), 'bot' (board of trustees), 'staff', 'resident'
    level INT DEFAULT 0, -- Hierarchy level (0 = highest, e.g., super_admin)
    -- Flags
    is_system_role BOOLEAN DEFAULT FALSE, -- System roles cannot be deleted
    is_active BOOLEAN DEFAULT TRUE,
    can_be_assigned_to_resident BOOLEAN DEFAULT TRUE, -- Only residents can have admin roles
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL
);

-- Enable RLS
ALTER TABLE app_roles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_roles (read-only for now, admin policies added after role_id column exists)
CREATE POLICY "Allow read access to all authenticated users" ON app_roles
    FOR SELECT USING (auth.role() = 'authenticated');

-- =====================================================
-- STEP 2: Create App Permissions Table
-- =====================================================

-- Permission categories (modules)
CREATE TYPE permission_category AS ENUM (
    'residents',
    'houses',
    'payments',
    'billing',
    'security',
    'reports',
    'settings',
    'imports',
    'approvals',
    'system'
);

CREATE TABLE IF NOT EXISTS app_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE, -- e.g., 'residents.view', 'residents.create'
    display_name VARCHAR(150) NOT NULL,
    description TEXT,
    category permission_category NOT NULL,
    -- Flags
    is_active BOOLEAN DEFAULT TRUE,
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE app_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for app_permissions
CREATE POLICY "Allow read access to all authenticated users" ON app_permissions
    FOR SELECT USING (auth.role() = 'authenticated');

-- =====================================================
-- STEP 3: Create Role-Permissions Junction Table
-- =====================================================

CREATE TABLE IF NOT EXISTS role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES app_roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES app_permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    UNIQUE(role_id, permission_id)
);

-- Enable RLS
ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for role_permissions
CREATE POLICY "Allow read access to all authenticated users" ON role_permissions
    FOR SELECT USING (auth.role() = 'authenticated');

-- =====================================================
-- STEP 4: Add role_id to profiles (FK to app_roles)
-- =====================================================

-- First, add the new column (nullable initially for migration)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS role_id UUID REFERENCES app_roles(id) ON DELETE SET NULL;

-- =====================================================
-- STEP 5: Seed the 7 Default Roles
-- =====================================================

INSERT INTO app_roles (name, display_name, description, category, level, is_system_role, can_be_assigned_to_resident)
VALUES
    ('super_admin', 'Super Administrator', 'Full system access with ability to manage other admins and system settings', 'exco', 0, TRUE, TRUE),
    ('chairman', 'Chairman', 'Estate chairman with oversight of all operations', 'exco', 1, TRUE, TRUE),
    ('vice_chairman', 'Vice Chairman', 'Deputy to the chairman, can act on behalf when chairman is unavailable', 'exco', 2, FALSE, TRUE),
    ('financial_officer', 'Financial Officer', 'Manages billing, payments, and financial reports', 'exco', 3, FALSE, TRUE),
    ('security_officer', 'Security Officer', 'Manages security contacts, access codes, and gate operations', 'exco', 3, FALSE, TRUE),
    ('secretary', 'Secretary', 'Manages documentation, communications, and resident records', 'exco', 3, FALSE, TRUE),
    ('project_manager', 'Project Manager', 'Manages estate projects and development levies', 'exco', 3, FALSE, TRUE),
    ('resident', 'Resident', 'Standard resident with self-service portal access only', 'resident', 10, TRUE, FALSE)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- STEP 6: Seed All Granular Permissions
-- =====================================================

INSERT INTO app_permissions (name, display_name, description, category)
VALUES
    -- Residents Module
    ('residents.view', 'View Residents', 'View resident list and details', 'residents'),
    ('residents.create', 'Create Residents', 'Add new residents to the system', 'residents'),
    ('residents.update', 'Update Residents', 'Edit resident information', 'residents'),
    ('residents.delete', 'Delete Residents', 'Remove residents from the system', 'residents'),
    ('residents.verify', 'Verify Residents', 'Verify resident identity documents', 'residents'),
    ('residents.export', 'Export Residents', 'Export resident data to CSV/Excel', 'residents'),

    -- Houses Module
    ('houses.view', 'View Houses', 'View property list and details', 'houses'),
    ('houses.create', 'Create Houses', 'Add new properties to the system', 'houses'),
    ('houses.update', 'Update Houses', 'Edit property information', 'houses'),
    ('houses.delete', 'Delete Houses', 'Remove properties from the system', 'houses'),
    ('houses.assign_resident', 'Assign Residents to Houses', 'Link residents to properties', 'houses'),

    -- Payments Module
    ('payments.view', 'View Payments', 'View payment records', 'payments'),
    ('payments.create', 'Record Payments', 'Record new payment transactions', 'payments'),
    ('payments.update', 'Update Payments', 'Edit payment records', 'payments'),
    ('payments.delete', 'Delete Payments', 'Remove payment records', 'payments'),
    ('payments.bulk_update', 'Bulk Update Payments', 'Update multiple payments at once', 'payments'),
    ('payments.export', 'Export Payments', 'Export payment data to CSV/Excel', 'payments'),

    -- Billing Module
    ('billing.view', 'View Billing', 'View invoices and billing profiles', 'billing'),
    ('billing.create_invoice', 'Generate Invoices', 'Create new invoices', 'billing'),
    ('billing.void_invoice', 'Void Invoices', 'Cancel/void existing invoices', 'billing'),
    ('billing.manage_profiles', 'Manage Billing Profiles', 'Create and edit billing profiles', 'billing'),
    ('billing.apply_late_fees', 'Apply Late Fees', 'Apply late fees to overdue invoices', 'billing'),
    ('billing.manage_wallets', 'Manage Wallets', 'Adjust resident wallet balances', 'billing'),

    -- Security Module
    ('security.view', 'View Security Contacts', 'View security contact list', 'security'),
    ('security.register_contacts', 'Register Contacts', 'Add new security contacts', 'security'),
    ('security.update_contacts', 'Update Contacts', 'Edit security contact information', 'security'),
    ('security.suspend_revoke', 'Suspend/Revoke Contacts', 'Suspend or revoke security contacts', 'security'),
    ('security.generate_codes', 'Generate Access Codes', 'Generate access codes for contacts', 'security'),
    ('security.verify_codes', 'Verify Access Codes', 'Verify access codes at gate', 'security'),
    ('security.record_access', 'Record Check-In/Out', 'Record gate access logs', 'security'),
    ('security.view_logs', 'View Access Logs', 'View gate access history', 'security'),
    ('security.export', 'Export Security Data', 'Export security contacts and logs', 'security'),
    ('security.manage_categories', 'Manage Categories', 'Configure security contact categories', 'security'),

    -- Reports Module
    ('reports.view_financial', 'View Financial Reports', 'Access financial overview and reports', 'reports'),
    ('reports.view_occupancy', 'View Occupancy Reports', 'Access occupancy and property reports', 'reports'),
    ('reports.view_security', 'View Security Reports', 'Access security activity reports', 'reports'),
    ('reports.export', 'Export Reports', 'Export reports to PDF/Excel', 'reports'),

    -- Settings Module
    ('settings.view', 'View Settings', 'View application settings', 'settings'),
    ('settings.manage_general', 'Manage General Settings', 'Edit estate information and general settings', 'settings'),
    ('settings.manage_billing', 'Manage Billing Settings', 'Configure billing and late fees', 'settings'),
    ('settings.manage_security', 'Manage Security Settings', 'Configure security module settings', 'settings'),
    ('settings.manage_reference', 'Manage Reference Data', 'Edit streets, house types, bank accounts', 'settings'),
    ('settings.view_audit_logs', 'View Audit Logs', 'Access system audit trail', 'settings'),

    -- Imports Module
    ('imports.create', 'Create Imports', 'Upload and create bank statement imports', 'imports'),
    ('imports.review', 'Review Imports', 'Review and match imported transactions', 'imports'),
    ('imports.approve', 'Approve Imports', 'Approve imports for payment creation', 'imports'),
    ('imports.reject', 'Reject Imports', 'Reject import batches', 'imports'),

    -- Approvals Module
    ('approvals.view', 'View Approvals', 'View pending approval requests', 'approvals'),
    ('approvals.approve_reject', 'Approve/Reject Requests', 'Approve or reject pending requests', 'approvals'),

    -- System Module (Super Admin Only)
    ('system.manage_roles', 'Manage Roles', 'Create and configure user roles', 'system'),
    ('system.assign_roles', 'Assign Roles', 'Assign roles to residents', 'system'),
    ('system.manage_maintenance', 'Manage Maintenance Mode', 'Enable/disable maintenance mode', 'system'),
    ('system.manage_data_retention', 'Manage Data Retention', 'Configure data retention policies', 'system'),
    ('system.view_all_settings', 'View All System Settings', 'Access to all system configuration', 'system')
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- STEP 7: Assign Default Permissions to Roles
-- =====================================================

-- Helper function to assign permissions to a role
CREATE OR REPLACE FUNCTION assign_permissions_to_role(
    p_role_name VARCHAR(50),
    p_permissions TEXT[]
) RETURNS VOID AS $$
DECLARE
    v_role_id UUID;
    v_perm TEXT;
    v_perm_id UUID;
BEGIN
    SELECT id INTO v_role_id FROM app_roles WHERE name = p_role_name;

    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Role % not found', p_role_name;
    END IF;

    FOREACH v_perm IN ARRAY p_permissions
    LOOP
        SELECT id INTO v_perm_id FROM app_permissions WHERE name = v_perm;
        IF v_perm_id IS NOT NULL THEN
            INSERT INTO role_permissions (role_id, permission_id)
            VALUES (v_role_id, v_perm_id)
            ON CONFLICT (role_id, permission_id) DO NOTHING;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Super Admin: All permissions
SELECT assign_permissions_to_role('super_admin', ARRAY(SELECT name FROM app_permissions));

-- Chairman: All except system management
SELECT assign_permissions_to_role('chairman', ARRAY(
    SELECT name FROM app_permissions
    WHERE category != 'system'
));

-- Vice Chairman: Same as Chairman
SELECT assign_permissions_to_role('vice_chairman', ARRAY(
    SELECT name FROM app_permissions
    WHERE category != 'system'
));

-- Financial Officer: Payments, Billing, some Reports
SELECT assign_permissions_to_role('financial_officer', ARRAY[
    'residents.view', 'residents.export',
    'houses.view',
    'payments.view', 'payments.create', 'payments.update', 'payments.delete', 'payments.bulk_update', 'payments.export',
    'billing.view', 'billing.create_invoice', 'billing.void_invoice', 'billing.manage_profiles', 'billing.apply_late_fees', 'billing.manage_wallets',
    'reports.view_financial', 'reports.export',
    'settings.view', 'settings.manage_billing',
    'imports.create', 'imports.review', 'imports.approve', 'imports.reject',
    'approvals.view', 'approvals.approve_reject'
]);

-- Security Officer: Security module focus
SELECT assign_permissions_to_role('security_officer', ARRAY[
    'residents.view',
    'houses.view',
    'security.view', 'security.register_contacts', 'security.update_contacts',
    'security.generate_codes', 'security.verify_codes', 'security.record_access',
    'security.view_logs', 'security.export',
    'reports.view_security',
    'settings.view'
]);

-- Secretary: Residents, Houses, Communications
SELECT assign_permissions_to_role('secretary', ARRAY[
    'residents.view', 'residents.create', 'residents.update', 'residents.verify', 'residents.export',
    'houses.view', 'houses.create', 'houses.update', 'houses.assign_resident',
    'payments.view',
    'billing.view',
    'settings.view', 'settings.manage_reference',
    'reports.view_occupancy', 'reports.export'
]);

-- Project Manager: Houses, Billing profiles, Development levies
SELECT assign_permissions_to_role('project_manager', ARRAY[
    'residents.view',
    'houses.view', 'houses.update',
    'payments.view',
    'billing.view', 'billing.manage_profiles',
    'reports.view_financial', 'reports.export',
    'settings.view'
]);

-- Resident: Read-only self-service (permissions handled differently in Phase 12)
-- No admin permissions assigned

-- Drop the helper function
DROP FUNCTION IF EXISTS assign_permissions_to_role(VARCHAR, TEXT[]);

-- =====================================================
-- STEP 8: Migrate Existing Users
-- =====================================================

-- Map old role enum values to new role_id
UPDATE profiles p
SET role_id = (
    CASE
        WHEN p.role = 'admin' THEN (SELECT id FROM app_roles WHERE name = 'super_admin')
        WHEN p.role = 'chairman' THEN (SELECT id FROM app_roles WHERE name = 'chairman')
        WHEN p.role = 'financial_secretary' THEN (SELECT id FROM app_roles WHERE name = 'financial_officer')
        WHEN p.role = 'security_officer' THEN (SELECT id FROM app_roles WHERE name = 'security_officer')
        ELSE NULL
    END
)
WHERE p.role_id IS NULL AND p.role IS NOT NULL;

-- =====================================================
-- STEP 9: Create Helper Functions
-- =====================================================

-- Function to check if current user has a specific permission
CREATE OR REPLACE FUNCTION has_permission(p_permission_name TEXT)
RETURNS BOOLEAN
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_has_perm BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM profiles pr
        JOIN role_permissions rp ON rp.role_id = pr.role_id
        JOIN app_permissions ap ON ap.id = rp.permission_id
        WHERE pr.id = auth.uid()
        AND ap.name = p_permission_name
        AND ap.is_active = TRUE
    ) INTO v_has_perm;

    RETURN COALESCE(v_has_perm, FALSE);
END;
$$;

-- Function to get all permissions for current user
CREATE OR REPLACE FUNCTION get_my_permissions()
RETURNS TABLE(permission_name TEXT, category permission_category)
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT ap.name::TEXT, ap.category
    FROM profiles pr
    JOIN role_permissions rp ON rp.role_id = pr.role_id
    JOIN app_permissions ap ON ap.id = rp.permission_id
    WHERE pr.id = auth.uid()
    AND ap.is_active = TRUE;
END;
$$;

-- Function to get role name for current user (backwards compatibility)
CREATE OR REPLACE FUNCTION get_my_role_name()
RETURNS TEXT
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
    v_role_name TEXT;
BEGIN
    SELECT ar.name INTO v_role_name
    FROM profiles pr
    JOIN app_roles ar ON ar.id = pr.role_id
    WHERE pr.id = auth.uid();

    RETURN v_role_name;
END;
$$;

-- =====================================================
-- STEP 10: Create Updated Triggers
-- =====================================================

-- Update profiles updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger for app_roles
DROP TRIGGER IF EXISTS update_app_roles_updated_at ON app_roles;
CREATE TRIGGER update_app_roles_updated_at
    BEFORE UPDATE ON app_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- STEP 11: Add Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_app_roles_name ON app_roles(name);
CREATE INDEX IF NOT EXISTS idx_app_roles_category ON app_roles(category);
CREATE INDEX IF NOT EXISTS idx_app_permissions_name ON app_permissions(name);
CREATE INDEX IF NOT EXISTS idx_app_permissions_category ON app_permissions(category);
CREATE INDEX IF NOT EXISTS idx_role_permissions_role_id ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_permission_id ON role_permissions(permission_id);
CREATE INDEX IF NOT EXISTS idx_profiles_role_id ON profiles(role_id);

-- =====================================================
-- STEP 12: Add Admin RLS Policies (after role_id exists)
-- =====================================================

-- Now that role_id exists on profiles, add the admin-only policies
CREATE POLICY "Allow insert/update/delete for admins only" ON app_roles
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON ar.id = p.role_id
            WHERE p.id = auth.uid()
            AND ar.name = 'super_admin'
        )
    );

CREATE POLICY "Allow modify for admins only" ON role_permissions
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM profiles p
            JOIN app_roles ar ON ar.id = p.role_id
            WHERE p.id = auth.uid()
            AND ar.name = 'super_admin'
        )
    );

-- =====================================================
-- STEP 13: Add to Audit Entity Types (if not exists)
-- =====================================================

-- Note: audit_entity_type enum should be extended in app code (database.ts)
-- The new types are: 'app_roles', 'app_permissions', 'role_permissions'

COMMENT ON TABLE app_roles IS 'Configurable admin roles for the estate management system';
COMMENT ON TABLE app_permissions IS 'Granular permissions that can be assigned to roles';
COMMENT ON TABLE role_permissions IS 'Junction table linking roles to their permissions';
COMMENT ON COLUMN profiles.role_id IS 'Foreign key to app_roles table (new RBAC system)';
