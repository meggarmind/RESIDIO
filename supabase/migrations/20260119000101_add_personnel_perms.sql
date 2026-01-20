-- Add Personnel/Vendors permissions
-- 20260119000101_add_personnel_perms.sql

-- 2. Insert Permissions
INSERT INTO public.app_permissions (name, display_name, description, category)
VALUES 
    ('view_vendors', 'View Personnel', 'View personnel and vendors directory', 'personnel'),
    ('manage_vendors', 'Manage Personnel', 'Create, update, and delete personnel records', 'personnel')
ON CONFLICT (name) DO NOTHING;

-- 3. Assign Permissions to Roles
-- Roles: admin, chairman, financial_secretary, super_admin

WITH roles AS (
    SELECT id, name FROM public.app_roles WHERE name IN ('admin', 'chairman', 'financial_secretary', 'super_admin')
),
perms AS (
    SELECT id, name FROM public.app_permissions WHERE name IN ('view_vendors', 'manage_vendors')
)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN perms p
WHERE 
    -- Grant both permissions to all these roles
    NOT EXISTS (
        SELECT 1 FROM public.role_permissions arp 
        WHERE arp.role_id = r.id AND arp.permission_id = p.id
    );
