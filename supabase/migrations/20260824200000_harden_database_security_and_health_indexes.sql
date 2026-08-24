-- Harden exposed views and the security-definer helpers used by RLS.
-- The view changes preserve authenticated access while making underlying RLS
-- policies apply to the caller instead of the view owner.
BEGIN;

ALTER VIEW public.security_settings_view SET (security_invoker = true);
ALTER VIEW public.visitor_analytics SET (security_invoker = true);

REVOKE SELECT ON public.security_settings_view, public.visitor_analytics FROM PUBLIC, anon;
GRANT SELECT ON public.security_settings_view, public.visitor_analytics TO authenticated, service_role;

-- These helpers are callable from RLS policies, but must not be anonymously
-- callable security-definer entry points or depend on a mutable default path.
ALTER FUNCTION public.get_my_house_ids() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_my_permissions() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_my_resident_id() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_my_role() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_my_role_name() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.has_permission(text) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.import_legacy_financial_batch(jsonb) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.is_resident() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.is_super_admin() SET search_path = public, auth, extensions, pg_temp;

REVOKE EXECUTE ON FUNCTION public.get_my_house_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_permissions() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_resident_id() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_my_role_name() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.import_legacy_financial_batch(jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_resident() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_super_admin() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_my_house_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_resident_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_role_name() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.import_legacy_financial_batch(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_resident() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_super_admin() TO authenticated, service_role;

-- Admin WhatsApp health reads filter by these timestamp columns. The live
-- plans showed a sequential scan for received_at and post-filtering for the
-- notification channel/status indexes.
CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_messages_received_at
  ON public.whatsapp_processed_messages (received_at);
CREATE INDEX IF NOT EXISTS idx_notification_history_whatsapp_health
  ON public.notification_history (channel, status, sent_at);
CREATE INDEX IF NOT EXISTS idx_notification_queue_whatsapp_health
  ON public.notification_queue (channel, status, created_at);

COMMIT;
