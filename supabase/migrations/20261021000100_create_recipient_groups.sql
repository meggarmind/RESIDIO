-- Custom recipient groups (#819): named lists of residents that admins define once at
-- Settings > Groups and select wherever the system sends to "these people". The first and
-- only consumer is clearance certificate copies (#816).
--
-- * recipient_groups: name unique (case-insensitive), optional description.
-- * recipient_group_members: one row per (group, resident). Members are residents only
--   (owner decision 2026-10-19), so a renamed or moved-out resident is handled by the
--   resident record. Deleting a resident removes their memberships.
-- * RLS on both tables: read needs groups.view, write needs groups.manage. The server actions
--   use the service role and check the same permissions first.
-- * Permissions groups.view and groups.manage, granted to super_admin and chairman only.
-- * Seed: an empty "Estate officials" group, and the system setting
--   clearance_copy_recipient_group_id pointing at it, so it is the default group for
--   clearance certificate copies. The setting is what makes a group "in use": the delete
--   action refuses a group a setting still points at.
--
-- Depends on 20261021000050_add_groups_permission_category.sql.
--
-- Rollback:
--   DELETE FROM public.system_settings WHERE key = 'clearance_copy_recipient_group_id';
--   DROP TABLE IF EXISTS public.recipient_group_members;
--   DROP TABLE IF EXISTS public.recipient_groups;
--   DELETE FROM public.role_permissions
--     WHERE permission_id IN (SELECT id FROM public.app_permissions WHERE name IN ('groups.view', 'groups.manage'));
--   DELETE FROM public.app_permissions WHERE name IN ('groups.view', 'groups.manage');

BEGIN;

CREATE TABLE IF NOT EXISTS public.recipient_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT recipient_groups_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS recipient_groups_name_key
  ON public.recipient_groups (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.recipient_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES public.recipient_groups(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT recipient_group_members_group_resident_key UNIQUE (group_id, resident_id)
);

CREATE INDEX IF NOT EXISTS idx_recipient_group_members_resident
  ON public.recipient_group_members (resident_id);

ALTER TABLE public.recipient_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recipient_group_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.recipient_groups, public.recipient_group_members FROM anon;
GRANT ALL ON TABLE public.recipient_groups, public.recipient_group_members TO service_role;

CREATE POLICY recipient_groups_select ON public.recipient_groups
  FOR SELECT TO authenticated USING ((select has_permission('groups.view')));
CREATE POLICY recipient_groups_write ON public.recipient_groups
  FOR ALL TO authenticated
  USING ((select has_permission('groups.manage')))
  WITH CHECK ((select has_permission('groups.manage')));

CREATE POLICY recipient_group_members_select ON public.recipient_group_members
  FOR SELECT TO authenticated USING ((select has_permission('groups.view')));
CREATE POLICY recipient_group_members_write ON public.recipient_group_members
  FOR ALL TO authenticated
  USING ((select has_permission('groups.manage')))
  WITH CHECK ((select has_permission('groups.manage')));

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('groups.view', 'View Recipient Groups', 'View recipient groups and their members', 'groups', true),
  ('groups.manage', 'Manage Recipient Groups', 'Create, rename and delete recipient groups and change their members', 'groups', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman')
  AND p.name IN ('groups.view', 'groups.manage')
ON CONFLICT DO NOTHING;

INSERT INTO public.recipient_groups (name, description)
VALUES ('Estate officials', 'Residents who hold an estate office, such as the Chairman, Financial Secretary, Treasurer and Security Officer.')
ON CONFLICT DO NOTHING;

INSERT INTO public.system_settings (key, value, category, description)
SELECT 'clearance_copy_recipient_group_id', to_jsonb(g.id::text), 'billing',
       'Recipient group that receives a copy of every issued clearance certificate'
FROM public.recipient_groups g
WHERE lower(g.name) = 'estate officials'
ON CONFLICT (key) DO NOTHING;

COMMIT;
