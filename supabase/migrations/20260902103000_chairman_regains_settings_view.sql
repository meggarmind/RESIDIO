-- ============================================================================
-- Migration: Chairman regains settings.view
-- ============================================================================
-- Purpose: Restore `settings.view` permission to the chairman role, allowing
--          access to the Settings landing page. Chairman can then deep-link
--          into individual settings areas where they hold specific permissions
--          (announcements, documents, billing profiles, email imports,
--          notifications, security categories, and WhatsApp).
--
-- Per ADR-0006, this grants only `settings.view`. What Chairman sees inside
-- Settings remains governed by their nine existing category-specific
-- permissions. The system and settings.manage_* categories are still denied.
--
-- This migration is idempotent and can be safely run multiple times.
-- ============================================================================

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'chairman'
  AND p.name = 'settings.view'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- To revoke this grant:
--
--   DELETE FROM role_permissions rp
--   USING app_roles ar, app_permissions ap
--   WHERE rp.role_id = ar.id
--     AND rp.permission_id = ap.id
--     AND ar.name = 'chairman'
--     AND ap.name = 'settings.view';
