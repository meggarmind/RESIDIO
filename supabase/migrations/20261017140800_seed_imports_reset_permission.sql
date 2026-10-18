-- Seed the permission that gates resetting a failed bank statement import (#708).
--
-- WHAT CHANGES
--   One app_permissions row, imports.reset, and one role_permissions row granting it to
--   super_admin. No enum change: category `imports` already exists in `permission_category`.
--
-- WHY
--   A failed import had no way out. Owner decision on #668 Q4: a super-admin-only, audited
--   reset (not an automatic retry). resetFailedImport moves a failed import back to
--   processing and clears its submitter and approver so maker-checker runs again.
--
-- WHO IS AFFECTED
--   super_admin only. No other role gains anything. No RLS, grant or policy changes.
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING on both inserts.
--
-- ROLLBACK:
--   BEGIN;
--   DELETE FROM public.role_permissions
--     WHERE permission_id IN (SELECT id FROM public.app_permissions WHERE name = 'imports.reset');
--   DELETE FROM public.app_permissions WHERE name = 'imports.reset';
--   COMMIT;
--
-- VERIFY (run on the database after applying):
--   SELECT r.name AS role, p.name AS permission, p.category, p.is_active
--     FROM public.app_permissions p
--     LEFT JOIN public.role_permissions rp ON rp.permission_id = p.id
--     LEFT JOIN public.app_roles r ON r.id = rp.role_id
--    WHERE p.name = 'imports.reset';
--     -- expect exactly 1 row: super_admin, imports.reset, imports, true

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
    'imports.reset',
    'Reset Failed Imports',
    'Move a failed bank statement import back to review so it is submitted and approved again',
    'imports',
    true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name = 'super_admin'
  AND p.name = 'imports.reset'
ON CONFLICT DO NOTHING;

COMMIT;
