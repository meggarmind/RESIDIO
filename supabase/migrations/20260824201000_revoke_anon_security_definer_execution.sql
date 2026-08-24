-- Security-definer functions are not anonymous RPC endpoints. Keep the
-- authenticated grants required by RLS and existing application workflows.
REVOKE EXECUTE ON FUNCTION public.generate_access_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_resident_code() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_dashboard_theme(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_portal_theme(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_setting(text, uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_frequent_visitors(integer, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_primary_occupier(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_setting_overrides(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_visitor_history_summary(uuid, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_security_permission(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_role_assignment_allowed(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.process_expired_approvals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_ownership_history(uuid, uuid, public.resident_role, text, public.resident_role, date, text, boolean, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.requires_approval_for_action(uuid, uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_house_occupancy() FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_petty_cash_balance() FROM anon;
