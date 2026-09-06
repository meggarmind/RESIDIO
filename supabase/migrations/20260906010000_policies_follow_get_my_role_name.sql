-- ============================================================================
-- Migration: 97 RLS policies across 36 tables follow get_my_role_name(),
--            not the legacy-enum get_my_role()
-- ============================================================================
-- Purpose: Issue #190 (epic #182). These 97 policies are NOT broken. They
--          already resolve through profiles.role_id -> app_roles.name, because
--          get_my_role() stopped reading profiles.role. They speak the legacy
--          vocabulary only because get_my_role() maps that resolved name back
--          onto the user_role enum. They must change because #194 drops that
--          enum, which is get_my_role()'s return type.
--
--          Every statement below is ALTER POLICY, deliberately, NOT
--          DROP + CREATE POLICY. Of these 97 policies, 60 are TO
--          {authenticated} and 37 are TO {public}; a recreate that assumed one
--          would silently change who 37 policies apply to. That exact mistake
--          was made earlier in this epic -- #186 recreated policies assuming
--          authenticated when nine of fourteen were public. ALTER POLICY
--          changes only the expression: command and roles are untouched and
--          cannot be got wrong.
--
--          The source of truth for every predicate below is
--          docs/validation/get-my-role-policies.json -- pg_policies as
--          captured from the live cloud database on 2026-09-06. It is NOT
--          derived from the migration files that created these policies, which
--          have been superseded.
--
-- THE HAZARD (ADR-0007, hazard 1): get_my_role() collapses distinct RBAC
-- roles into shared legacy buckets --
--
--     super_admin        -> 'admin'
--     chairman           -> 'chairman'
--     vice_chairman      -> 'chairman'            <-- the collapse
--     financial_officer  -> 'financial_secretary'
--     security_officer   -> 'security_officer'
--     project_manager / secretary / resident -> NULL
--
-- so get_my_role() IN ('admin','chairman') admits FOUR RBAC roles, not two.
-- Renaming the literals to ('super_admin','chairman') would silently revoke
-- every vice_chairman across 36 tables and leave a perfectly well-formed
-- policy behind -- no type check, no structural test and no reading of the
-- diff catches it. Every rewrite below therefore EXPANDS the bucket:
--
--     'admin'               -> 'super_admin'
--     'chairman'            -> 'chairman', 'vice_chairman'
--     'financial_secretary' -> 'financial_officer'
--     'security_officer'    -> 'security_officer'
--
-- vice_chairman has zero holders today, so a bucket collapse would revoke
-- access nobody currently exercises and would pass every functional check.
-- The expansion is asserted instead by
-- src/__tests__/get-my-role-name-policies.test.ts and by the #185 role-access
-- matrix diff.
--
-- All 97 policies compare against exactly five distinct literal sets
-- (measured, complete -- 45 + 29 + 14 + 7 + 2 = 97):
--
--   45  admin, chairman, financial_secretary
--         -> super_admin, chairman, vice_chairman, financial_officer
--   29  admin, chairman
--         -> super_admin, chairman, vice_chairman
--   14  admin
--         -> super_admin
--    7  admin, chairman, financial_secretary, security_officer
--         -> super_admin, chairman, vice_chairman, financial_officer, security_officer
--    2  security_officer
--         -> security_officer
--
-- Predicate shapes: 81 use = ANY (ARRAY[...]), 16 use = '<literal>'. None
-- uses IS NULL or IS NOT NULL, so the inverse hazard -- get_my_role() returns
-- NULL for a custom-role holder where get_my_role_name() returns that role's
-- name, which would WIDEN an IS NOT NULL test -- does not arise here. All 16
-- equality-shaped policies compare against a legacy literal that maps
-- one-to-one ('admin' -> 'super_admin', 'security_officer' ->
-- 'security_officer'), so they stay equality comparisons.
--
-- Clause coverage: 67 policies have USING only, 23 have WITH CHECK only, and
-- 7 have both. Each ALTER POLICY below alters exactly the clauses that policy
-- actually has -- a policy with no USING clause does not get one invented.
--
-- get_my_role_name() returns text (verified in
-- docs/validation/get-my-role-name.capture.json, issue #189), hence the
-- ::text casts replacing ::user_role.
--
-- No access change is intended by this migration. Every policy admits exactly
-- the same set of RBAC roles after it as before it.
-- ============================================================================

-- ============================================================================
-- ROLLBACK: restores all 97 predicates to their pre-migration text verbatim,
--           as captured from pg_policies on 2026-09-06. Valid only
--           while the user_role enum and get_my_role() still exist, i.e.
--           before #194 drops them.
-- ============================================================================
--
-- BEGIN;
--
-- -- access_codes
-- ALTER POLICY "access_codes_delete_policy" ON public.access_codes
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "access_codes_insert_policy" ON public.access_codes
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "access_codes_select_policy" ON public.access_codes
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])));
--
-- ALTER POLICY "access_codes_update_policy" ON public.access_codes
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])));
--
-- -- access_logs
-- ALTER POLICY "access_logs_delete_policy" ON public.access_logs
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "access_logs_insert_policy" ON public.access_logs
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])));
--
-- ALTER POLICY "access_logs_select_policy" ON public.access_logs
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])));
--
-- ALTER POLICY "access_logs_update_policy" ON public.access_logs
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])));
--
-- -- approval_requests
-- ALTER POLICY "Admin and chairman can update approval requests" ON public.approval_requests
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admins and chairmen can update approval requests" ON public.approval_requests
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admins and chairmen can view all approval requests" ON public.approval_requests
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Financial secretary can create approval requests" ON public.approval_requests
--   WITH CHECK (((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])) AND (requested_by = auth.uid())));
--
-- -- bank_statement_imports
-- ALTER POLICY "Admin, Chairman, Financial Secretary can manage imports" ON public.bank_statement_imports
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- bank_statement_rows
-- ALTER POLICY "Admin, Chairman, Financial Secretary can manage import rows" ON public.bank_statement_rows
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- billing_items
-- ALTER POLICY "Admins chairmen fin sec can manage billing items" ON public.billing_items
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- billing_profiles
-- ALTER POLICY "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- email_logs
-- ALTER POLICY "Admins can view email logs" ON public.email_logs
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- escalation_states
-- ALTER POLICY "escalation_states_delete" ON public.escalation_states
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "escalation_states_insert" ON public.escalation_states
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "escalation_states_select" ON public.escalation_states
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "escalation_states_update" ON public.escalation_states
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])))
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- estate_bank_accounts
-- ALTER POLICY "Admin can manage bank accounts" ON public.estate_bank_accounts
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "Admins chairmen fin sec can manage bank accounts" ON public.estate_bank_accounts
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "All authenticated can view active bank accounts" ON public.estate_bank_accounts
--   USING (((is_active = true) OR (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role]))));
--
-- -- hierarchical_settings
-- ALTER POLICY "hierarchical_settings_admin_all" ON public.hierarchical_settings
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- -- house_levy_history
-- ALTER POLICY "house_levy_history_delete_policy" ON public.house_levy_history
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "house_levy_history_insert_policy" ON public.house_levy_history
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "house_levy_history_update_policy" ON public.house_levy_history
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- house_ownership_history
-- ALTER POLICY "Authorized users can insert ownership history" ON public.house_ownership_history
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Only admins can update ownership history" ON public.house_ownership_history
--   USING ((get_my_role() = 'admin'::user_role))
--   WITH CHECK ((get_my_role() = 'admin'::user_role));
--
-- -- house_types
-- ALTER POLICY "Admins and chairmen can delete house types" ON public.house_types
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admins and chairmen can insert house types" ON public.house_types
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admins and chairmen can update house types" ON public.house_types
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "All authenticated users can view active house types" ON public.house_types
--   USING (((is_active = true) OR (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role]))));
--
-- -- houses
-- ALTER POLICY "Admins chairmen and fin sec can delete houses" ON public.houses
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Admins chairmen and fin sec can insert houses" ON public.houses
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Admins chairmen and fin sec can update houses" ON public.houses
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "All authenticated users can view active houses" ON public.houses
--   USING (((is_active = true) OR (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role]))));
--
-- -- invoice_items
-- ALTER POLICY "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- invoices
-- ALTER POLICY "Admins chairmen fin sec can manage all invoices" ON public.invoices
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- notification_history
-- ALTER POLICY "notification_history_select" ON public.notification_history
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- notification_preferences
-- ALTER POLICY "notification_preferences_delete" ON public.notification_preferences
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "notification_preferences_insert" ON public.notification_preferences
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "notification_preferences_update" ON public.notification_preferences
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])))
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- notification_queue
-- ALTER POLICY "notification_queue_delete" ON public.notification_queue
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "notification_queue_insert" ON public.notification_queue
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "notification_queue_select" ON public.notification_queue
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "notification_queue_update" ON public.notification_queue
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- -- notification_schedules
-- ALTER POLICY "notification_schedules_delete" ON public.notification_schedules
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "notification_schedules_insert" ON public.notification_schedules
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "notification_schedules_update" ON public.notification_schedules
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- -- notification_templates
-- ALTER POLICY "notification_templates_delete" ON public.notification_templates
--   USING (((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])) AND (is_system = false)));
--
-- ALTER POLICY "notification_templates_insert" ON public.notification_templates
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "notification_templates_update" ON public.notification_templates
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- -- profiles
-- ALTER POLICY "Admins and chairmen can view all profiles" ON public.profiles
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admins can delete profiles" ON public.profiles
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "Admins can insert profiles" ON public.profiles
--   WITH CHECK ((get_my_role() = 'admin'::user_role));
--
-- -- property_transition_requests
-- ALTER POLICY "House managers can create property transition requests" ON public.property_transition_requests
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "House managers can view property transition requests" ON public.property_transition_requests
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- resident_houses
-- ALTER POLICY "Admins chairmen fin sec can delete resident houses" ON public.resident_houses
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Admins chairmen fin sec can insert resident houses" ON public.resident_houses
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Admins chairmen fin sec can update resident houses" ON public.resident_houses
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Security officers can view active resident houses" ON public.resident_houses
--   USING (((get_my_role() = 'security_officer'::user_role) AND (is_active = true)));
--
-- -- resident_payment_aliases
-- ALTER POLICY "Admin, Chairman, Financial Secretary can manage aliases" ON public.resident_payment_aliases
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- resident_wallets
-- ALTER POLICY "Admins chairmen fin sec can manage wallets" ON public.resident_wallets
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- residents
-- ALTER POLICY "Admins chairmen fin sec can insert residents" ON public.residents
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Admins chairmen fin sec can update residents" ON public.residents
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Only admins can delete residents" ON public.residents
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "Security officers can view active residents" ON public.residents
--   USING (((get_my_role() = 'security_officer'::user_role) AND (account_status = 'active'::account_status)));
--
-- -- security_contact_categories
-- ALTER POLICY "security_contact_categories_delete_policy" ON public.security_contact_categories
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "security_contact_categories_insert_policy" ON public.security_contact_categories
--   WITH CHECK ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "security_contact_categories_update_policy" ON public.security_contact_categories
--   USING ((get_my_role() = 'admin'::user_role));
--
-- -- security_contacts
-- ALTER POLICY "security_contacts_delete_policy" ON public.security_contacts
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "security_contacts_insert_policy" ON public.security_contacts
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "security_contacts_select_policy" ON public.security_contacts
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])));
--
-- ALTER POLICY "security_contacts_update_policy" ON public.security_contacts
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- streets
-- ALTER POLICY "Admins and chairmen can delete streets" ON public.streets
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admins and chairmen can insert streets" ON public.streets
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "Admins and chairmen can update streets" ON public.streets
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "All authenticated users can view active streets" ON public.streets
--   USING (((is_active = true) OR (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role]))));
--
-- -- system_settings
-- ALTER POLICY "system_settings_delete_policy" ON public.system_settings
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "system_settings_insert_policy" ON public.system_settings
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "system_settings_update_policy" ON public.system_settings
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- -- transaction_tags
-- ALTER POLICY "Authenticated users can view transaction tags" ON public.transaction_tags
--   USING (((is_active = true) OR (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role]))));
--
-- ALTER POLICY "Only admin can create transaction tags" ON public.transaction_tags
--   WITH CHECK ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "Only admin can delete transaction tags" ON public.transaction_tags
--   USING ((get_my_role() = 'admin'::user_role));
--
-- ALTER POLICY "Only admin can update transaction tags" ON public.transaction_tags
--   USING ((get_my_role() = 'admin'::user_role));
--
-- -- visitor_vehicles
-- ALTER POLICY "visitor_vehicles_delete_policy" ON public.visitor_vehicles
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])));
--
-- ALTER POLICY "visitor_vehicles_insert_policy" ON public.visitor_vehicles
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "visitor_vehicles_select_policy" ON public.visitor_vehicles
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])));
--
-- ALTER POLICY "visitor_vehicles_update_policy" ON public.visitor_vehicles
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- wallet_settlement_requests
-- ALTER POLICY "Finance can create wallet settlement requests" ON public.wallet_settlement_requests
--   WITH CHECK ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- ALTER POLICY "Finance can view wallet settlement requests" ON public.wallet_settlement_requests
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- -- wallet_transactions
-- ALTER POLICY "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions
--   USING ((get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])));
--
-- COMMIT;
--
-- ============================================================================

