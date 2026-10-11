-- Limit what a signed-in user can change on their own profiles row.
--
-- The "Users can update own profile" RLS policy selects rows (auth.uid() = id)
-- but RLS cannot restrict columns, and the table-level UPDATE grant covered
-- every column. A user could therefore set their own role_id, approval_status,
-- resident_id, impersonation_enabled or two-factor fields directly through the
-- Data API.
--
-- Column privileges close that. The only session-client write to profiles in
-- the app is setUserThemeOverride (src/actions/settings/theme-preferences.ts),
-- which touches the two theme columns. Every other write goes through
-- createAdminClient (service_role), which these grants do not affect.
--
-- Columns added later are not granted by default, so they stay admin-only
-- unless a migration grants them explicitly.

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (dashboard_theme_override, portal_theme_override)
  ON public.profiles TO authenticated;
