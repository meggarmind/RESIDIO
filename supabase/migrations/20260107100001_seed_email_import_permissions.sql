-- ============================================================
-- Seed Email Import Permissions
-- ============================================================
-- Adds permission category and individual permissions for email import feature

-- 1. Add permission category enum value
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'email_imports';

-- 2. Insert permissions
INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  ('email_imports.view', 'View Email Imports', 'Can view email import history and transactions', 'email_imports', true),
  ('email_imports.configure', 'Configure Email Integration', 'Can set up Gmail OAuth connection and manage settings', 'email_imports', true),
  ('email_imports.trigger', 'Trigger Email Fetch', 'Can manually trigger email fetch from Gmail', 'email_imports', true),
  ('email_imports.process', 'Process Email Transactions', 'Can review, approve, and process extracted transactions', 'email_imports', true),
  ('email_imports.manage_passwords', 'Manage Bank Account Passwords', 'Can set/update PDF statement passwords', 'email_imports', true)
ON CONFLICT (name) DO NOTHING;

-- 3. Assign permissions to roles
-- Super admin and chairman get all permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name IN ('super_admin', 'chairman')
AND p.category = 'email_imports'
ON CONFLICT DO NOTHING;

-- Financial officer gets view, trigger, and process permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'financial_officer'
AND p.name IN ('email_imports.view', 'email_imports.trigger', 'email_imports.process')
ON CONFLICT DO NOTHING;

-- Vice chairman gets view permission only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'vice_chairman'
AND p.name = 'email_imports.view'
ON CONFLICT DO NOTHING;