BEGIN;

-- access_codes
ALTER POLICY "access_codes_delete_policy" ON public.access_codes
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "access_codes_insert_policy" ON public.access_codes
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "access_codes_select_policy" ON public.access_codes
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text])));

ALTER POLICY "access_codes_update_policy" ON public.access_codes
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text])));

-- access_logs
ALTER POLICY "access_logs_delete_policy" ON public.access_logs
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "access_logs_insert_policy" ON public.access_logs
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text])));

ALTER POLICY "access_logs_select_policy" ON public.access_logs
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text])));

ALTER POLICY "access_logs_update_policy" ON public.access_logs
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text])));

-- approval_requests
ALTER POLICY "Admin and chairman can update approval requests" ON public.approval_requests
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])))
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admins and chairmen can update approval requests" ON public.approval_requests
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admins and chairmen can view all approval requests" ON public.approval_requests
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Financial secretary can create approval requests" ON public.approval_requests
  WITH CHECK (((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])) AND (requested_by = auth.uid())));

-- bank_statement_imports
ALTER POLICY "Admin, Chairman, Financial Secretary can manage imports" ON public.bank_statement_imports
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- bank_statement_rows
ALTER POLICY "Admin, Chairman, Financial Secretary can manage import rows" ON public.bank_statement_rows
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- billing_items
ALTER POLICY "Admins chairmen fin sec can manage billing items" ON public.billing_items
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- billing_profiles
ALTER POLICY "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- email_logs
ALTER POLICY "Admins can view email logs" ON public.email_logs
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- escalation_states
ALTER POLICY "escalation_states_delete" ON public.escalation_states
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "escalation_states_insert" ON public.escalation_states
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "escalation_states_select" ON public.escalation_states
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "escalation_states_update" ON public.escalation_states
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])))
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- estate_bank_accounts
ALTER POLICY "Admin can manage bank accounts" ON public.estate_bank_accounts
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "Admins chairmen fin sec can manage bank accounts" ON public.estate_bank_accounts
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "All authenticated can view active bank accounts" ON public.estate_bank_accounts
  USING (((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))));

