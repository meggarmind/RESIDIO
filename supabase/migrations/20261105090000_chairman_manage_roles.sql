-- Issue #1331 (part of #1315): the Chairman manages roles, titles, role rules and board roles.
--
-- Owner decision (29 Oct 2026, project thread): the chairman role gets system.manage_roles and
-- system.assign_board_roles. Before this, only super_admin held them, so a Chairman could not see
-- the Roles tab (roles and titles) or the "Who can hold each role" tab on Settings > Roles & Access,
-- and could not change another Chairman or give the Chairman or Trustee role.
-- Who can do what widens to chairman holders only. The own-role guard in the role actions still
-- stops a Chairman editing the Chairman role itself.
--
-- ROLLBACK:
-- BEGIN;
-- DELETE FROM public.role_permissions
--  WHERE role_id = (SELECT id FROM public.app_roles WHERE name = 'chairman')
--    AND permission_id IN (SELECT id FROM public.app_permissions
--                           WHERE name IN ('system.manage_roles', 'system.assign_board_roles'));
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT p.name, string_agg(r.name, ', ' ORDER BY r.name) AS roles
--     FROM public.role_permissions rp
--     JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name IN ('system.manage_roles', 'system.assign_board_roles')
--    GROUP BY p.name ORDER BY p.name;
--     -- system.assign_board_roles | chairman, super_admin
--     -- system.manage_roles       | chairman, super_admin

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.app_roles r
 CROSS JOIN public.app_permissions p
 WHERE r.name = 'chairman'
   AND p.name IN ('system.manage_roles', 'system.assign_board_roles')
ON CONFLICT DO NOTHING;
