-- Seed the permission that gates the System Action Log (#538).
--
-- No enum change is needed: category `system` already exists in
-- `permission_category`. Granted to super_admin ONLY: the `system` category is
-- closed to chairman and vice_chairman (ADR-0006).
--
-- Rollback:
--   DELETE FROM public.role_permissions
--     WHERE permission_id IN (SELECT id FROM public.app_permissions WHERE name = 'system.view_system_log');
--   DELETE FROM public.app_permissions WHERE name = 'system.view_system_log';

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
    'system.view_system_log',
    'View System Action Log',
    'View what automated processes (cron runs and webhooks) did',
    'system',
    true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name = 'super_admin'
  AND p.name = 'system.view_system_log'
ON CONFLICT DO NOTHING;

COMMIT;