-- hierarchical_settings
ALTER POLICY "hierarchical_settings_admin_all" ON public.hierarchical_settings
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

-- house_levy_history
ALTER POLICY "house_levy_history_delete_policy" ON public.house_levy_history
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "house_levy_history_insert_policy" ON public.house_levy_history
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "house_levy_history_update_policy" ON public.house_levy_history
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- house_ownership_history
ALTER POLICY "Authorized users can insert ownership history" ON public.house_ownership_history
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Only admins can update ownership history" ON public.house_ownership_history
  USING ((get_my_role_name() = 'super_admin'::text))
  WITH CHECK ((get_my_role_name() = 'super_admin'::text));

-- house_types
ALTER POLICY "Admins and chairmen can delete house types" ON public.house_types
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admins and chairmen can insert house types" ON public.house_types
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admins and chairmen can update house types" ON public.house_types
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "All authenticated users can view active house types" ON public.house_types
  USING (((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))));

-- houses
ALTER POLICY "Admins chairmen and fin sec can delete houses" ON public.houses
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Admins chairmen and fin sec can insert houses" ON public.houses
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Admins chairmen and fin sec can update houses" ON public.houses
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "All authenticated users can view active houses" ON public.houses
  USING (((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))));

-- invoice_items
ALTER POLICY "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- invoices
ALTER POLICY "Admins chairmen fin sec can manage all invoices" ON public.invoices
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- notification_history
ALTER POLICY "notification_history_select" ON public.notification_history
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- notification_preferences
ALTER POLICY "notification_preferences_delete" ON public.notification_preferences
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "notification_preferences_insert" ON public.notification_preferences
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "notification_preferences_update" ON public.notification_preferences
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])))
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- notification_queue
ALTER POLICY "notification_queue_delete" ON public.notification_queue
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "notification_queue_insert" ON public.notification_queue
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "notification_queue_select" ON public.notification_queue
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "notification_queue_update" ON public.notification_queue
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])))
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

