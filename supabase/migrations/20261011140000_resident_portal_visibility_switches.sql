-- Resident-portal visibility switches (#423, slice A).
--
-- Two controls decide whether resident-portal links ("My Portal", "Resident
-- Portal", "View as Resident") are shown in the admin dashboard:
--
--   1. system_settings.resident_portal_enabled -- the estate-wide switch.
--      Seeded off: the portal is not scheduled for rollout (CORE.md section 3).
--   2. profiles.portal_access_override -- a per-user override. NULL inherits
--      the estate-wide switch; 'enabled' / 'disabled' force it either way.
--      The rule is implemented in src/lib/auth/portal-visibility.ts.
--
-- Column privileges: 20261011120000_restrict_profiles_column_updates.sql
-- revoked table-level UPDATE on public.profiles from anon and authenticated
-- and granted back only the two theme columns. A newly added column is
-- therefore NOT writable by either API role, so a user cannot set their own
-- override through the Data API. This migration deliberately grants nothing:
-- the override is written only by setPortalAccessOverride
-- (src/actions/settings/resident-portal.ts) through the service-role client.
--
-- Rollback:
--   ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_portal_access_override_check;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS portal_access_override;
--   DELETE FROM public.system_settings WHERE key = 'resident_portal_enabled';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS portal_access_override text NULL;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_portal_access_override_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_portal_access_override_check
  CHECK (portal_access_override IS NULL OR portal_access_override IN ('enabled', 'disabled'));

COMMENT ON COLUMN public.profiles.portal_access_override IS
  'Per-user override for resident-portal link visibility in the admin dashboard: '
  'NULL inherits system_settings.resident_portal_enabled; ''enabled'' or ''disabled'' overrides it. '
  'Admin-only: not granted to anon or authenticated (#423).';

INSERT INTO public.system_settings (key, value, description, category)
VALUES (
  'resident_portal_enabled',
  'false'::jsonb,
  'Estate-wide switch: show resident-portal links in the admin dashboard. Per-user overrides live on profiles.portal_access_override.',
  'general'
)
ON CONFLICT (key) DO NOTHING;
