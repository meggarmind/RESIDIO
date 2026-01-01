-- Insert announcement permissions
INSERT INTO app_permissions (name, display_name, description, category, is_active) VALUES
  ('announcements.view', 'View Announcements', 'View announcements and notices', 'announcements', true),
  ('announcements.create', 'Create Announcements', 'Create new announcements', 'announcements', true),
  ('announcements.update', 'Update Announcements', 'Edit existing announcements', 'announcements', true),
  ('announcements.delete', 'Delete Announcements', 'Delete announcements', 'announcements', true),
  ('announcements.publish', 'Publish Announcements', 'Publish and schedule announcements', 'announcements', true),
  ('announcements.manage_categories', 'Manage Announcement Categories', 'Create and edit announcement categories', 'announcements', true),
  ('announcements.manage_templates', 'Manage Message Templates', 'Create and edit message templates', 'announcements', true),
  ('announcements.emergency_broadcast', 'Emergency Broadcast', 'Send emergency announcements to all residents', 'announcements', true)
ON CONFLICT (name) DO NOTHING;

-- Insert notification permissions
INSERT INTO app_permissions (name, display_name, description, category, is_active) VALUES
  ('notifications.view', 'View Notifications', 'View in-app notifications', 'notifications', true),
  ('notifications.send', 'Send Notifications', 'Send notifications to residents', 'notifications', true),
  ('notifications.manage', 'Manage Notifications', 'Manage all notifications', 'notifications', true)
ON CONFLICT (name) DO NOTHING;

-- Insert report subscription permissions
INSERT INTO app_permissions (name, display_name, description, category, is_active) VALUES
  ('report_subscriptions.view', 'View Report Subscriptions', 'View report subscription settings', 'report_subscriptions', true),
  ('report_subscriptions.manage', 'Manage Report Subscriptions', 'Manage report subscription settings', 'report_subscriptions', true)
ON CONFLICT (name) DO NOTHING;

-- Grant announcement permissions to super_admin, chairman, and vice_chairman roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'vice_chairman')
AND p.category IN ('announcements', 'notifications', 'report_subscriptions')
AND p.is_active = true
ON CONFLICT DO NOTHING;

-- Grant view permissions to financial_officer and security_officer
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name IN ('financial_officer', 'security_officer')
AND p.name IN ('announcements.view', 'notifications.view', 'notifications.send')
AND p.is_active = true
ON CONFLICT DO NOTHING;
