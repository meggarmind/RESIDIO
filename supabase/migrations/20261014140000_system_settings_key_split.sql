-- ============================================================================
-- Migration: split system_settings read access by key
-- ============================================================================
-- Issue #237 (closes it: system_settings was the last table awaiting an owner
-- decision). Owner decision 2026-10-14: "system_settings should require a
-- permission", with a key split.
--
-- Before: system_settings_select_policy was SELECT TO authenticated
-- USING (true), so every signed-in account (including a resident) could read
-- every row: billing, email, WhatsApp, security_* and access_code_* settings.
--
-- After: one SELECT policy, same name, replacing it entirely (it is the only
-- SELECT policy on the table, so it fully defines read access):
--   key = ANY (ARRAY[<public keys>]) OR public.has_permission('settings.view')
--
-- The INSERT / UPDATE / DELETE policies are NOT touched.
--
-- PUBLIC KEYS (readable by every signed-in user, because a resident, or the
-- middleware, reads them with the caller's own JWT) and why:
--   maintenance_mode, maintenance_message
--       src/middleware.ts reads maintenance_mode for every signed-in request;
--       the maintenance page shows the message.
--   resident_portal_enabled
--       src/lib/auth/portal-visibility-fetch.ts, via the auth provider's
--       browser client.
--   dashboard_theme, portal_theme
--       getEstateDefaultTheme reads both for every role.
--   estate_name, estate_logo_url, estate_address, estate_email, estate_phone,
--   estate_facebook_url, estate_instagram_url, estate_twitter_url,
--   estate_website_url
--       useGeneralSettings / useEstateLogo (portal sidebar, logo), receipts
--       and statements routes (estate_name), getEstateEmailSettings, and the
--       emergency contact directory.
--   security_gate_phone, estate_manager_phone, estate_manager_name
--       getEmergencyContactDirectory.
--   disable_ai_assistant, ai_assistant_greeting_enabled, assistant_name
--       src/contexts/ai-assistant-context.tsx reads the whole `general`
--       category for every role (assistant_name was found missing from the
--       issue's list during the reader inventory and added).
--
-- Everything else (billing, email, notifications, whatsapp, security_*,
-- access_code_*, system, and the remaining `general` keys such as
-- invoice_generation_day, auto_generate_invoices, import_requires_approval)
-- now requires settings.view. settings.view is seeded in
-- 20251222000000_create_rbac_system.sql (has_permission() returns false
-- silently for an unknown name, so this was verified).
--
-- WHO LOSES WHAT: `resident` loses every non-public key. Roles that keep full
-- read on Residio_Stage via settings.view: chairman, financial_officer,
-- project_manager, secretary, security_officer, super_admin, vice_chairman.
-- Server readers using the service-role client (cron, send paths) and the
-- SECURITY DEFINER theme functions are unaffected. The cron route on the anon
-- key already read nothing.
--
-- Idempotent: DROP POLICY IF EXISTS, then CREATE. No role-name comparisons.
--
-- ROLLBACK (restores exactly the live policy):
-- DROP POLICY IF EXISTS "system_settings_select_policy" ON public.system_settings;
-- CREATE POLICY "system_settings_select_policy"
--   ON public.system_settings FOR SELECT TO authenticated
--   USING (true);
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "system_settings_select_policy" ON public.system_settings;
CREATE POLICY "system_settings_select_policy"
  ON public.system_settings FOR SELECT TO authenticated
  USING (key = ANY (ARRAY['maintenance_mode', 'maintenance_message', 'resident_portal_enabled', 'dashboard_theme', 'portal_theme', 'estate_name', 'estate_logo_url', 'estate_address', 'estate_email', 'estate_phone', 'estate_facebook_url', 'estate_instagram_url', 'estate_twitter_url', 'estate_website_url', 'security_gate_phone', 'estate_manager_phone', 'estate_manager_name', 'disable_ai_assistant', 'ai_assistant_greeting_enabled', 'assistant_name']) OR public.has_permission('settings.view'));

COMMIT;
