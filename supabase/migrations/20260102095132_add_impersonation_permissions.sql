-- Add impersonation permissions
-- These control who can impersonate residents in the portal

-- Insert impersonation permissions
INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  ('impersonation.view_sessions', 'View Impersonation Sessions', 'Can view impersonation audit logs', 'impersonation', true),
  ('impersonation.start_session', 'Start Impersonation', 'Can impersonate residents (requires approval for non-super-admins)', 'impersonation', true),
  ('impersonation.approve_requests', 'Approve Impersonation Requests', 'Can approve other admins impersonation requests', 'impersonation', true),
  ('impersonation.manage_settings', 'Manage Impersonation Settings', 'Can configure impersonation approval rules', 'impersonation', true)
ON CONFLICT (name) DO NOTHING;

-- Assign impersonation permissions to super_admin and chairman
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM app_roles r 
CROSS JOIN app_permissions p
WHERE r.name IN ('super_admin', 'chairman') 
AND p.category = 'impersonation'
ON CONFLICT DO NOTHING;

-- Also grant approve_requests to vice_chairman and financial_officer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM app_roles r 
CROSS JOIN app_permissions p
WHERE r.name IN ('vice_chairman', 'financial_officer') 
AND p.name = 'impersonation.approve_requests'
ON CONFLICT DO NOTHING;
