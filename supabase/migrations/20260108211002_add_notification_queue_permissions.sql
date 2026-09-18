-- Migration: Add Notification Queue Management Permission
-- Purpose: Allow admins to view and manage notification queue
-- Date: 2026-01-09

-- Add notifications.manage permission
INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  (
    'notifications.manage',
    'Manage Notification Queue',
    'View and manage notification queue',
    'notifications',
    true
  )
ON CONFLICT (name) DO NOTHING;

-- Assign to super_admin role
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id 
FROM app_roles r 
CROSS JOIN app_permissions p
WHERE r.name = 'super_admin' 
  AND p.name = 'notifications.manage'
ON CONFLICT DO NOTHING;
