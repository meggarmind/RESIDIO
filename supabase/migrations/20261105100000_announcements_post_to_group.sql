-- Issue #1328 (part of #1323): post an estate-wide announcement to the estate WhatsApp group.
--
-- WHAT CHANGES
--   1. announcements.post_to_whatsapp_group (boolean, default false): the "Post to estate group" tick.
--   2. Permission announcements.post_to_group (category announcements), granted to super_admin,
--      chairman and secretary only. Owner decision (29 Oct 2026, project thread): "Super Admin,
--      Chairman and Secretary Role. All others should be able to draft the message, but only the
--      3 roles mentioned should be able to publish."
--   3. Setting whatsapp_test_group_ids = [] (owner decision 8 in #1323): outside production a group
--      post is refused unless the estate group id is in this list. Group sends do not pass the comms
--      override, so this is the Stage guard.
--
-- Who can do what widens only for holders of the new permission. Nothing is dropped or deleted.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING.
--
-- ROLLBACK:
-- BEGIN;
-- DELETE FROM public.role_permissions
--  WHERE permission_id IN (SELECT id FROM public.app_permissions WHERE name = 'announcements.post_to_group');
-- DELETE FROM public.app_permissions WHERE name = 'announcements.post_to_group';
-- DELETE FROM public.system_settings WHERE key = 'whatsapp_test_group_ids';
-- ALTER TABLE public.announcements DROP COLUMN IF EXISTS post_to_whatsapp_group;
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT column_name, data_type, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'announcements' AND column_name = 'post_to_whatsapp_group';
--     -- post_to_whatsapp_group | boolean | false
--   SELECT string_agg(r.name, ', ' ORDER BY r.name) FROM public.role_permissions rp
--     JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name = 'announcements.post_to_group';
--     -- chairman, secretary, super_admin
--   SELECT value FROM public.system_settings WHERE key = 'whatsapp_test_group_ids';  -- []

ALTER TABLE public.announcements
  ADD COLUMN IF NOT EXISTS post_to_whatsapp_group BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.announcements.post_to_whatsapp_group IS
  'Post the announcement to the estate WhatsApp group when it is published (#1328). Estate-wide audiences only.';

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES ('announcements.post_to_group', 'Post to Estate Group', 'Publish an announcement that posts to the estate WhatsApp group', 'announcements', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
  FROM public.app_roles r
 CROSS JOIN public.app_permissions p
 WHERE r.name IN ('super_admin', 'chairman', 'secretary')
   AND p.name = 'announcements.post_to_group'
ON CONFLICT DO NOTHING;

INSERT INTO public.system_settings (key, value, description, category)
VALUES ('whatsapp_test_group_ids', '[]'::jsonb, 'Outside production, the only WhatsApp group ids an announcement may be posted to (#1328)', 'notifications')
ON CONFLICT (key) DO NOTHING;
