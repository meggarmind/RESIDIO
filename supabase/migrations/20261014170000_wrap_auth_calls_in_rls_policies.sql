-- #63 slice 2: wrap auth.uid() / auth.role() / auth.jwt() in RLS policies as (select ...)
--
-- Supabase's auth_rls_initplan advisor flags 45 policies on 26 public tables that call auth.uid(),
-- auth.role() or auth.jwt() directly, so the call is re-evaluated for every row. Wrapping
-- each call as (select auth.uid()) turns it into a once-per-query initplan.
--
-- THIS CHANGES NO ACCESS. The rewrite is purely textual: each auth.uid() becomes
-- (select auth.uid()), each auth.role() becomes (select auth.role()), each auth.jwt()
-- becomes (select auth.jwt()), and nothing else in any expression is touched. ALTER POLICY
-- keeps each policy's command, roles and permissive/restrictive setting exactly as they are.
--
-- Scope: 44 of the 45 flagged policies are altered here, on 26 tables.
--
-- LEFT OUT, deliberately: public.documents "Users can view documents based on permissions".
-- Its predicate compares app_roles.name to the literals 'resident'. Re-stating that predicate
-- in a new migration trips hardcoded-role-name-ratchet.test.ts (which scans new migrations
-- for role-name comparisons against string literals), and that ratchet must not be weakened. That
-- policy needs its own change that replaces the role-name comparison with has_permission(),
-- which alters who can see what and so is not a no-op rewrite. It stays flagged by the advisor
-- until then.
--
-- Verified by src/__tests__/wrap-auth-calls-rls-policies.test.ts against a fixture of the live
-- policy definitions (src/__tests__/fixtures/initplan-policies.json): every ALTER
-- equals the original text with only the auth calls wrapped, and the rollback below restores
-- every original verbatim. No database was touched when this was written.
--
-- ROLLBACK (run as one transaction; each statement restores the original text verbatim):
--
-- BEGIN;
--
-- ALTER POLICY "Users can insert their own conversation logs" ON public.ai_conversation_logs
--   WITH CHECK (
-- (user_id = auth.uid())
--   );
--
-- ALTER POLICY "Users can read their own conversation logs" ON public.ai_conversation_logs
--   USING (
-- (user_id = auth.uid())
--   );
--
-- ALTER POLICY "read_receipts_own_insert" ON public.announcement_read_receipts
--   WITH CHECK (
-- (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = auth.uid()))))
--   );
--
-- ALTER POLICY "read_receipts_own_select" ON public.announcement_read_receipts
--   USING (
-- (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = auth.uid()))))
--   );
--
-- ALTER POLICY "announcements_resident_select" ON public.announcements
--   USING (
-- ((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.profile_id = auth.uid()) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.profile_id = auth.uid()) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1
--    FROM (residents r
--      JOIN resident_houses rh ON ((rh.resident_id = r.id)))
--   WHERE ((r.profile_id = auth.uid()) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1
--    FROM (residents r
--      JOIN resident_houses rh ON ((rh.resident_id = r.id)))
--   WHERE ((r.profile_id = auth.uid()) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1
--    FROM (residents r
--      JOIN resident_houses rh ON ((rh.resident_id = r.id)))
--   WHERE ((r.profile_id = auth.uid()) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1
--    FROM (residents r
--      JOIN resident_houses rh ON ((rh.resident_id = r.id)))
--   WHERE ((r.profile_id = auth.uid()) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses)))))))
--   );
--
-- ALTER POLICY "Allow read access to all authenticated users" ON public.app_permissions
--   USING (
-- (auth.role() = 'authenticated'::text)
--   );
--
-- ALTER POLICY "Allow read access to all authenticated users" ON public.app_roles
--   USING (
-- (auth.role() = 'authenticated'::text)
--   );
--
-- ALTER POLICY "Users can create their own approval requests" ON public.approval_requests
--   WITH CHECK (
-- (requested_by = auth.uid())
--   );
--
-- ALTER POLICY "Users can view their own approval requests" ON public.approval_requests
--   USING (
-- (requested_by = auth.uid())
--   );
--
-- ALTER POLICY "Admins can view access logs" ON public.document_access_logs
--   USING (
-- (EXISTS ( SELECT 1
--    FROM ((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = ANY ((ARRAY['documents.manage_categories'::character varying, 'audit.view'::character varying])::text[])))))
--   );
--
-- ALTER POLICY "Users can log their own access" ON public.document_access_logs
--   WITH CHECK (
-- (accessed_by = auth.uid())
--   );
--
-- ALTER POLICY "Admins can manage categories" ON public.document_categories
--   USING (
-- (EXISTS ( SELECT 1
--    FROM ((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.manage_categories'::text))))
--   );
--
-- ALTER POLICY "Users can delete documents" ON public.documents
--   USING (
-- (EXISTS ( SELECT 1
--    FROM ((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.delete'::text))))
--   );
--
-- ALTER POLICY "Users can update documents" ON public.documents
--   USING (
-- (EXISTS ( SELECT 1
--    FROM ((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.update'::text))))
--   );
--
-- ALTER POLICY "Users can upload documents" ON public.documents
--   WITH CHECK (
-- (EXISTS ( SELECT 1
--    FROM ((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.upload'::text))))
--   );
--
-- ALTER POLICY "Users can create notes" ON public.entity_notes
--   WITH CHECK (
-- (EXISTS ( SELECT 1
--    FROM (((profiles p
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--      JOIN role_permissions rp ON ((rp.role_id = ar.id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'notes.create'::text))))
--   );
--
-- ALTER POLICY "Users can delete notes" ON public.entity_notes
--   USING (
-- (EXISTS ( SELECT 1
--    FROM (((profiles p
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--      JOIN role_permissions rp ON ((rp.role_id = ar.id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'notes.delete'::text))))
--   );
--
-- ALTER POLICY "Users can update notes" ON public.entity_notes
--   USING (
-- (EXISTS ( SELECT 1
--    FROM (((profiles p
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--      JOIN role_permissions rp ON ((rp.role_id = ar.id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'notes.update'::text))))
--   );
--
-- ALTER POLICY "Users can view notes based on permissions" ON public.entity_notes
--   USING (
-- ((EXISTS ( SELECT 1
--    FROM (((profiles p
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--      JOIN role_permissions rp ON ((rp.role_id = ar.id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'notes.view'::text)))) AND ((is_confidential = false) OR (EXISTS ( SELECT 1
--    FROM (((profiles p
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--      JOIN role_permissions rp ON ((rp.role_id = ar.id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'notes.view_confidential'::text)))) OR (EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY (entity_notes.confidential_roles)))))))
--   );
--
-- ALTER POLICY "hierarchical_settings_read_own_resident" ON public.hierarchical_settings
--   USING (
-- ((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id
--    FROM residents
--   WHERE (residents.profile_id = auth.uid()))))
--   );
--
-- ALTER POLICY "admins_insert_own_impersonation_sessions" ON public.impersonation_sessions
--   WITH CHECK (
-- (admin_profile_id = auth.uid())
--   );
--
-- ALTER POLICY "admins_read_own_impersonation_sessions" ON public.impersonation_sessions
--   USING (
-- (admin_profile_id = auth.uid())
--   );
--
-- ALTER POLICY "admins_update_own_impersonation_sessions" ON public.impersonation_sessions
--   USING (
-- (admin_profile_id = auth.uid())
--   )
--   WITH CHECK (
-- (admin_profile_id = auth.uid())
--   );
--
-- ALTER POLICY "in_app_notifications_own_delete" ON public.in_app_notifications
--   USING (
-- (recipient_id = auth.uid())
--   );
--
-- ALTER POLICY "in_app_notifications_own_select" ON public.in_app_notifications
--   USING (
-- (recipient_id = auth.uid())
--   );
--
-- ALTER POLICY "in_app_notifications_own_update" ON public.in_app_notifications
--   USING (
-- (recipient_id = auth.uid())
--   )
--   WITH CHECK (
-- (recipient_id = auth.uid())
--   );
--
-- ALTER POLICY "Approvers can decide late fee waivers" ON public.late_fee_waivers
--   USING (
-- has_permission('billing.approve_late_fee_waiver'::text)
--   )
--   WITH CHECK (
-- (has_permission('billing.approve_late_fee_waiver'::text) AND ((status <> 'approved'::text) OR (requested_by <> auth.uid())))
--   );
--
-- ALTER POLICY "Request holders can create late fee waivers" ON public.late_fee_waivers
--   WITH CHECK (
-- (has_permission('billing.request_late_fee_waiver'::text) AND (status = 'pending'::text) AND (requested_by = auth.uid()))
--   );
--
-- ALTER POLICY "paystack_transactions_resident_select" ON public.paystack_transactions
--   USING (
-- (resident_id IN ( SELECT residents.id
--    FROM residents
--   WHERE (residents.profile_id = auth.uid())))
--   );
--
-- ALTER POLICY "Users can update own profile" ON public.profiles
--   USING (
-- (auth.uid() = id)
--   )
--   WITH CHECK (
-- (auth.uid() = id)
--   );
--
-- ALTER POLICY "Users can view own profile" ON public.profiles
--   USING (
-- (auth.uid() = id)
--   );
--
-- ALTER POLICY "Users with report export can insert" ON public.report_archive
--   WITH CHECK (
-- (EXISTS ( SELECT 1
--    FROM ((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON (((ap.id = rp.permission_id) AND ((ap.name)::text = 'reports.export'::text))))
--   WHERE (p.id = auth.uid())))
--   );
--
-- ALTER POLICY "report_subscriptions_own_insert" ON public.report_subscriptions
--   WITH CHECK (
-- (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = auth.uid()))))
--   );
--
-- ALTER POLICY "report_subscriptions_own_select" ON public.report_subscriptions
--   USING (
-- (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = auth.uid()))))
--   );
--
-- ALTER POLICY "report_subscriptions_own_update" ON public.report_subscriptions
--   USING (
-- (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = auth.uid()))))
--   )
--   WITH CHECK (
-- (EXISTS ( SELECT 1
--    FROM residents r
--   WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = auth.uid()))))
--   );
--
-- ALTER POLICY "Admins can manage role assignment rules" ON public.role_assignment_rules
--   USING (
-- (EXISTS ( SELECT 1
--    FROM ((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'system.manage_roles'::text))))
--   );
--
-- ALTER POLICY "Allow read access to all authenticated users" ON public.role_permissions
--   USING (
-- (auth.role() = 'authenticated'::text)
--   );
--
-- ALTER POLICY "Users can insert search logs" ON public.search_logs
--   WITH CHECK (
-- (auth.uid() = user_id)
--   );
--
-- ALTER POLICY "Users can view own audit log" ON public.two_factor_audit_log
--   USING (
-- (profile_id = auth.uid())
--   );
--
-- ALTER POLICY "Service role can manage verification tokens" ON public.verification_tokens
--   USING (
-- ((auth.jwt() ->> 'role'::text) = 'service_role'::text)
--   );
--
-- ALTER POLICY "Users can view own verification tokens" ON public.verification_tokens
--   USING (
-- (resident_id IN ( SELECT p.resident_id
--    FROM profiles p
--   WHERE (p.id = auth.uid())))
--   );
--
-- ALTER POLICY "Residents can view own wallet payment batch items" ON public.wallet_payment_batch_items
--   USING (
-- (batch_id IN ( SELECT wallet_payment_batches.id
--    FROM wallet_payment_batches
--   WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id
--            FROM residents
--           WHERE (residents.profile_id = auth.uid())))))
--   );
--
-- ALTER POLICY "Residents can view own wallet payment batches" ON public.wallet_payment_batches
--   USING (
-- (resident_id IN ( SELECT residents.id
--    FROM residents
--   WHERE (residents.profile_id = auth.uid())))
--   );
--
-- ALTER POLICY "Residents can view own transactions" ON public.wallet_transactions
--   USING (
-- (wallet_id IN ( SELECT w.id
--    FROM (resident_wallets w
--      JOIN residents r ON ((r.id = w.resident_id)))
--   WHERE (r.profile_id = auth.uid())))
--   );
--
-- COMMIT;

BEGIN;

ALTER POLICY "Users can insert their own conversation logs" ON public.ai_conversation_logs
  WITH CHECK (
(user_id = (select auth.uid()))
  );

ALTER POLICY "Users can read their own conversation logs" ON public.ai_conversation_logs
  USING (
(user_id = (select auth.uid()))
  );

ALTER POLICY "read_receipts_own_insert" ON public.announcement_read_receipts
  WITH CHECK (
(EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid())))))
  );

ALTER POLICY "read_receipts_own_select" ON public.announcement_read_receipts
  USING (
(EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid())))))
  );

ALTER POLICY "announcements_resident_select" ON public.announcements
  USING (
((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1
   FROM (residents r
     JOIN resident_houses rh ON ((rh.resident_id = r.id)))
  WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1
   FROM (residents r
     JOIN resident_houses rh ON ((rh.resident_id = r.id)))
  WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1
   FROM (residents r
     JOIN resident_houses rh ON ((rh.resident_id = r.id)))
  WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1
   FROM (residents r
     JOIN resident_houses rh ON ((rh.resident_id = r.id)))
  WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses)))))))
  );

ALTER POLICY "Allow read access to all authenticated users" ON public.app_permissions
  USING (
((select auth.role()) = 'authenticated'::text)
  );

ALTER POLICY "Allow read access to all authenticated users" ON public.app_roles
  USING (
((select auth.role()) = 'authenticated'::text)
  );

ALTER POLICY "Users can create their own approval requests" ON public.approval_requests
  WITH CHECK (
(requested_by = (select auth.uid()))
  );

ALTER POLICY "Users can view their own approval requests" ON public.approval_requests
  USING (
(requested_by = (select auth.uid()))
  );

ALTER POLICY "Admins can view access logs" ON public.document_access_logs
  USING (
(EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = ANY ((ARRAY['documents.manage_categories'::character varying, 'audit.view'::character varying])::text[])))))
  );

