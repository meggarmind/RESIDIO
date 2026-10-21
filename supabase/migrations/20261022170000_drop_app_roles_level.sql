-- Drop app_roles.level (#826, slice 4 of the RBAC redesign #822).
--
-- WHAT CHANGES
--   app_roles.level (integer, default 0) is dropped.
--
-- WHY
--   The owner decided on 2026-10-19 (#822) that privilege comes from role permissions only. Who
--   may grant which role, and who may change whom, is now src/lib/auth/account-guards.ts
--   (system.assign_roles and system.assign_board_roles), which replaced the name-based rank in
--   src/lib/auth/role-rank.ts. level decided no access: the application used it only to validate
--   the role form, to sort roles and admins, and to label them, and all of that is removed in the
--   same change. No view, function, trigger or RLS policy in supabase/ reads it.
--
-- WHO IS AFFECTED
--   Nobody's access changes. The role form loses its Level field, and role and admin lists sort by
--   display name instead. Deploy the application change first or together: until then the old
--   code still selects and orders by level, and those reads fail once the column is gone.
--
-- SAFETY
--   No CASCADE: if anything in the database still depends on the column, the drop raises and the
--   migration rolls back rather than taking the dependant with it.
--
-- IDEMPOTENT: DROP COLUMN IF EXISTS. A second run changes nothing.
--
-- ROLLBACK (the column carried no access decision; custom roles' old values are not kept, so
--   they come back as 3, the value every officer role had):
--   ALTER TABLE public.app_roles ADD COLUMN IF NOT EXISTS level integer DEFAULT 0;
--   UPDATE public.app_roles
--   SET level = CASE name WHEN 'super_admin' THEN 0 WHEN 'chairman' THEN 1 ELSE 3 END;
--   Then revert the application change, which selects and writes the column again.
--
-- VERIFY (read-only, run on the database after applying):
--   -- Zero rows: the column is gone.
--   SELECT column_name FROM information_schema.columns
--   WHERE table_schema = 'public' AND table_name = 'app_roles' AND column_name = 'level';

BEGIN;

ALTER TABLE public.app_roles DROP COLUMN IF EXISTS level;

COMMIT;
