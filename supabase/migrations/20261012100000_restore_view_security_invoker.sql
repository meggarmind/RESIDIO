-- #450: Residio_Prod was built from the schema baseline, which dropped the
-- security_invoker reloption on two views that 20260824200000 had set. Without
-- it the views run as their owner and bypass the caller's RLS.
--
-- Idempotent. Residio_Stage already has the option, so this is a no-op there.
--
-- Rollback:
--   ALTER VIEW public.security_settings_view RESET (security_invoker);
--   ALTER VIEW public.visitor_analytics RESET (security_invoker);

ALTER VIEW public.security_settings_view SET (security_invoker = true);
ALTER VIEW public.visitor_analytics SET (security_invoker = true);
