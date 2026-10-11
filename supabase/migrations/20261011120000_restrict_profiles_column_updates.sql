-- Limit what a signed-in user can change on their own profiles row.
--
-- The "Users can update own profile" RLS policy selects rows (auth.uid() = id)
-- but RLS cannot restrict columns, and the table-level UPDATE grant covered
-- every column. A user could therefore set their own role_id, approval_status,
-- resident_id, impersonation_enabled or two-factor fields directly through the
-- Data API. Verified on Residio_Stage inside a rolled-back transaction: a
-- financial_officer account set its own role_id to super_admin, and after
-- these statements every non-theme column raised insufficient_privilege.
--
-- Column privileges close that. The only session-client write to profiles in
-- the app is setUserThemeOverride (src/actions/settings/theme-preferences.ts),
-- which touches the two theme columns. Every other write goes through
-- createAdminClient (service_role), which these grants do not affect.
--
-- Columns added later are not granted by default, so they stay admin-only
-- unless a migration grants them explicitly.
--
-- anon never writes profiles, so it loses every write privilege. TRUNCATE
-- bypasses RLS, so neither API role keeps it. authenticated keeps INSERT and
-- DELETE: both are already limited to super_admin by RLS policies.
--
-- Rollback (restores the pre-migration grants exactly):
--   GRANT UPDATE, INSERT, DELETE, TRUNCATE ON public.profiles TO anon;
--   GRANT UPDATE, TRUNCATE ON public.profiles TO authenticated;

REVOKE UPDATE ON public.profiles FROM anon, authenticated;
REVOKE INSERT, DELETE ON public.profiles FROM anon;
REVOKE TRUNCATE ON public.profiles FROM anon, authenticated;

GRANT UPDATE (dashboard_theme_override, portal_theme_override)
  ON public.profiles TO authenticated;