ALTER POLICY "Users can log their own access" ON public.document_access_logs
  WITH CHECK (
(accessed_by = (select auth.uid()))
  );

ALTER POLICY "Admins can manage categories" ON public.document_categories
  USING (
(EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text))))
  );

ALTER POLICY "Users can delete documents" ON public.documents
  USING (
(EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.delete'::text))))
  );

ALTER POLICY "Users can update documents" ON public.documents
  USING (
(EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.update'::text))))
  );

ALTER POLICY "Users can upload documents" ON public.documents
  WITH CHECK (
(EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.upload'::text))))
  );

ALTER POLICY "Users can create notes" ON public.entity_notes
  WITH CHECK (
(EXISTS ( SELECT 1
   FROM (((profiles p
     JOIN app_roles ar ON ((ar.id = p.role_id)))
     JOIN role_permissions rp ON ((rp.role_id = ar.id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.create'::text))))
  );

ALTER POLICY "Users can delete notes" ON public.entity_notes
  USING (
(EXISTS ( SELECT 1
   FROM (((profiles p
     JOIN app_roles ar ON ((ar.id = p.role_id)))
     JOIN role_permissions rp ON ((rp.role_id = ar.id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.delete'::text))))
  );

ALTER POLICY "Users can update notes" ON public.entity_notes
  USING (
(EXISTS ( SELECT 1
   FROM (((profiles p
     JOIN app_roles ar ON ((ar.id = p.role_id)))
     JOIN role_permissions rp ON ((rp.role_id = ar.id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.update'::text))))
  );

ALTER POLICY "Users can view notes based on permissions" ON public.entity_notes
  USING (
((EXISTS ( SELECT 1
   FROM (((profiles p
     JOIN app_roles ar ON ((ar.id = p.role_id)))
     JOIN role_permissions rp ON ((rp.role_id = ar.id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.view'::text)))) AND ((is_confidential = false) OR (EXISTS ( SELECT 1
   FROM (((profiles p
     JOIN app_roles ar ON ((ar.id = p.role_id)))
     JOIN role_permissions rp ON ((rp.role_id = ar.id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.view_confidential'::text)))) OR (EXISTS ( SELECT 1
   FROM (profiles p
     JOIN app_roles ar ON ((ar.id = p.role_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ar.name)::text = ANY (entity_notes.confidential_roles)))))))
  );

ALTER POLICY "hierarchical_settings_read_own_resident" ON public.hierarchical_settings
  USING (
((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id
   FROM residents
  WHERE (residents.profile_id = (select auth.uid())))))
  );

ALTER POLICY "admins_insert_own_impersonation_sessions" ON public.impersonation_sessions
  WITH CHECK (
(admin_profile_id = (select auth.uid()))
  );

ALTER POLICY "admins_read_own_impersonation_sessions" ON public.impersonation_sessions
  USING (
(admin_profile_id = (select auth.uid()))
  );

ALTER POLICY "admins_update_own_impersonation_sessions" ON public.impersonation_sessions
  USING (
(admin_profile_id = (select auth.uid()))
  )
  WITH CHECK (
(admin_profile_id = (select auth.uid()))
  );

ALTER POLICY "in_app_notifications_own_delete" ON public.in_app_notifications
  USING (
(recipient_id = (select auth.uid()))
  );

ALTER POLICY "in_app_notifications_own_select" ON public.in_app_notifications
  USING (
(recipient_id = (select auth.uid()))
  );

ALTER POLICY "in_app_notifications_own_update" ON public.in_app_notifications
  USING (
(recipient_id = (select auth.uid()))
  )
  WITH CHECK (
(recipient_id = (select auth.uid()))
  );

ALTER POLICY "Approvers can decide late fee waivers" ON public.late_fee_waivers
  USING (
has_permission('billing.approve_late_fee_waiver'::text)
  )
  WITH CHECK (
(has_permission('billing.approve_late_fee_waiver'::text) AND ((status <> 'approved'::text) OR (requested_by <> (select auth.uid()))))
  );

ALTER POLICY "Request holders can create late fee waivers" ON public.late_fee_waivers
  WITH CHECK (
(has_permission('billing.request_late_fee_waiver'::text) AND (status = 'pending'::text) AND (requested_by = (select auth.uid())))
  );

ALTER POLICY "paystack_transactions_resident_select" ON public.paystack_transactions
  USING (
(resident_id IN ( SELECT residents.id
   FROM residents
  WHERE (residents.profile_id = (select auth.uid()))))
  );

ALTER POLICY "Users can update own profile" ON public.profiles
  USING (
((select auth.uid()) = id)
  )
  WITH CHECK (
((select auth.uid()) = id)
  );

ALTER POLICY "Users can view own profile" ON public.profiles
  USING (
((select auth.uid()) = id)
  );

ALTER POLICY "Users with report export can insert" ON public.report_archive
  WITH CHECK (
(EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
     JOIN app_permissions ap ON (((ap.id = rp.permission_id) AND ((ap.name)::text = 'reports.export'::text))))
  WHERE (p.id = (select auth.uid()))))
  );

ALTER POLICY "report_subscriptions_own_insert" ON public.report_subscriptions
  WITH CHECK (
(EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))
  );

ALTER POLICY "report_subscriptions_own_select" ON public.report_subscriptions
  USING (
(EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))
  );

ALTER POLICY "report_subscriptions_own_update" ON public.report_subscriptions
  USING (
(EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))
  )
  WITH CHECK (
(EXISTS ( SELECT 1
   FROM residents r
  WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))
  );

ALTER POLICY "Admins can manage role assignment rules" ON public.role_assignment_rules
  USING (
(EXISTS ( SELECT 1
   FROM ((profiles p
     JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
     JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
  WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text))))
  );

ALTER POLICY "Allow read access to all authenticated users" ON public.role_permissions
  USING (
((select auth.role()) = 'authenticated'::text)
  );

ALTER POLICY "Users can insert search logs" ON public.search_logs
  WITH CHECK (
((select auth.uid()) = user_id)
  );

ALTER POLICY "Users can view own audit log" ON public.two_factor_audit_log
  USING (
(profile_id = (select auth.uid()))
  );

ALTER POLICY "Service role can manage verification tokens" ON public.verification_tokens
  USING (
(((select auth.jwt()) ->> 'role'::text) = 'service_role'::text)
  );

ALTER POLICY "Users can view own verification tokens" ON public.verification_tokens
  USING (
(resident_id IN ( SELECT p.resident_id
   FROM profiles p
  WHERE (p.id = (select auth.uid()))))
  );

ALTER POLICY "Residents can view own wallet payment batch items" ON public.wallet_payment_batch_items
  USING (
(batch_id IN ( SELECT wallet_payment_batches.id
   FROM wallet_payment_batches
  WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id
           FROM residents
          WHERE (residents.profile_id = (select auth.uid()))))))
  );

ALTER POLICY "Residents can view own wallet payment batches" ON public.wallet_payment_batches
  USING (
(resident_id IN ( SELECT residents.id
   FROM residents
  WHERE (residents.profile_id = (select auth.uid()))))
  );

ALTER POLICY "Residents can view own transactions" ON public.wallet_transactions
  USING (
(wallet_id IN ( SELECT w.id
   FROM (resident_wallets w
     JOIN residents r ON ((r.id = w.resident_id)))
  WHERE (r.profile_id = (select auth.uid()))))
  );

COMMIT;