-- notification_schedules
ALTER POLICY "notification_schedules_delete" ON public.notification_schedules
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "notification_schedules_insert" ON public.notification_schedules
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "notification_schedules_update" ON public.notification_schedules
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])))
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

-- notification_templates
ALTER POLICY "notification_templates_delete" ON public.notification_templates
  USING (((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])) AND (is_system = false)));

ALTER POLICY "notification_templates_insert" ON public.notification_templates
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "notification_templates_update" ON public.notification_templates
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])))
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

-- profiles
ALTER POLICY "Admins and chairmen can view all profiles" ON public.profiles
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admins can delete profiles" ON public.profiles
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "Admins can insert profiles" ON public.profiles
  WITH CHECK ((get_my_role_name() = 'super_admin'::text));

-- property_transition_requests
ALTER POLICY "House managers can create property transition requests" ON public.property_transition_requests
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "House managers can view property transition requests" ON public.property_transition_requests
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- resident_houses
ALTER POLICY "Admins chairmen fin sec can delete resident houses" ON public.resident_houses
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Admins chairmen fin sec can insert resident houses" ON public.resident_houses
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Admins chairmen fin sec can update resident houses" ON public.resident_houses
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Security officers can view active resident houses" ON public.resident_houses
  USING (((get_my_role_name() = 'security_officer'::text) AND (is_active = true)));

