-- Removing the PUBLIC grant is required because anon inherits PUBLIC
-- privileges even after an explicit revoke from anon.
REVOKE EXECUTE ON FUNCTION public.generate_access_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.generate_resident_code() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_dashboard_theme(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_portal_theme(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_effective_setting(text, uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_frequent_visitors(integer, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_primary_occupier(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_setting_overrides(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_visitor_history_summary(uuid, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_security_permission(text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_role_assignment_allowed(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.process_expired_approvals() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.record_ownership_history(uuid, uuid, public.resident_role, text, public.resident_role, date, text, boolean, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.requires_approval_for_action(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_house_occupancy() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.update_petty_cash_balance() FROM PUBLIC, anon;
