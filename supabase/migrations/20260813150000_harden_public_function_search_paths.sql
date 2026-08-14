-- Harden public PL/pgSQL functions against search_path shadowing.
-- The listed functions are the application functions reported by the
-- Supabase security advisor. pg_trgm's C support functions are intentionally
-- excluded because their extension-managed lookup contract is different.

ALTER FUNCTION public.calculate_visit_duration() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.end_previous_impersonation_sessions() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.generate_access_code() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.generate_house_shortname(uuid, text) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.generate_resident_code() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_effective_dashboard_theme(uuid) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_effective_portal_theme(uuid) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_effective_setting(text, uuid, uuid) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_frequent_visitors(integer, integer, integer) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_primary_occupier(uuid) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_setting_overrides(text) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.get_visitor_history_summary(uuid, integer) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.handle_house_shortname() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.handle_new_user() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.handle_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.has_security_permission(text) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.increment_access_code_usage() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.is_role_assignment_allowed(uuid, uuid) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.process_expired_approvals() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.record_ownership_history(uuid, uuid, resident_role, text, resident_role, date, text, boolean, uuid) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.requires_approval_for_action(uuid, uuid, text) SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.set_access_code() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.set_resident_code() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_ai_settings_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_document_categories_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_documents_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_house_occupancy() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_impersonation_sessions_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_late_fee_waiver_timestamp() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_notification_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_paystack_transactions_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_petty_cash_balance() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_report_schedules_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_security_contact_categories_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_security_contacts_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_system_settings_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_two_factor_policies_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_visitor_statistics() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.update_visitor_vehicles_updated_at() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.validate_corporate_role() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.validate_residency_exclusivity() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.validate_sponsor_requirement() SET search_path = public, auth, extensions, pg_temp;
ALTER FUNCTION public.validate_unit_occupancy_state() SET search_path = public, auth, extensions, pg_temp;
