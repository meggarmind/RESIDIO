-- Insert 2FA permissions
INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  ('two_factor.view_status', 'View 2FA Status', 'Can view own two-factor authentication status', 'two_factor', true),
  ('two_factor.enable', 'Enable 2FA', 'Can enable two-factor authentication for own account', 'two_factor', true),
  ('two_factor.disable', 'Disable 2FA', 'Can disable two-factor authentication for own account', 'two_factor', true),
  ('two_factor.manage_policies', 'Manage 2FA Policies', 'Can manage two-factor authentication policies for roles', 'two_factor', true),
  ('two_factor.view_audit_log', 'View 2FA Audit Log', 'Can view two-factor authentication audit logs', 'two_factor', true),
  ('two_factor.reset_user', 'Reset User 2FA', 'Can reset two-factor authentication for other users', 'two_factor', true)
ON CONFLICT (name) DO NOTHING;

-- Assign basic 2FA permissions to all roles (view_status, enable, disable)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM app_roles r CROSS JOIN app_permissions p
WHERE p.name IN ('two_factor.view_status', 'two_factor.enable', 'two_factor.disable')
ON CONFLICT DO NOTHING;

-- Assign admin-only 2FA permissions (manage_policies, view_audit_log, reset_user)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM app_roles r CROSS JOIN app_permissions p
WHERE r.name IN ('super_admin', 'chairman')
AND p.name IN ('two_factor.manage_policies', 'two_factor.view_audit_log', 'two_factor.reset_user')
ON CONFLICT DO NOTHING;

-- Assign security officer view audit log permission
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM app_roles r CROSS JOIN app_permissions p
WHERE r.name = 'security_officer'
AND p.name = 'two_factor.view_audit_log'
ON CONFLICT DO NOTHING;
