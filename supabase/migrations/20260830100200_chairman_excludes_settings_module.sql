-- ============================================================================
-- Migration: Chairman is the Super Administrator without the Settings module
-- ============================================================================
-- Purpose: Product definition of the Chairman role. Chairman keeps every
--          operational capability — residents, houses, payments, billing,
--          security, reports, documents, announcements, approvals — and loses
--          configuration entirely.
--
-- Written as a declarative revoke by category rather than a hardcoded id list,
-- so it is idempotent and does not depend on what Chairman happens to hold when
-- it runs. (Per the original seed Chairman was granted `category != 'system'`;
-- the live project shows a larger set, granted through the UI. Either way this
-- removes exactly the settings and system rows.)
--
-- Consequence to be explicit about: `system.manage_roles` and
-- `system.assign_roles` are both in the system category, and Roles &
-- Permissions lives under /settings. So the Chairman can no longer define or
-- assign roles. That follows from "no access to the entire Settings module" and
-- is the accepted trade-off. It also matches what the database already
-- enforced: writes to app_roles and role_permissions are gated on
-- is_super_admin(), so Chairman never had a working path to role management.
--
-- Vice Chairman is deliberately untouched.
-- ============================================================================

DELETE FROM role_permissions rp
USING app_roles ar, app_permissions ap
WHERE rp.role_id = ar.id
  AND rp.permission_id = ap.id
  AND ar.name = 'chairman'
  AND ap.category IN ('settings', 'system');

-- ---------------------------------------------------------------------------
-- Rollback
-- ---------------------------------------------------------------------------
-- To restore the previous grant (Chairman held every settings permission plus
-- system.monitor, and in the live project the full system category):
--
--   INSERT INTO role_permissions (role_id, permission_id)
--   SELECT ar.id, ap.id
--   FROM app_roles ar
--   CROSS JOIN app_permissions ap
--   WHERE ar.name = 'chairman'
--     AND ap.category IN ('settings', 'system')
--   ON CONFLICT DO NOTHING;