-- resident_payment_aliases
ALTER POLICY "Admin, Chairman, Financial Secretary can manage aliases" ON public.resident_payment_aliases
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- resident_wallets
ALTER POLICY "Admins chairmen fin sec can manage wallets" ON public.resident_wallets
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- residents
ALTER POLICY "Admins chairmen fin sec can insert residents" ON public.residents
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Admins chairmen fin sec can update residents" ON public.residents
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Only admins can delete residents" ON public.residents
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "Security officers can view active residents" ON public.residents
  USING (((get_my_role_name() = 'security_officer'::text) AND (account_status = 'active'::account_status)));

-- security_contact_categories
ALTER POLICY "security_contact_categories_delete_policy" ON public.security_contact_categories
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "security_contact_categories_insert_policy" ON public.security_contact_categories
  WITH CHECK ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "security_contact_categories_update_policy" ON public.security_contact_categories
  USING ((get_my_role_name() = 'super_admin'::text));

-- security_contacts
ALTER POLICY "security_contacts_delete_policy" ON public.security_contacts
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "security_contacts_insert_policy" ON public.security_contacts
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "security_contacts_select_policy" ON public.security_contacts
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text])));

ALTER POLICY "security_contacts_update_policy" ON public.security_contacts
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- streets
ALTER POLICY "Admins and chairmen can delete streets" ON public.streets
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admins and chairmen can insert streets" ON public.streets
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "Admins and chairmen can update streets" ON public.streets
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "All authenticated users can view active streets" ON public.streets
  USING (((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))));

-- system_settings
ALTER POLICY "system_settings_delete_policy" ON public.system_settings
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "system_settings_insert_policy" ON public.system_settings
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "system_settings_update_policy" ON public.system_settings
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

-- transaction_tags
ALTER POLICY "Authenticated users can view transaction tags" ON public.transaction_tags
  USING (((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))));

ALTER POLICY "Only admin can create transaction tags" ON public.transaction_tags
  WITH CHECK ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "Only admin can delete transaction tags" ON public.transaction_tags
  USING ((get_my_role_name() = 'super_admin'::text));

ALTER POLICY "Only admin can update transaction tags" ON public.transaction_tags
  USING ((get_my_role_name() = 'super_admin'::text));

-- visitor_vehicles
ALTER POLICY "visitor_vehicles_delete_policy" ON public.visitor_vehicles
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])));

ALTER POLICY "visitor_vehicles_insert_policy" ON public.visitor_vehicles
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "visitor_vehicles_select_policy" ON public.visitor_vehicles
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text])));

ALTER POLICY "visitor_vehicles_update_policy" ON public.visitor_vehicles
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- wallet_settlement_requests
ALTER POLICY "Finance can create wallet settlement requests" ON public.wallet_settlement_requests
  WITH CHECK ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

ALTER POLICY "Finance can view wallet settlement requests" ON public.wallet_settlement_requests
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

-- wallet_transactions
ALTER POLICY "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions
  USING ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])));

COMMIT;
