-- =====================================================
-- Migration: Add System Monitor Permissions
-- Purpose: Enable cron status monitoring for admins
-- Phase: 16 - Operational Support Features (Feature 3)
-- =====================================================

-- Add system monitor permission
INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  ('system.monitor', 'Monitor System Health', 'View system health and cron status', 'system', true)
ON CONFLICT (name) DO NOTHING;

-- Assign to super_admin and chairman roles
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name IN ('super_admin', 'chairman')
  AND p.name = 'system.monitor'
ON CONFLICT DO NOTHING;
