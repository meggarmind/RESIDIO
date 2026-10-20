-- #63: hoist RLS helper calls to once-per-statement InitPlans, and replace the role-name
-- literals that have an exact same-domain permission with has_permission()
--
-- Postgres re-evaluates a bare function call in a policy for every row. Wrapping each RLS helper
-- call as (select helper(...)) turns it into an InitPlan evaluated once per statement, the same
-- rewrite 20261014170500_wrap_auth_calls_in_rls_policies.sql made for auth.uid().
--
-- THIS CHANGES NO ACCESS. Scope is 134 policies on 77 tables, Residio_Stage capture 2026-10-20:
--
-- * 105 wrap-only policies. Every call to has_permission('...'), get_my_resident_id(),
--   is_super_admin(), is_approved() and is_resident() becomes (select <call>). Nothing else in
--   any expression changes. All of these helpers are scalar, STABLE, and take no argument or a
--   constant, so the wrapped call returns exactly what the bare call did.
-- * 29 policies that compared get_my_role_name() with role-name literals. That comparison
--   becomes (select has_permission('<permission>')), choosing for each a permission in the
--   policy's own domain whose role set equals the literal set exactly, checked on both
--   Residio_Stage and Residio_Prod. Both helpers require profiles.approval_status = 'active'.
--   has_permission() also requires app_permissions.is_active, which every permission is.
--
-- LEFT OUT, deliberately:
-- * The other 62 policies that compare get_my_role_name() with literals. No same-domain
--   permission has their exact role set, so rewriting them needs an owner decision.
-- * public.documents "Users can view documents based on permissions" (app_roles.name literal).
--   It also needs an owner decision.
-- * public.resident_houses "Residents can view housemates house assignments". It calls only
--   get_my_house_ids(), which is set-returning and is already inside IN (SELECT ...), so it
--   has nothing to hoist.
--
-- RELEASE ORDER: 4 of the wrap-only policies' tables (document_custom_fields,
-- document_custom_field_values, document_tags, document_tag_assignments) are created by
-- 20261018140000_document_taxonomy.sql, which is on stage but not yet on master. This file
-- sorts after it, so a release that carries both applies them in order.
--
-- Verified by src/__tests__/rls-helper-initplan-policies.test.ts against a fixture of the live
-- definitions (src/__tests__/fixtures/rls-helper-initplan-policies.json): every ALTER equals
-- the original with only the stated substitutions, and the rollback restores every original
-- verbatim. ALTER POLICY keeps each policy's command, roles and permissive/restrictive flag.
--
-- VERIFY (after applying; expected results in brackets):
--
--   -- unwrapped scalar helper calls outside the 62 owner-call policies [0]
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--     AND (coalesce(qual, '') || ' ' || coalesce(with_check, ''))
--       ~ '(?<!SELECT )(?<![A-Za-z_.])(has_permission|get_my_resident_id|is_super_admin|is_approved|is_resident)\('
--     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ 'get_my_role_name\(\)';
--   -- literal role comparisons left: the 62 owner-call policies [62]
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'get_my_role_name\(\)';
--
-- ROLLBACK (run as one transaction; each statement restores the original text verbatim):
--
-- BEGIN;
--
-- ALTER POLICY "Residents can view own access codes" ON public.access_codes
--   USING (
-- (contact_id IN ( SELECT security_contacts.id
--    FROM security_contacts
--   WHERE (security_contacts.resident_id = get_my_resident_id())))
--   );
--
-- ALTER POLICY "access_codes_delete_policy" ON public.access_codes
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "access_logs_delete_policy" ON public.access_logs
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "Approved accounts only can read" ON public.ai_settings
--   USING (
-- is_approved()
--   );
--
-- ALTER POLICY "announcement_categories_admin_all" ON public.announcement_categories
--   USING (
-- has_permission('announcements.manage_categories'::text)
--   )
--   WITH CHECK (
-- has_permission('announcements.manage_categories'::text)
--   );
--
-- ALTER POLICY "read_receipts_admin_select" ON public.announcement_read_receipts
--   USING (
-- has_permission('announcements.publish'::text)
--   );
--
-- ALTER POLICY "announcements_admin_delete" ON public.announcements
--   USING (
-- has_permission('announcements.delete'::text)
--   );
--
-- ALTER POLICY "announcements_admin_insert" ON public.announcements
--   WITH CHECK (
-- has_permission('announcements.create'::text)
--   );
--
-- ALTER POLICY "announcements_admin_select" ON public.announcements
--   USING (
-- has_permission('announcements.view'::text)
--   );
--
-- ALTER POLICY "announcements_admin_update" ON public.announcements
--   USING (
-- has_permission('announcements.update'::text)
--   )
--   WITH CHECK (
-- has_permission('announcements.update'::text)
--   );
--
-- ALTER POLICY "Allow delete for role managers" ON public.app_roles
--   USING (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   );
--
-- ALTER POLICY "Allow insert for role managers" ON public.app_roles
--   WITH CHECK (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   );
--
-- ALTER POLICY "Allow update for role managers" ON public.app_roles
--   USING (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   )
--   WITH CHECK (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   );
--
-- ALTER POLICY "Admin and chairman can update approval requests" ON public.approval_requests
--   USING (
-- has_permission('approvals.approve_reject'::text)
--   )
--   WITH CHECK (
-- has_permission('approvals.approve_reject'::text)
--   );
--
-- ALTER POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
--   USING (
-- has_permission('approvals.view'::text)
--   );
--
-- ALTER POLICY "Users with settings.view_audit_logs can view audit logs" ON public.audit_logs
--   USING (
-- has_permission('settings.view_audit_logs'::text)
--   );
--
-- ALTER POLICY "Admin, Chairman, Financial Secretary can manage imports" ON public.bank_statement_imports
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admin, Chairman, Financial Secretary can manage import rows" ON public.bank_statement_rows
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Finance may read billing profile version items" ON public.billing_profile_version_items
--   USING (
-- has_permission('billing.manage_profiles'::text)
--   );
--
-- ALTER POLICY "Finance may read billing profile versions" ON public.billing_profile_versions
--   USING (
-- has_permission('billing.manage_profiles'::text)
--   );
--
-- ALTER POLICY "Manage Budgets - Authorized Roles" ON public.budgets
--   USING (
-- has_permission('manage_expenditure'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_expenditure'::text)
--   );
--
-- ALTER POLICY "View Budgets - Authorized Roles" ON public.budgets
--   USING (
-- has_permission('view_expenditure'::text)
--   );
--
-- ALTER POLICY "Editors can write custom field values" ON public.document_custom_field_values
--   USING (
-- (has_permission('documents.update'::text) AND (EXISTS ( SELECT 1
--    FROM documents d
--   WHERE (d.id = document_custom_field_values.document_id))))
--   )
--   WITH CHECK (
-- (has_permission('documents.update'::text) AND (EXISTS ( SELECT 1
--    FROM documents d
--   WHERE (d.id = document_custom_field_values.document_id))))
--   );
--
-- ALTER POLICY "Custom field managers can manage custom fields" ON public.document_custom_fields
--   USING (
-- has_permission('documents.manage_custom_fields'::text)
--   )
--   WITH CHECK (
-- has_permission('documents.manage_custom_fields'::text)
--   );
--
-- ALTER POLICY "Document viewers can view active custom fields" ON public.document_custom_fields
--   USING (
-- ((is_active = true) AND has_permission('documents.view'::text))
--   );
--
-- ALTER POLICY "Editors can remove tags" ON public.document_tag_assignments
--   USING (
-- (has_permission('documents.update'::text) AND (EXISTS ( SELECT 1
--    FROM documents d
--   WHERE (d.id = document_tag_assignments.document_id))))
--   );
--
-- ALTER POLICY "Uploaders and editors can assign tags" ON public.document_tag_assignments
--   WITH CHECK (
-- ((has_permission('documents.upload'::text) OR has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1
--    FROM documents d
--   WHERE (d.id = document_tag_assignments.document_id))))
--   );
--
-- ALTER POLICY "Document viewers can view active tags" ON public.document_tags
--   USING (
-- ((is_active = true) AND has_permission('documents.view'::text))
--   );
--
-- ALTER POLICY "Tag managers can manage tags" ON public.document_tags
--   USING (
-- has_permission('documents.manage_tags'::text)
--   )
--   WITH CHECK (
-- has_permission('documents.manage_tags'::text)
--   );
--
-- ALTER POLICY "Admin access for email imports" ON public.email_imports
--   USING (
-- has_permission('email_imports.view'::text)
--   )
--   WITH CHECK (
-- has_permission('email_imports.view'::text)
--   );
--
-- ALTER POLICY "Admin access for email messages" ON public.email_messages
--   USING (
-- has_permission('email_imports.view'::text)
--   )
--   WITH CHECK (
-- has_permission('email_imports.view'::text)
--   );
--
-- ALTER POLICY "Admin access for email transactions" ON public.email_transactions
--   USING (
-- has_permission('email_imports.view'::text)
--   )
--   WITH CHECK (
-- has_permission('email_imports.view'::text)
--   );
--
-- ALTER POLICY "escalation_states_delete" ON public.escalation_states
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Admin access for bank account passwords" ON public.estate_bank_account_passwords
--   USING (
-- has_permission('email_imports.manage_passwords'::text)
--   )
--   WITH CHECK (
-- has_permission('email_imports.manage_passwords'::text)
--   );
--
-- ALTER POLICY "Approved accounts only can read" ON public.estate_bank_accounts
--   USING (
-- is_approved()
--   );
--
-- ALTER POLICY "Manage Categories - Authorized Roles" ON public.expense_categories
--   USING (
-- has_permission('manage_expenditure'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_expenditure'::text)
--   );
--
-- ALTER POLICY "View Categories - Authorized Roles" ON public.expense_categories
--   USING (
-- has_permission('view_expenditure'::text)
--   );
--
-- ALTER POLICY "Manage Expenditure - Authorized Roles" ON public.expenses
--   USING (
-- has_permission('manage_expenditure'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_expenditure'::text)
--   );
--
-- ALTER POLICY "View Expenditure - Admins/Financial Secretary" ON public.expenses
--   USING (
-- has_permission('view_expenditure'::text)
--   );
--
-- ALTER POLICY "generated_reports_delete" ON public.generated_reports
--   USING (
-- has_permission('reports.manage_schedules'::text)
--   );
--
-- ALTER POLICY "generated_reports_insert" ON public.generated_reports
--   WITH CHECK (
-- has_permission('reports.view_financial'::text)
--   );
--
-- ALTER POLICY "generated_reports_select" ON public.generated_reports
--   USING (
-- has_permission('reports.view_financial'::text)
--   );
--
-- ALTER POLICY "Admin access for gmail oauth credentials" ON public.gmail_oauth_credentials
--   USING (
-- has_permission('email_imports.configure'::text)
--   )
--   WITH CHECK (
-- has_permission('email_imports.configure'::text)
--   );
--
-- ALTER POLICY "house_levy_history_delete_policy" ON public.house_levy_history
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "house_levy_history_insert_policy" ON public.house_levy_history
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "house_levy_history_select_policy" ON public.house_levy_history
--   USING (
-- (has_permission('billing.view'::text) OR has_permission('billing.create_invoice'::text) OR has_permission('houses.update'::text))
--   );
--
-- ALTER POLICY "house_levy_history_update_policy" ON public.house_levy_history
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Only admins can update ownership history" ON public.house_ownership_history
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   )
--   WITH CHECK (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "house_ownership_history_select" ON public.house_ownership_history
--   USING (
-- (has_permission('houses.view'::text) OR has_permission('houses.assign_resident'::text))
--   );
--
-- ALTER POLICY "Approved accounts only can read" ON public.house_types
--   USING (
-- is_approved()
--   );
--
-- ALTER POLICY "Approved accounts only can read" ON public.houses
--   USING (
-- is_approved()
--   );
--
-- ALTER POLICY "Residents can view assigned houses" ON public.houses
--   USING (
-- (id IN ( SELECT resident_houses.house_id
--    FROM resident_houses
--   WHERE ((resident_houses.resident_id = get_my_resident_id()) AND (resident_houses.is_active = true))))
--   );
--
-- ALTER POLICY "super_admin_read_all_impersonation_sessions" ON public.impersonation_sessions
--   USING (
-- has_permission('impersonation.view_sessions'::text)
--   );
--
-- ALTER POLICY "in_app_notifications_admin_insert" ON public.in_app_notifications
--   WITH CHECK (
-- has_permission('notifications.send'::text)
--   );
--
-- ALTER POLICY "Finance may read invoice generation approvals" ON public.invoice_generation_approvals
--   USING (
-- has_permission('billing.create_invoice'::text)
--   );
--
-- ALTER POLICY "Finance may read invoice generation candidates" ON public.invoice_generation_candidates
--   USING (
-- has_permission('billing.create_invoice'::text)
--   );
--
-- ALTER POLICY "invoice_generation_log_select" ON public.invoice_generation_log
--   USING (
-- has_permission('billing.create_invoice'::text)
--   );
--
-- ALTER POLICY "Finance may read invoice generation runs" ON public.invoice_generation_runs
--   USING (
-- has_permission('billing.create_invoice'::text)
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Residents can view own invoice items" ON public.invoice_items
--   USING (
-- (invoice_id IN ( SELECT invoices.id
--    FROM invoices
--   WHERE (invoices.resident_id = get_my_resident_id())))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can manage all invoices" ON public.invoices
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Residents can view own invoices" ON public.invoices
--   USING (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "Admins can view late fee log" ON public.late_fee_log
--   USING (
-- has_permission('billing.apply_late_fees'::text)
--   );
--
-- ALTER POLICY "Approvers can decide late fee waivers" ON public.late_fee_waivers
--   USING (
-- has_permission('billing.approve_late_fee_waiver'::text)
--   )
--   WITH CHECK (
-- (has_permission('billing.approve_late_fee_waiver'::text) AND ((status <> 'approved'::text) OR (requested_by <> ( SELECT auth.uid() AS uid))))
--   );
--
-- ALTER POLICY "Request holders can create late fee waivers" ON public.late_fee_waivers
--   WITH CHECK (
-- (has_permission('billing.request_late_fee_waiver'::text) AND (status = 'pending'::text) AND (requested_by = ( SELECT auth.uid() AS uid)))
--   );
--
-- ALTER POLICY "Request holders can view late fee waivers" ON public.late_fee_waivers
--   USING (
-- has_permission('billing.request_late_fee_waiver'::text)
--   );
--
-- ALTER POLICY "message_templates_admin_all" ON public.message_templates
--   USING (
-- has_permission('announcements.manage_templates'::text)
--   )
--   WITH CHECK (
-- has_permission('announcements.manage_templates'::text)
--   );
--
-- ALTER POLICY "Residents can update own notification preferences" ON public.notification_preferences
--   USING (
-- (resident_id = get_my_resident_id())
--   )
--   WITH CHECK (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "Residents can view own notification preferences" ON public.notification_preferences
--   USING (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "notification_preferences_delete" ON public.notification_preferences
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "notification_preferences_select" ON public.notification_preferences
--   USING (
-- (has_permission('notifications.view'::text) OR has_permission('residents.view'::text) OR (resident_id = get_my_resident_id()))
--   );
--
-- ALTER POLICY "notification_queue_delete" ON public.notification_queue
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "notification_queue_update" ON public.notification_queue
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   )
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "notification_schedules_delete" ON public.notification_schedules
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "notification_schedules_insert" ON public.notification_schedules
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "notification_schedules_update" ON public.notification_schedules
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   )
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "notification_templates_delete" ON public.notification_templates
--   USING (
-- ((get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])) AND (is_system = false))
--   );
--
-- ALTER POLICY "notification_templates_insert" ON public.notification_templates
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "notification_templates_update" ON public.notification_templates
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   )
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Admins and FinSec can manage all payments" ON public.payment_records
--   USING (
-- has_permission('payments.update'::text)
--   )
--   WITH CHECK (
-- has_permission('payments.update'::text)
--   );
--
-- ALTER POLICY "Residents can view own payments" ON public.payment_records
--   USING (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "paystack_transactions_admin_all" ON public.paystack_transactions
--   USING (
-- has_permission('payments.update'::text)
--   )
--   WITH CHECK (
-- has_permission('payments.update'::text)
--   );
--
-- ALTER POLICY "Manage Personnel Engagements - Authorized Roles" ON public.personnel_engagements
--   USING (
-- has_permission('manage_expenditure'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_expenditure'::text)
--   );
--
-- ALTER POLICY "Admins can manage petty cash accounts" ON public.petty_cash_accounts
--   USING (
-- has_permission('manage_expenditure'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_expenditure'::text)
--   );
--
-- ALTER POLICY "petty_cash_accounts_select" ON public.petty_cash_accounts
--   USING (
-- (has_permission('view_expenditure'::text) OR has_permission('billing.view'::text))
--   );
--
-- ALTER POLICY "Admins can delete profiles" ON public.profiles
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "Admins can insert profiles" ON public.profiles
--   WITH CHECK (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "Manage Milestones - Admins/Project Manager" ON public.project_milestones
--   USING (
-- has_permission('manage_projects'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_projects'::text)
--   );
--
-- ALTER POLICY "View Milestones - Admins/EXCO" ON public.project_milestones
--   USING (
-- has_permission('view_projects'::text)
--   );
--
-- ALTER POLICY "Manage Projects - Admins/Project Manager" ON public.projects
--   USING (
-- has_permission('manage_projects'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_projects'::text)
--   );
--
-- ALTER POLICY "View Projects - Admins/EXCO" ON public.projects
--   USING (
-- has_permission('view_projects'::text)
--   );
--
-- ALTER POLICY "report_archive_select" ON public.report_archive
--   USING (
-- has_permission('reports.view_financial'::text)
--   );
--
-- ALTER POLICY "Approved accounts only can read" ON public.report_schedules
--   USING (
-- is_approved()
--   );
--
-- ALTER POLICY "report_schedules_delete" ON public.report_schedules
--   USING (
-- has_permission('reports.manage_schedules'::text)
--   );
--
-- ALTER POLICY "report_schedules_insert" ON public.report_schedules
--   WITH CHECK (
-- has_permission('reports.manage_schedules'::text)
--   );
--
-- ALTER POLICY "report_schedules_select" ON public.report_schedules
--   USING (
-- has_permission('reports.manage_schedules'::text)
--   );
--
-- ALTER POLICY "report_schedules_update" ON public.report_schedules
--   USING (
-- has_permission('reports.manage_schedules'::text)
--   )
--   WITH CHECK (
-- has_permission('reports.manage_schedules'::text)
--   );
--
-- ALTER POLICY "report_subscriptions_admin_insert" ON public.report_subscriptions
--   WITH CHECK (
-- has_permission('report_subscriptions.manage'::text)
--   );
--
-- ALTER POLICY "report_subscriptions_admin_select" ON public.report_subscriptions
--   USING (
-- has_permission('report_subscriptions.view'::text)
--   );
--
-- ALTER POLICY "report_subscriptions_admin_update" ON public.report_subscriptions
--   USING (
-- has_permission('report_subscriptions.manage'::text)
--   )
--   WITH CHECK (
-- has_permission('report_subscriptions.manage'::text)
--   );
--
-- ALTER POLICY "Residents can view own house assignments" ON public.resident_houses
--   USING (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "resident_payment_cadence_summary_select" ON public.resident_payment_cadence_summary
--   USING (
-- has_permission('reports.view_financial'::text)
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can manage wallets" ON public.resident_wallets
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Residents can view own wallet" ON public.resident_wallets
--   USING (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "Residents can update own contact info" ON public.residents
--   USING (
-- (id = get_my_resident_id())
--   )
--   WITH CHECK (
-- (id = get_my_resident_id())
--   );
--
-- ALTER POLICY "Residents can view housemates" ON public.residents
--   USING (
-- (id IN ( SELECT rh2.resident_id
--    FROM resident_houses rh2
--   WHERE ((rh2.house_id IN ( SELECT rh1.house_id
--            FROM resident_houses rh1
--           WHERE ((rh1.resident_id = get_my_resident_id()) AND (rh1.is_active = true)))) AND (rh2.is_active = true))))
--   );
--
-- ALTER POLICY "Residents can view own record" ON public.residents
--   USING (
-- (id = get_my_resident_id())
--   );
--
-- ALTER POLICY "role_assignment_rules_select" ON public.role_assignment_rules
--   USING (
-- (has_permission('system.manage_roles'::text) OR has_permission('system.assign_roles'::text))
--   );
--
-- ALTER POLICY "Allow delete for role managers" ON public.role_permissions
--   USING (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   );
--
-- ALTER POLICY "Allow insert for role managers" ON public.role_permissions
--   WITH CHECK (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   );
--
-- ALTER POLICY "Allow update for role managers" ON public.role_permissions
--   USING (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   )
--   WITH CHECK (
-- (has_permission('system.manage_roles'::text) OR is_super_admin())
--   );
--
-- ALTER POLICY "Admins can view search logs" ON public.search_logs
--   USING (
-- has_permission('settings.view_audit_logs'::text)
--   );
--
-- ALTER POLICY "Residents can create own security contacts" ON public.security_contacts
--   WITH CHECK (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "Residents can delete own security contacts" ON public.security_contacts
--   USING (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "Residents can update own security contacts" ON public.security_contacts
--   USING (
-- (resident_id = get_my_resident_id())
--   )
--   WITH CHECK (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "Residents can view own security contacts" ON public.security_contacts
--   USING (
-- (resident_id = get_my_resident_id())
--   );
--
-- ALTER POLICY "security_contacts_delete_policy" ON public.security_contacts
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Approved accounts only can read" ON public.streets
--   USING (
-- is_approved()
--   );
--
-- ALTER POLICY "Super admins can view the system action log" ON public.system_action_log
--   USING (
-- has_permission('system.view_system_log'::text)
--   );
--
-- ALTER POLICY "system_settings_delete_policy" ON public.system_settings
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "system_settings_select_policy" ON public.system_settings
--   USING (
-- ((key = ANY (ARRAY['maintenance_mode'::text, 'maintenance_message'::text, 'resident_portal_enabled'::text, 'dashboard_theme'::text, 'portal_theme'::text, 'estate_name'::text, 'estate_logo_url'::text, 'estate_address'::text, 'estate_email'::text, 'estate_phone'::text, 'estate_facebook_url'::text, 'estate_instagram_url'::text, 'estate_twitter_url'::text, 'estate_website_url'::text, 'security_gate_phone'::text, 'estate_manager_phone'::text, 'estate_manager_name'::text, 'disable_ai_assistant'::text, 'ai_assistant_greeting_enabled'::text, 'assistant_name'::text])) OR has_permission('settings.view'::text))
--   );
--
-- ALTER POLICY "Admins can view all audit logs" ON public.two_factor_audit_log
--   USING (
-- has_permission('two_factor.view_audit_log'::text)
--   );
--
-- ALTER POLICY "Approved accounts only can read" ON public.two_factor_policies
--   USING (
-- is_approved()
--   );
--
-- ALTER POLICY "two_factor_policies_select" ON public.two_factor_policies
--   USING (
-- has_permission('two_factor.manage_policies'::text)
--   );
--
-- ALTER POLICY "Manage Vendors - Authorized Roles" ON public.vendors
--   USING (
-- has_permission('manage_vendors'::text)
--   )
--   WITH CHECK (
-- has_permission('manage_vendors'::text)
--   );
--
-- ALTER POLICY "View Vendors - Authorized Roles" ON public.vendors
--   USING (
-- has_permission('view_vendors'::text)
--   );
--
-- ALTER POLICY "visitor_vehicles_delete_policy" ON public.visitor_vehicles
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items
--   USING (
-- has_permission('billing.manage_wallets'::text)
--   )
--   WITH CHECK (
-- has_permission('billing.manage_wallets'::text)
--   );
--
-- ALTER POLICY "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches
--   USING (
-- has_permission('billing.manage_wallets'::text)
--   )
--   WITH CHECK (
-- has_permission('billing.manage_wallets'::text)
--   );
--
-- ALTER POLICY "Finance can create wallet settlement requests" ON public.wallet_settlement_requests
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Finance can view wallet settlement requests" ON public.wallet_settlement_requests
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Residents can view own wallet transactions" ON public.wallet_transactions
--   USING (
-- (wallet_id IN ( SELECT resident_wallets.id
--    FROM resident_wallets
--   WHERE (resident_wallets.resident_id = get_my_resident_id())))
--   );
--
-- ALTER POLICY "Admin access for whatsapp provider credentials" ON public.whatsapp_provider_credentials
--   USING (
-- has_permission('whatsapp.manage'::text)
--   )
--   WITH CHECK (
-- has_permission('whatsapp.manage'::text)
--   );
--
-- COMMIT;

BEGIN;

ALTER POLICY "Residents can view own access codes" ON public.access_codes
  USING (
(contact_id IN ( SELECT security_contacts.id
   FROM security_contacts
  WHERE (security_contacts.resident_id = (select get_my_resident_id()))))
  );

ALTER POLICY "access_codes_delete_policy" ON public.access_codes
  USING (
((select has_permission('security.suspend_revoke'::text)))
  );

ALTER POLICY "access_logs_delete_policy" ON public.access_logs
  USING (
((select has_permission('system.manage_data_retention'::text)))
  );

ALTER POLICY "Approved accounts only can read" ON public.ai_settings
  USING (
(select is_approved())
  );

ALTER POLICY "announcement_categories_admin_all" ON public.announcement_categories
  USING (
(select has_permission('announcements.manage_categories'::text))
  )
  WITH CHECK (
(select has_permission('announcements.manage_categories'::text))
  );

ALTER POLICY "read_receipts_admin_select" ON public.announcement_read_receipts
  USING (
(select has_permission('announcements.publish'::text))
  );

ALTER POLICY "announcements_admin_delete" ON public.announcements
  USING (
(select has_permission('announcements.delete'::text))
  );

ALTER POLICY "announcements_admin_insert" ON public.announcements
  WITH CHECK (
(select has_permission('announcements.create'::text))
  );

ALTER POLICY "announcements_admin_select" ON public.announcements
  USING (
(select has_permission('announcements.view'::text))
  );

ALTER POLICY "announcements_admin_update" ON public.announcements
  USING (
(select has_permission('announcements.update'::text))
  )
  WITH CHECK (
(select has_permission('announcements.update'::text))
  );

ALTER POLICY "Allow delete for role managers" ON public.app_roles
  USING (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  );

ALTER POLICY "Allow insert for role managers" ON public.app_roles
  WITH CHECK (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  );

ALTER POLICY "Allow update for role managers" ON public.app_roles
  USING (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  )
  WITH CHECK (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  );

ALTER POLICY "Admin and chairman can update approval requests" ON public.approval_requests
  USING (
(select has_permission('approvals.approve_reject'::text))
  )
  WITH CHECK (
(select has_permission('approvals.approve_reject'::text))
  );

ALTER POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
  USING (
(select has_permission('approvals.view'::text))
  );

ALTER POLICY "Users with settings.view_audit_logs can view audit logs" ON public.audit_logs
  USING (
(select has_permission('settings.view_audit_logs'::text))
  );

ALTER POLICY "Admin, Chairman, Financial Secretary can manage imports" ON public.bank_statement_imports
  USING (
((select has_permission('imports.create'::text)))
  );

ALTER POLICY "Admin, Chairman, Financial Secretary can manage import rows" ON public.bank_statement_rows
  USING (
((select has_permission('imports.create'::text)))
  );

ALTER POLICY "Finance may read billing profile version items" ON public.billing_profile_version_items
  USING (
(select has_permission('billing.manage_profiles'::text))
  );

ALTER POLICY "Finance may read billing profile versions" ON public.billing_profile_versions
  USING (
(select has_permission('billing.manage_profiles'::text))
  );

ALTER POLICY "Manage Budgets - Authorized Roles" ON public.budgets
  USING (
(select has_permission('manage_expenditure'::text))
  )
  WITH CHECK (
(select has_permission('manage_expenditure'::text))
  );

ALTER POLICY "View Budgets - Authorized Roles" ON public.budgets
  USING (
(select has_permission('view_expenditure'::text))
  );

ALTER POLICY "Editors can write custom field values" ON public.document_custom_field_values
  USING (
((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1
   FROM documents d
  WHERE (d.id = document_custom_field_values.document_id))))
  )
  WITH CHECK (
((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1
   FROM documents d
  WHERE (d.id = document_custom_field_values.document_id))))
  );

ALTER POLICY "Custom field managers can manage custom fields" ON public.document_custom_fields
  USING (
(select has_permission('documents.manage_custom_fields'::text))
  )
  WITH CHECK (
(select has_permission('documents.manage_custom_fields'::text))
  );

ALTER POLICY "Document viewers can view active custom fields" ON public.document_custom_fields
  USING (
((is_active = true) AND (select has_permission('documents.view'::text)))
  );

ALTER POLICY "Editors can remove tags" ON public.document_tag_assignments
  USING (
((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1
   FROM documents d
  WHERE (d.id = document_tag_assignments.document_id))))
  );

ALTER POLICY "Uploaders and editors can assign tags" ON public.document_tag_assignments
  WITH CHECK (
(((select has_permission('documents.upload'::text)) OR (select has_permission('documents.update'::text))) AND (EXISTS ( SELECT 1
   FROM documents d
  WHERE (d.id = document_tag_assignments.document_id))))
  );

ALTER POLICY "Document viewers can view active tags" ON public.document_tags
  USING (
((is_active = true) AND (select has_permission('documents.view'::text)))
  );

ALTER POLICY "Tag managers can manage tags" ON public.document_tags
  USING (
(select has_permission('documents.manage_tags'::text))
  )
  WITH CHECK (
(select has_permission('documents.manage_tags'::text))
  );

ALTER POLICY "Admin access for email imports" ON public.email_imports
  USING (
(select has_permission('email_imports.view'::text))
  )
  WITH CHECK (
(select has_permission('email_imports.view'::text))
  );

ALTER POLICY "Admin access for email messages" ON public.email_messages
  USING (
(select has_permission('email_imports.view'::text))
  )
  WITH CHECK (
(select has_permission('email_imports.view'::text))
  );

ALTER POLICY "Admin access for email transactions" ON public.email_transactions
  USING (
(select has_permission('email_imports.view'::text))
  )
  WITH CHECK (
(select has_permission('email_imports.view'::text))
  );

ALTER POLICY "escalation_states_delete" ON public.escalation_states
  USING (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "Admin access for bank account passwords" ON public.estate_bank_account_passwords
  USING (
(select has_permission('email_imports.manage_passwords'::text))
  )
  WITH CHECK (
(select has_permission('email_imports.manage_passwords'::text))
  );

ALTER POLICY "Approved accounts only can read" ON public.estate_bank_accounts
  USING (
(select is_approved())
  );

ALTER POLICY "Manage Categories - Authorized Roles" ON public.expense_categories
  USING (
(select has_permission('manage_expenditure'::text))
  )
  WITH CHECK (
(select has_permission('manage_expenditure'::text))
  );

ALTER POLICY "View Categories - Authorized Roles" ON public.expense_categories
  USING (
(select has_permission('view_expenditure'::text))
  );

ALTER POLICY "Manage Expenditure - Authorized Roles" ON public.expenses
  USING (
(select has_permission('manage_expenditure'::text))
  )
  WITH CHECK (
(select has_permission('manage_expenditure'::text))
  );

ALTER POLICY "View Expenditure - Admins/Financial Secretary" ON public.expenses
  USING (
(select has_permission('view_expenditure'::text))
  );

ALTER POLICY "generated_reports_delete" ON public.generated_reports
  USING (
(select has_permission('reports.manage_schedules'::text))
  );

ALTER POLICY "generated_reports_insert" ON public.generated_reports
  WITH CHECK (
(select has_permission('reports.view_financial'::text))
  );

ALTER POLICY "generated_reports_select" ON public.generated_reports
  USING (
(select has_permission('reports.view_financial'::text))
  );

ALTER POLICY "Admin access for gmail oauth credentials" ON public.gmail_oauth_credentials
  USING (
(select has_permission('email_imports.configure'::text))
  )
  WITH CHECK (
(select has_permission('email_imports.configure'::text))
  );

ALTER POLICY "house_levy_history_delete_policy" ON public.house_levy_history
  USING (
((select has_permission('system.manage_data_retention'::text)))
  );

ALTER POLICY "house_levy_history_insert_policy" ON public.house_levy_history
  WITH CHECK (
((select has_permission('billing.create_invoice'::text)))
  );

ALTER POLICY "house_levy_history_select_policy" ON public.house_levy_history
  USING (
((select has_permission('billing.view'::text)) OR (select has_permission('billing.create_invoice'::text)) OR (select has_permission('houses.update'::text)))
  );

ALTER POLICY "house_levy_history_update_policy" ON public.house_levy_history
  USING (
((select has_permission('billing.create_invoice'::text)))
  );

ALTER POLICY "Only admins can update ownership history" ON public.house_ownership_history
  USING (
((select has_permission('system.manage_data_retention'::text)))
  )
  WITH CHECK (
((select has_permission('system.manage_data_retention'::text)))
  );

ALTER POLICY "house_ownership_history_select" ON public.house_ownership_history
  USING (
((select has_permission('houses.view'::text)) OR (select has_permission('houses.assign_resident'::text)))
  );

ALTER POLICY "Approved accounts only can read" ON public.house_types
  USING (
(select is_approved())
  );

ALTER POLICY "Approved accounts only can read" ON public.houses
  USING (
(select is_approved())
  );

ALTER POLICY "Residents can view assigned houses" ON public.houses
  USING (
(id IN ( SELECT resident_houses.house_id
   FROM resident_houses
  WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true))))
  );

ALTER POLICY "super_admin_read_all_impersonation_sessions" ON public.impersonation_sessions
  USING (
(select has_permission('impersonation.view_sessions'::text))
  );

ALTER POLICY "in_app_notifications_admin_insert" ON public.in_app_notifications
  WITH CHECK (
(select has_permission('notifications.send'::text))
  );

ALTER POLICY "Finance may read invoice generation approvals" ON public.invoice_generation_approvals
  USING (
(select has_permission('billing.create_invoice'::text))
  );

ALTER POLICY "Finance may read invoice generation candidates" ON public.invoice_generation_candidates
  USING (
(select has_permission('billing.create_invoice'::text))
  );

ALTER POLICY "invoice_generation_log_select" ON public.invoice_generation_log
  USING (
(select has_permission('billing.create_invoice'::text))
  );

ALTER POLICY "Finance may read invoice generation runs" ON public.invoice_generation_runs
  USING (
(select has_permission('billing.create_invoice'::text))
  );

ALTER POLICY "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items
  USING (
((select has_permission('billing.create_invoice'::text)))
  );

ALTER POLICY "Residents can view own invoice items" ON public.invoice_items
  USING (
(invoice_id IN ( SELECT invoices.id
   FROM invoices
  WHERE (invoices.resident_id = (select get_my_resident_id()))))
  );

ALTER POLICY "Admins chairmen fin sec can manage all invoices" ON public.invoices
  USING (
((select has_permission('billing.create_invoice'::text)))
  );

ALTER POLICY "Residents can view own invoices" ON public.invoices
  USING (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "Admins can view late fee log" ON public.late_fee_log
  USING (
(select has_permission('billing.apply_late_fees'::text))
  );

ALTER POLICY "Approvers can decide late fee waivers" ON public.late_fee_waivers
  USING (
(select has_permission('billing.approve_late_fee_waiver'::text))
  )
  WITH CHECK (
((select has_permission('billing.approve_late_fee_waiver'::text)) AND ((status <> 'approved'::text) OR (requested_by <> ( SELECT auth.uid() AS uid))))
  );

ALTER POLICY "Request holders can create late fee waivers" ON public.late_fee_waivers
  WITH CHECK (
((select has_permission('billing.request_late_fee_waiver'::text)) AND (status = 'pending'::text) AND (requested_by = ( SELECT auth.uid() AS uid)))
  );

ALTER POLICY "Request holders can view late fee waivers" ON public.late_fee_waivers
  USING (
(select has_permission('billing.request_late_fee_waiver'::text))
  );

ALTER POLICY "message_templates_admin_all" ON public.message_templates
  USING (
(select has_permission('announcements.manage_templates'::text))
  )
  WITH CHECK (
(select has_permission('announcements.manage_templates'::text))
  );

ALTER POLICY "Residents can update own notification preferences" ON public.notification_preferences
  USING (
(resident_id = (select get_my_resident_id()))
  )
  WITH CHECK (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "Residents can view own notification preferences" ON public.notification_preferences
  USING (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "notification_preferences_delete" ON public.notification_preferences
  USING (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "notification_preferences_select" ON public.notification_preferences
  USING (
((select has_permission('notifications.view'::text)) OR (select has_permission('residents.view'::text)) OR (resident_id = (select get_my_resident_id())))
  );

ALTER POLICY "notification_queue_delete" ON public.notification_queue
  USING (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "notification_queue_update" ON public.notification_queue
  USING (
((select has_permission('notifications.manage'::text)))
  )
  WITH CHECK (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "notification_schedules_delete" ON public.notification_schedules
  USING (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "notification_schedules_insert" ON public.notification_schedules
  WITH CHECK (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "notification_schedules_update" ON public.notification_schedules
  USING (
((select has_permission('notifications.manage'::text)))
  )
  WITH CHECK (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "notification_templates_delete" ON public.notification_templates
  USING (
(((select has_permission('notifications.manage'::text))) AND (is_system = false))
  );

ALTER POLICY "notification_templates_insert" ON public.notification_templates
  WITH CHECK (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "notification_templates_update" ON public.notification_templates
  USING (
((select has_permission('notifications.manage'::text)))
  )
  WITH CHECK (
((select has_permission('notifications.manage'::text)))
  );

ALTER POLICY "Admins and FinSec can manage all payments" ON public.payment_records
  USING (
(select has_permission('payments.update'::text))
  )
  WITH CHECK (
(select has_permission('payments.update'::text))
  );

ALTER POLICY "Residents can view own payments" ON public.payment_records
  USING (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "paystack_transactions_admin_all" ON public.paystack_transactions
  USING (
(select has_permission('payments.update'::text))
  )
  WITH CHECK (
(select has_permission('payments.update'::text))
  );

ALTER POLICY "Manage Personnel Engagements - Authorized Roles" ON public.personnel_engagements
  USING (
(select has_permission('manage_expenditure'::text))
  )
  WITH CHECK (
(select has_permission('manage_expenditure'::text))
  );

ALTER POLICY "Admins can manage petty cash accounts" ON public.petty_cash_accounts
  USING (
(select has_permission('manage_expenditure'::text))
  )
  WITH CHECK (
(select has_permission('manage_expenditure'::text))
  );

ALTER POLICY "petty_cash_accounts_select" ON public.petty_cash_accounts
  USING (
((select has_permission('view_expenditure'::text)) OR (select has_permission('billing.view'::text)))
  );

ALTER POLICY "Admins can delete profiles" ON public.profiles
  USING (
((select has_permission('system.assign_roles'::text)))
  );

ALTER POLICY "Admins can insert profiles" ON public.profiles
  WITH CHECK (
((select has_permission('system.assign_roles'::text)))
  );

ALTER POLICY "Manage Milestones - Admins/Project Manager" ON public.project_milestones
  USING (
(select has_permission('manage_projects'::text))
  )
  WITH CHECK (
(select has_permission('manage_projects'::text))
  );

ALTER POLICY "View Milestones - Admins/EXCO" ON public.project_milestones
  USING (
(select has_permission('view_projects'::text))
  );

ALTER POLICY "Manage Projects - Admins/Project Manager" ON public.projects
  USING (
(select has_permission('manage_projects'::text))
  )
  WITH CHECK (
(select has_permission('manage_projects'::text))
  );

ALTER POLICY "View Projects - Admins/EXCO" ON public.projects
  USING (
(select has_permission('view_projects'::text))
  );

ALTER POLICY "report_archive_select" ON public.report_archive
  USING (
(select has_permission('reports.view_financial'::text))
  );

ALTER POLICY "Approved accounts only can read" ON public.report_schedules
  USING (
(select is_approved())
  );

ALTER POLICY "report_schedules_delete" ON public.report_schedules
  USING (
(select has_permission('reports.manage_schedules'::text))
  );

ALTER POLICY "report_schedules_insert" ON public.report_schedules
  WITH CHECK (
(select has_permission('reports.manage_schedules'::text))
  );

ALTER POLICY "report_schedules_select" ON public.report_schedules
  USING (
(select has_permission('reports.manage_schedules'::text))
  );

ALTER POLICY "report_schedules_update" ON public.report_schedules
  USING (
(select has_permission('reports.manage_schedules'::text))
  )
  WITH CHECK (
(select has_permission('reports.manage_schedules'::text))
  );

ALTER POLICY "report_subscriptions_admin_insert" ON public.report_subscriptions
  WITH CHECK (
(select has_permission('report_subscriptions.manage'::text))
  );

ALTER POLICY "report_subscriptions_admin_select" ON public.report_subscriptions
  USING (
(select has_permission('report_subscriptions.view'::text))
  );

ALTER POLICY "report_subscriptions_admin_update" ON public.report_subscriptions
  USING (
(select has_permission('report_subscriptions.manage'::text))
  )
  WITH CHECK (
(select has_permission('report_subscriptions.manage'::text))
  );

ALTER POLICY "Residents can view own house assignments" ON public.resident_houses
  USING (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "resident_payment_cadence_summary_select" ON public.resident_payment_cadence_summary
  USING (
(select has_permission('reports.view_financial'::text))
  );

ALTER POLICY "Admins chairmen fin sec can manage wallets" ON public.resident_wallets
  USING (
((select has_permission('billing.manage_wallets'::text)))
  );

ALTER POLICY "Residents can view own wallet" ON public.resident_wallets
  USING (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "Residents can update own contact info" ON public.residents
  USING (
(id = (select get_my_resident_id()))
  )
  WITH CHECK (
(id = (select get_my_resident_id()))
  );

ALTER POLICY "Residents can view housemates" ON public.residents
  USING (
(id IN ( SELECT rh2.resident_id
   FROM resident_houses rh2
  WHERE ((rh2.house_id IN ( SELECT rh1.house_id
           FROM resident_houses rh1
          WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true))))
  );

ALTER POLICY "Residents can view own record" ON public.residents
  USING (
(id = (select get_my_resident_id()))
  );

ALTER POLICY "role_assignment_rules_select" ON public.role_assignment_rules
  USING (
((select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text)))
  );

ALTER POLICY "Allow delete for role managers" ON public.role_permissions
  USING (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  );

ALTER POLICY "Allow insert for role managers" ON public.role_permissions
  WITH CHECK (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  );

ALTER POLICY "Allow update for role managers" ON public.role_permissions
  USING (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  )
  WITH CHECK (
((select has_permission('system.manage_roles'::text)) OR (select is_super_admin()))
  );

ALTER POLICY "Admins can view search logs" ON public.search_logs
  USING (
(select has_permission('settings.view_audit_logs'::text))
  );

ALTER POLICY "Residents can create own security contacts" ON public.security_contacts
  WITH CHECK (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "Residents can delete own security contacts" ON public.security_contacts
  USING (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "Residents can update own security contacts" ON public.security_contacts
  USING (
(resident_id = (select get_my_resident_id()))
  )
  WITH CHECK (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "Residents can view own security contacts" ON public.security_contacts
  USING (
(resident_id = (select get_my_resident_id()))
  );

ALTER POLICY "security_contacts_delete_policy" ON public.security_contacts
  USING (
((select has_permission('security.suspend_revoke'::text)))
  );

ALTER POLICY "Approved accounts only can read" ON public.streets
  USING (
(select is_approved())
  );

ALTER POLICY "Super admins can view the system action log" ON public.system_action_log
  USING (
(select has_permission('system.view_system_log'::text))
  );

ALTER POLICY "system_settings_delete_policy" ON public.system_settings
  USING (
((select has_permission('system.view_all_settings'::text)))
  );

ALTER POLICY "system_settings_select_policy" ON public.system_settings
  USING (
((key = ANY (ARRAY['maintenance_mode'::text, 'maintenance_message'::text, 'resident_portal_enabled'::text, 'dashboard_theme'::text, 'portal_theme'::text, 'estate_name'::text, 'estate_logo_url'::text, 'estate_address'::text, 'estate_email'::text, 'estate_phone'::text, 'estate_facebook_url'::text, 'estate_instagram_url'::text, 'estate_twitter_url'::text, 'estate_website_url'::text, 'security_gate_phone'::text, 'estate_manager_phone'::text, 'estate_manager_name'::text, 'disable_ai_assistant'::text, 'ai_assistant_greeting_enabled'::text, 'assistant_name'::text])) OR (select has_permission('settings.view'::text)))
  );

ALTER POLICY "Admins can view all audit logs" ON public.two_factor_audit_log
  USING (
(select has_permission('two_factor.view_audit_log'::text))
  );

ALTER POLICY "Approved accounts only can read" ON public.two_factor_policies
  USING (
(select is_approved())
  );

ALTER POLICY "two_factor_policies_select" ON public.two_factor_policies
  USING (
(select has_permission('two_factor.manage_policies'::text))
  );

ALTER POLICY "Manage Vendors - Authorized Roles" ON public.vendors
  USING (
(select has_permission('manage_vendors'::text))
  )
  WITH CHECK (
(select has_permission('manage_vendors'::text))
  );

ALTER POLICY "View Vendors - Authorized Roles" ON public.vendors
  USING (
(select has_permission('view_vendors'::text))
  );

ALTER POLICY "visitor_vehicles_delete_policy" ON public.visitor_vehicles
  USING (
((select has_permission('security.suspend_revoke'::text)))
  );

ALTER POLICY "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items
  USING (
(select has_permission('billing.manage_wallets'::text))
  )
  WITH CHECK (
(select has_permission('billing.manage_wallets'::text))
  );

ALTER POLICY "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches
  USING (
(select has_permission('billing.manage_wallets'::text))
  )
  WITH CHECK (
(select has_permission('billing.manage_wallets'::text))
  );

ALTER POLICY "Finance can create wallet settlement requests" ON public.wallet_settlement_requests
  WITH CHECK (
((select has_permission('billing.manage_wallets'::text)))
  );

ALTER POLICY "Finance can view wallet settlement requests" ON public.wallet_settlement_requests
  USING (
((select has_permission('billing.manage_wallets'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions
  USING (
((select has_permission('billing.manage_wallets'::text)))
  );

ALTER POLICY "Residents can view own wallet transactions" ON public.wallet_transactions
  USING (
(wallet_id IN ( SELECT resident_wallets.id
   FROM resident_wallets
  WHERE (resident_wallets.resident_id = (select get_my_resident_id()))))
  );

ALTER POLICY "Admin access for whatsapp provider credentials" ON public.whatsapp_provider_credentials
  USING (
(select has_permission('whatsapp.manage'::text))
  )
  WITH CHECK (
(select has_permission('whatsapp.manage'::text))
  );

COMMIT;
