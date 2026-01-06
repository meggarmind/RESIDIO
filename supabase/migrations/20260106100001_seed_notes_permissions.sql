-- Migration: Seed Notes Module Permissions
-- Adds permission category and permissions for the Notes module

-- ============================================================================
-- ADD PERMISSION CATEGORY
-- ============================================================================

-- Add 'notes' to the permission_category enum
ALTER TYPE permission_category ADD VALUE IF NOT EXISTS 'notes';

-- ============================================================================
-- SEED PERMISSIONS
-- ============================================================================

INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  ('notes.view', 'View Notes', 'Can view notes on residents and houses', 'notes', true),
  ('notes.create', 'Create Notes', 'Can create new notes on residents and houses', 'notes', true),
  ('notes.update', 'Update Notes', 'Can edit existing notes (creates new version)', 'notes', true),
  ('notes.delete', 'Delete Notes', 'Can delete notes', 'notes', true),
  ('notes.view_confidential', 'View Confidential Notes', 'Can view notes marked as confidential regardless of role restrictions', 'notes', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- ASSIGN PERMISSIONS TO ROLES
-- ============================================================================

-- Super Admin: All notes permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'super_admin'
  AND p.category = 'notes'
ON CONFLICT DO NOTHING;

-- Chairman: All notes permissions
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'chairman'
  AND p.category = 'notes'
ON CONFLICT DO NOTHING;

-- Vice Chairman: View, Create, Update notes (no delete, no view_confidential)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'vice_chairman'
  AND p.name IN ('notes.view', 'notes.create', 'notes.update')
ON CONFLICT DO NOTHING;

-- Financial Secretary: View, Create, Update notes (no delete, no view_confidential)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'financial_secretary'
  AND p.name IN ('notes.view', 'notes.create', 'notes.update')
ON CONFLICT DO NOTHING;

-- Financial Officer: View, Create notes only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'financial_officer'
  AND p.name IN ('notes.view', 'notes.create')
ON CONFLICT DO NOTHING;

-- Secretary: View, Create, Update notes
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'secretary'
  AND p.name IN ('notes.view', 'notes.create', 'notes.update')
ON CONFLICT DO NOTHING;

-- PRO: View, Create notes only
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'pro'
  AND p.name IN ('notes.view', 'notes.create')
ON CONFLICT DO NOTHING;

-- Security Coordinator: View, Create notes (for security-related notes)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'security_coordinator'
  AND p.name IN ('notes.view', 'notes.create')
ON CONFLICT DO NOTHING;

-- Note: Resident role does NOT get any notes permissions (admin-only feature)
