-- Resident role view, group-definition table and the permission to read counts (#1094, child of #1093).
--
-- WHAT CHANGES
--   CREATE VIEW  public.resident_role_memberships
--     One row for each resident and role held: resident_id, role, house_count, entity_type.
--     Only active house links count: resident_houses.is_active, and move_out_date empty or in the future.
--     A person with several roles appears once for each role. house_count is the number of houses
--     the person holds that role in. co_resident is its own role value, so a co-resident is never
--     counted as a landlord or tenant (#1066).
--   CREATE TABLE public.resident_role_groups
--     One row for each group: slug, name, description, roles (resident_role[]), sort_order.
--     A new group is one INSERT, no migration. Seeded: landlords, non_resident_landlords,
--     owner_occupiers, tenants.
--   INSERT permission residents.view_groups, granted to every role that holds residents.view.
--   REVOKE all on the view and the table from PUBLIC, anon and authenticated. The app reads both
--   through the server action getResidentRoleCounts (service role).
--
-- WHY
--   Owner decision 2026-10-23 (#1093): a person with several roles counts in every role they hold.
--   Role counts for reporting were a hand-written query, and announcement groups (#1095) need one
--   place to read membership from. No snapshot table: the view is cheap and always current.
--
-- WHO IS AFFECTED
--   Nobody. New objects only. No existing table, policy or role loses access.
--
-- IDEMPOTENT: CREATE OR REPLACE VIEW, CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING.
--
-- DEPLOY ORDER: apply before the application code that calls getResidentRoleCounts.
--
-- ROLLBACK (roll the application code back first; role_permissions rows go with the permission by
-- ON DELETE CASCADE):
--   DROP VIEW IF EXISTS public.resident_role_memberships;
--   DROP TABLE IF EXISTS public.resident_role_groups;
--   DELETE FROM public.app_permissions WHERE name = 'residents.view_groups';
--
-- VERIFY (run on the database after applying; expected results in brackets):
--   SELECT slug, roles FROM public.resident_role_groups ORDER BY sort_order;      -- [4 rows]
--   SELECT role, count(*) FROM public.resident_role_memberships GROUP BY role;    -- [no error]
--   SELECT has_table_privilege('authenticated', 'public.resident_role_memberships', 'SELECT'),
--          has_table_privilege('anon', 'public.resident_role_groups', 'SELECT');  -- [false, false]
--   -- roles holding residents.view but not residents.view_groups [0 rows]
--   SELECT rp.role_id FROM public.role_permissions rp JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name = 'residents.view'
--   EXCEPT
--   SELECT rp.role_id FROM public.role_permissions rp JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name = 'residents.view_groups';

CREATE OR REPLACE VIEW public.resident_role_memberships
WITH (security_invoker = true) AS
SELECT
  rh.resident_id,
  rh.resident_role AS role,
  count(DISTINCT rh.house_id)::integer AS house_count,
  r.entity_type
FROM public.resident_houses rh
JOIN public.residents r ON r.id = rh.resident_id
WHERE rh.is_active
  AND (rh.move_out_date IS NULL OR rh.move_out_date > CURRENT_DATE)
GROUP BY rh.resident_id, rh.resident_role, r.entity_type;

CREATE TABLE IF NOT EXISTS public.resident_role_groups (
  slug        text PRIMARY KEY,
  name        text NOT NULL,
  description text,
  roles       public.resident_role[] NOT NULL CHECK (cardinality(roles) > 0),
  sort_order  integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- RLS on with no policies: only the service role reads it.
ALTER TABLE public.resident_role_groups ENABLE ROW LEVEL SECURITY;

INSERT INTO public.resident_role_groups (slug, name, description, roles, sort_order) VALUES
  ('landlords', 'Landlords', 'Resident landlords and non-resident landlords', ARRAY['resident_landlord', 'non_resident_landlord']::public.resident_role[], 10),
  ('non_resident_landlords', 'Non-Resident Landlords', 'Landlords who live elsewhere', ARRAY['non_resident_landlord']::public.resident_role[], 20),
  ('owner_occupiers', 'Owner-Occupiers', 'Landlords who live in their own house', ARRAY['resident_landlord']::public.resident_role[], 30),
  ('tenants', 'Tenants', 'Tenants', ARRAY['tenant']::public.resident_role[], 40)
ON CONFLICT (slug) DO NOTHING;

REVOKE ALL ON public.resident_role_memberships FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.resident_role_groups FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.resident_role_memberships TO service_role;
GRANT SELECT ON public.resident_role_groups TO service_role;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('residents.view_groups', 'View Resident Group Counts', 'Can see how many residents hold each role and belong to each resident group.', 'residents', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, grp.id
FROM public.role_permissions rp
JOIN public.app_permissions base ON base.id = rp.permission_id
CROSS JOIN public.app_permissions grp
WHERE base.name = 'residents.view'
  AND grp.name = 'residents.view_groups'
ON CONFLICT (role_id, permission_id) DO NOTHING;
