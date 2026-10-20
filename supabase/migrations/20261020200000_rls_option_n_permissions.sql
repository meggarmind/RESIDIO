-- #63 (Option N): replace the last 62 role-name literal comparisons in RLS policies, and the
-- documents app_roles.name literal, with checks on new dedicated permissions
--
-- 20261020150000_rls_helper_initplan_and_exact_permissions.sql rewrote every policy whose
-- role-name literal had an exact same-domain permission. The 62 left behind compare
-- get_my_role_name() with a role set that only unrelated permissions hold (a houses insert would
-- have been gated by approvals.view). Owner decision 2026-10-20: give each table group its own
-- permission, seeded to exactly the role set the literal names today, so access does not change.
--
-- THIS CHANGES NO ACCESS. Scope is 63 policies on 26 tables, identical on Residio_Stage and
-- Residio_Prod (md5 of name, cmd, USING and WITH CHECK 743fe76c52aa175bac23d79f0b5e25bd, 2026-10-20):
--
-- * 15 new permissions, each granted to exactly the roles of the literal it replaces:
--     houses.manage_records             super_admin, chairman, vice_chairman, financial_officer
--     residents.manage_records          super_admin, chairman, vice_chairman, financial_officer
--     residents.delete_records          super_admin
--     security.view_active_residents    security_officer
--     security.manage_records           super_admin, chairman, vice_chairman, financial_officer
--     security.operate_records          super_admin, chairman, vice_chairman, financial_officer,
--                                       security_officer
--     security.write_contact_categories super_admin
--     billing.write_profiles            super_admin, chairman, vice_chairman, financial_officer
--     notifications.manage_delivery     super_admin, chairman, vice_chairman, financial_officer
--     payments.manage_reference_records super_admin, chairman, vice_chairman, financial_officer
--     payments.write_transaction_tags   super_admin
--     settings.write_property_reference super_admin, chairman, vice_chairman
--     settings.write_system             super_admin, chairman, vice_chairman
--     system.view_all_profiles          super_admin, chairman, vice_chairman
--     documents.view_all                every role except resident
--   The app's server actions check other permissions for the same tables. This migration does not
--   touch those checks; where the two disagree today, they still disagree.
-- * 62 policies: get_my_role_name() = ANY (ARRAY[...]) / = '<role>' becomes
--   (select has_permission('<permission>')). Both helpers require profiles.approval_status =
--   'active'; has_permission() also requires app_permissions.is_active, true for all 15.
-- * public.documents "Users can view documents based on permissions": the two EXISTS joins over
--   profiles, role_permissions, app_permissions and app_roles (documents.view, plus role <> or =
--   'resident') become documents.view AND (documents.view_all OR uncategorised OR a
--   resident-accessible category). The old policy read app_roles.name directly and did not check
--   approval_status; has_permission() does, so a pending or suspended account now sees no
--   documents through it. No such account exists on either database.
--
-- Verified by src/__tests__/rls-option-n-permissions.test.ts against a fixture of the live
-- definitions (src/__tests__/fixtures/rls-option-n-policies.json): every ALTER equals the original
-- with only the stated substitution, every permission's seeded role set equals the literal it
-- replaces, and the rollback restores every original verbatim. ALTER POLICY keeps each policy's
-- command, roles and permissive/restrictive flag.
--
-- VERIFY (after applying; expected results in brackets):
--
--   -- role-name literal comparisons left in any policy [0]
--   SELECT count(*) FROM pg_policies WHERE schemaname = 'public'
--     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'get_my_role_name\(\)';
--   -- app_roles.name compared in any policy [1: entity_notes "Users can view notes based on
--   -- permissions", which compares it with the row's confidential_roles column, not a literal]
--   SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public'
--     AND (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'ar\.name';
--   -- the 15 permissions and their grants [15 rows; role counts 4,4,1,1,4,5,1,4,4,4,1,3,3,3, and
--   -- documents.view_all = the number of non-resident roles, 7 today]
--   SELECT p.name, count(rp.role_id) FROM app_permissions p
--     LEFT JOIN role_permissions rp ON rp.permission_id = p.id
--     WHERE p.name IN ('houses.manage_records', 'residents.manage_records',
--       'residents.delete_records', 'security.view_active_residents', 'security.manage_records',
--       'security.operate_records', 'security.write_contact_categories', 'billing.write_profiles',
--       'notifications.manage_delivery', 'payments.manage_reference_records',
--       'payments.write_transaction_tags', 'settings.write_property_reference',
--       'settings.write_system', 'system.view_all_profiles', 'documents.view_all')
--     GROUP BY p.name;
--
-- ROLLBACK (run as one transaction; restores each policy verbatim, then drops the 15 permissions,
-- whose role_permissions rows go with them by ON DELETE CASCADE):
--

-- BEGIN;
--
-- ALTER POLICY "access_codes_insert_policy" ON public.access_codes
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "access_codes_select_policy" ON public.access_codes
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text]))
--   );
--
-- ALTER POLICY "access_codes_update_policy" ON public.access_codes
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text]))
--   );
--
-- ALTER POLICY "access_logs_insert_policy" ON public.access_logs
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text]))
--   );
--
-- ALTER POLICY "access_logs_select_policy" ON public.access_logs
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text]))
--   );
--
-- ALTER POLICY "access_logs_update_policy" ON public.access_logs
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can manage billing items" ON public.billing_items
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Users can view documents based on permissions" ON public.documents
--   USING (
-- ((is_archived = false) AND ((EXISTS ( SELECT 1
--    FROM (((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.view'::text) AND ((ar.name)::text <> 'resident'::text)))) OR (EXISTS ( SELECT 1
--    FROM (((profiles p
--      JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
--      JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--   WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.view'::text) AND ((ar.name)::text = 'resident'::text) AND ((documents.category_id IS NULL) OR (EXISTS ( SELECT 1
--            FROM document_categories dc
--           WHERE ((dc.id = documents.category_id) AND (dc.is_resident_accessible = true))))))))))
--   );
--
-- ALTER POLICY "Admins can view email logs" ON public.email_logs
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "escalation_states_insert" ON public.escalation_states
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "escalation_states_select" ON public.escalation_states
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "escalation_states_update" ON public.escalation_states
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   )
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can manage bank accounts" ON public.estate_bank_accounts
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "All authenticated can view active bank accounts" ON public.estate_bank_accounts
--   USING (
-- ((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])))
--   );
--
-- ALTER POLICY "hierarchical_settings_admin_all" ON public.hierarchical_settings
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Authorized users can insert ownership history" ON public.house_ownership_history
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins and chairmen can delete house types" ON public.house_types
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Admins and chairmen can insert house types" ON public.house_types
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Admins and chairmen can update house types" ON public.house_types
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "All authenticated users can view active house types" ON public.house_types
--   USING (
-- ((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])))
--   );
--
-- ALTER POLICY "Admins chairmen and fin sec can delete houses" ON public.houses
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen and fin sec can insert houses" ON public.houses
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen and fin sec can update houses" ON public.houses
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "All authenticated users can view active houses" ON public.houses
--   USING (
-- ((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])))
--   );
--
-- ALTER POLICY "notification_history_select" ON public.notification_history
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "notification_preferences_insert" ON public.notification_preferences
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "notification_preferences_update" ON public.notification_preferences
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   )
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "notification_queue_insert" ON public.notification_queue
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "notification_queue_select" ON public.notification_queue
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins and chairmen can view all profiles" ON public.profiles
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "House managers can create property transition requests" ON public.property_transition_requests
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "House managers can view property transition requests" ON public.property_transition_requests
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can delete resident houses" ON public.resident_houses
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can insert resident houses" ON public.resident_houses
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can update resident houses" ON public.resident_houses
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Security officers can view active resident houses" ON public.resident_houses
--   USING (
-- ((get_my_role_name() = 'security_officer'::text) AND (is_active = true))
--   );
--
-- ALTER POLICY "Admin, Chairman, Financial Secretary can manage aliases" ON public.resident_payment_aliases
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can insert residents" ON public.residents
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can update residents" ON public.residents
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Only admins can delete residents" ON public.residents
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "Security officers can view active residents" ON public.residents
--   USING (
-- ((get_my_role_name() = 'security_officer'::text) AND (account_status = 'active'::account_status))
--   );
--
-- ALTER POLICY "security_contact_categories_delete_policy" ON public.security_contact_categories
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "security_contact_categories_insert_policy" ON public.security_contact_categories
--   WITH CHECK (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "security_contact_categories_update_policy" ON public.security_contact_categories
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "security_contacts_insert_policy" ON public.security_contacts
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "security_contacts_select_policy" ON public.security_contacts
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text]))
--   );
--
-- ALTER POLICY "security_contacts_update_policy" ON public.security_contacts
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "Admins and chairmen can delete streets" ON public.streets
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Admins and chairmen can insert streets" ON public.streets
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Admins and chairmen can update streets" ON public.streets
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "All authenticated users can view active streets" ON public.streets
--   USING (
-- ((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text])))
--   );
--
-- ALTER POLICY "system_settings_insert_policy" ON public.system_settings
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "system_settings_update_policy" ON public.system_settings
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--   );
--
-- ALTER POLICY "Authenticated users can view transaction tags" ON public.transaction_tags
--   USING (
-- ((is_active = true) OR (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text])))
--   );
--
-- ALTER POLICY "Only admin can create transaction tags" ON public.transaction_tags
--   WITH CHECK (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "Only admin can delete transaction tags" ON public.transaction_tags
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "Only admin can update transaction tags" ON public.transaction_tags
--   USING (
-- (get_my_role_name() = 'super_admin'::text)
--   );
--
-- ALTER POLICY "visitor_vehicles_insert_policy" ON public.visitor_vehicles
--   WITH CHECK (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- ALTER POLICY "visitor_vehicles_select_policy" ON public.visitor_vehicles
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text, 'security_officer'::text]))
--   );
--
-- ALTER POLICY "visitor_vehicles_update_policy" ON public.visitor_vehicles
--   USING (
-- (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]))
--   );
--
-- DELETE FROM public.app_permissions WHERE name IN ('houses.manage_records', 'residents.manage_records', 'residents.delete_records', 'security.view_active_residents', 'security.manage_records', 'security.operate_records', 'security.write_contact_categories', 'billing.write_profiles', 'notifications.manage_delivery', 'payments.manage_reference_records', 'payments.write_transaction_tags', 'settings.write_property_reference', 'settings.write_system', 'system.view_all_profiles', 'documents.view_all');
--
-- COMMIT;

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('houses.manage_records', 'Manage House Records (database)', 'Database-level (RLS) access to create, update, delete and view all houses (including inactive), resident-house links, ownership history inserts and property transition requests. Seeded to the roles the replaced role-name check named.', 'houses', true),
  ('residents.manage_records', 'Manage Resident Records (database)', 'Database-level (RLS) access to create, update and view all residents, and to manage resident payment aliases.', 'residents', true),
  ('residents.delete_records', 'Delete Resident Records (database)', 'Database-level (RLS) access to delete resident rows.', 'residents', true),
  ('security.view_active_residents', 'View Active Residents (database)', 'Database-level (RLS) access to view active residents and active resident-house links, for security staff.', 'security', true),
  ('security.manage_records', 'Manage Security Records (database)', 'Database-level (RLS) access to create access codes and to create and update security contacts and visitor vehicles.', 'security', true),
  ('security.operate_records', 'Operate Security Records (database)', 'Database-level (RLS) access to view and update access codes, record, view and update access logs, and view security contacts and visitor vehicles.', 'security', true),
  ('security.write_contact_categories', 'Write Security Contact Categories (database)', 'Database-level (RLS) access to create, update and delete security contact categories.', 'security', true),
  ('billing.write_profiles', 'Write Billing Profiles (database)', 'Database-level (RLS) access to manage billing profiles and billing items.', 'billing', true),
  ('notifications.manage_delivery', 'Manage Notification Delivery (database)', 'Database-level (RLS) access to the notification queue, notification history, email logs, escalation states and notification preference writes.', 'notifications', true),
  ('payments.manage_reference_records', 'Manage Payment Reference Records (database)', 'Database-level (RLS) access to manage estate bank accounts and to view inactive bank accounts and inactive transaction tags.', 'payments', true),
  ('payments.write_transaction_tags', 'Write Transaction Tags (database)', 'Database-level (RLS) access to create, update and delete transaction tags.', 'payments', true),
  ('settings.write_property_reference', 'Write Property Reference Data (database)', 'Database-level (RLS) access to create, update and delete house types and streets, and to view inactive ones.', 'settings', true),
  ('settings.write_system', 'Write System Settings (database)', 'Database-level (RLS) access to insert and update system settings and to manage hierarchical settings.', 'settings', true),
  ('system.view_all_profiles', 'View All Profiles (database)', 'Database-level (RLS) access to view every user profile.', 'system', true),
  ('documents.view_all', 'View All Document Categories', 'See documents in every category. Without it, a documents.view holder sees only uncategorised documents and resident-accessible categories.', 'documents', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'houses.manage_records'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'residents.manage_records'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'residents.delete_records'
  AND r.name IN ('super_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'security.view_active_residents'
  AND r.name IN ('security_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'security.manage_records'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'security.operate_records'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer', 'security_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'security.write_contact_categories'
  AND r.name IN ('super_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'billing.write_profiles'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'notifications.manage_delivery'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'payments.manage_reference_records'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'payments.write_transaction_tags'
  AND r.name IN ('super_admin')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'settings.write_property_reference'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'settings.write_system'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'system.view_all_profiles'
  AND r.name IN ('super_admin', 'chairman', 'vice_chairman')
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.app_roles r CROSS JOIN public.app_permissions p
WHERE p.name = 'documents.view_all'
  AND r.name <> 'resident'
ON CONFLICT (role_id, permission_id) DO NOTHING;

ALTER POLICY "access_codes_insert_policy" ON public.access_codes
  WITH CHECK (
((select has_permission('security.manage_records'::text)))
  );

ALTER POLICY "access_codes_select_policy" ON public.access_codes
  USING (
((select has_permission('security.operate_records'::text)))
  );

ALTER POLICY "access_codes_update_policy" ON public.access_codes
  USING (
((select has_permission('security.operate_records'::text)))
  );

ALTER POLICY "access_logs_insert_policy" ON public.access_logs
  WITH CHECK (
((select has_permission('security.operate_records'::text)))
  );

ALTER POLICY "access_logs_select_policy" ON public.access_logs
  USING (
((select has_permission('security.operate_records'::text)))
  );

ALTER POLICY "access_logs_update_policy" ON public.access_logs
  USING (
((select has_permission('security.operate_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can manage billing items" ON public.billing_items
  USING (
((select has_permission('billing.write_profiles'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles
  USING (
((select has_permission('billing.write_profiles'::text)))
  );

ALTER POLICY "Users can view documents based on permissions" ON public.documents
  USING (
((is_archived = false) AND (select has_permission('documents.view'::text)) AND ((select has_permission('documents.view_all'::text)) OR (category_id IS NULL) OR (EXISTS ( SELECT 1
   FROM document_categories dc
  WHERE ((dc.id = documents.category_id) AND (dc.is_resident_accessible = true))))))
  );

ALTER POLICY "Admins can view email logs" ON public.email_logs
  USING (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "escalation_states_insert" ON public.escalation_states
  WITH CHECK (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "escalation_states_select" ON public.escalation_states
  USING (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "escalation_states_update" ON public.escalation_states
  USING (
((select has_permission('notifications.manage_delivery'::text)))
  )
  WITH CHECK (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can manage bank accounts" ON public.estate_bank_accounts
  USING (
((select has_permission('payments.manage_reference_records'::text)))
  );

ALTER POLICY "All authenticated can view active bank accounts" ON public.estate_bank_accounts
  USING (
((is_active = true) OR ((select has_permission('payments.manage_reference_records'::text))))
  );

ALTER POLICY "hierarchical_settings_admin_all" ON public.hierarchical_settings
  USING (
((select has_permission('settings.write_system'::text)))
  );

ALTER POLICY "Authorized users can insert ownership history" ON public.house_ownership_history
  WITH CHECK (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Admins and chairmen can delete house types" ON public.house_types
  USING (
((select has_permission('settings.write_property_reference'::text)))
  );

ALTER POLICY "Admins and chairmen can insert house types" ON public.house_types
  WITH CHECK (
((select has_permission('settings.write_property_reference'::text)))
  );

ALTER POLICY "Admins and chairmen can update house types" ON public.house_types
  USING (
((select has_permission('settings.write_property_reference'::text)))
  );

ALTER POLICY "All authenticated users can view active house types" ON public.house_types
  USING (
((is_active = true) OR ((select has_permission('settings.write_property_reference'::text))))
  );

ALTER POLICY "Admins chairmen and fin sec can delete houses" ON public.houses
  USING (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen and fin sec can insert houses" ON public.houses
  WITH CHECK (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen and fin sec can update houses" ON public.houses
  USING (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "All authenticated users can view active houses" ON public.houses
  USING (
((is_active = true) OR ((select has_permission('houses.manage_records'::text))))
  );

ALTER POLICY "notification_history_select" ON public.notification_history
  USING (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "notification_preferences_insert" ON public.notification_preferences
  WITH CHECK (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "notification_preferences_update" ON public.notification_preferences
  USING (
((select has_permission('notifications.manage_delivery'::text)))
  )
  WITH CHECK (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "notification_queue_insert" ON public.notification_queue
  WITH CHECK (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "notification_queue_select" ON public.notification_queue
  USING (
((select has_permission('notifications.manage_delivery'::text)))
  );

ALTER POLICY "Admins and chairmen can view all profiles" ON public.profiles
  USING (
((select has_permission('system.view_all_profiles'::text)))
  );

ALTER POLICY "House managers can create property transition requests" ON public.property_transition_requests
  WITH CHECK (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "House managers can view property transition requests" ON public.property_transition_requests
  USING (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can delete resident houses" ON public.resident_houses
  USING (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can insert resident houses" ON public.resident_houses
  WITH CHECK (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can update resident houses" ON public.resident_houses
  USING (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
  USING (
((select has_permission('houses.manage_records'::text)))
  );

ALTER POLICY "Security officers can view active resident houses" ON public.resident_houses
  USING (
(((select has_permission('security.view_active_residents'::text))) AND (is_active = true))
  );

ALTER POLICY "Admin, Chairman, Financial Secretary can manage aliases" ON public.resident_payment_aliases
  USING (
((select has_permission('residents.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can insert residents" ON public.residents
  WITH CHECK (
((select has_permission('residents.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can update residents" ON public.residents
  USING (
((select has_permission('residents.manage_records'::text)))
  );

ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
  USING (
((select has_permission('residents.manage_records'::text)))
  );

ALTER POLICY "Only admins can delete residents" ON public.residents
  USING (
((select has_permission('residents.delete_records'::text)))
  );

ALTER POLICY "Security officers can view active residents" ON public.residents
  USING (
(((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status))
  );

ALTER POLICY "security_contact_categories_delete_policy" ON public.security_contact_categories
  USING (
((select has_permission('security.write_contact_categories'::text)))
  );

ALTER POLICY "security_contact_categories_insert_policy" ON public.security_contact_categories
  WITH CHECK (
((select has_permission('security.write_contact_categories'::text)))
  );

ALTER POLICY "security_contact_categories_update_policy" ON public.security_contact_categories
  USING (
((select has_permission('security.write_contact_categories'::text)))
  );

ALTER POLICY "security_contacts_insert_policy" ON public.security_contacts
  WITH CHECK (
((select has_permission('security.manage_records'::text)))
  );

ALTER POLICY "security_contacts_select_policy" ON public.security_contacts
  USING (
((select has_permission('security.operate_records'::text)))
  );

ALTER POLICY "security_contacts_update_policy" ON public.security_contacts
  USING (
((select has_permission('security.manage_records'::text)))
  );

ALTER POLICY "Admins and chairmen can delete streets" ON public.streets
  USING (
((select has_permission('settings.write_property_reference'::text)))
  );

ALTER POLICY "Admins and chairmen can insert streets" ON public.streets
  WITH CHECK (
((select has_permission('settings.write_property_reference'::text)))
  );

ALTER POLICY "Admins and chairmen can update streets" ON public.streets
  USING (
((select has_permission('settings.write_property_reference'::text)))
  );

ALTER POLICY "All authenticated users can view active streets" ON public.streets
  USING (
((is_active = true) OR ((select has_permission('settings.write_property_reference'::text))))
  );

ALTER POLICY "system_settings_insert_policy" ON public.system_settings
  WITH CHECK (
((select has_permission('settings.write_system'::text)))
  );

ALTER POLICY "system_settings_update_policy" ON public.system_settings
  USING (
((select has_permission('settings.write_system'::text)))
  );

ALTER POLICY "Authenticated users can view transaction tags" ON public.transaction_tags
  USING (
((is_active = true) OR ((select has_permission('payments.manage_reference_records'::text))))
  );

ALTER POLICY "Only admin can create transaction tags" ON public.transaction_tags
  WITH CHECK (
((select has_permission('payments.write_transaction_tags'::text)))
  );

ALTER POLICY "Only admin can delete transaction tags" ON public.transaction_tags
  USING (
((select has_permission('payments.write_transaction_tags'::text)))
  );

ALTER POLICY "Only admin can update transaction tags" ON public.transaction_tags
  USING (
((select has_permission('payments.write_transaction_tags'::text)))
  );

ALTER POLICY "visitor_vehicles_insert_policy" ON public.visitor_vehicles
  WITH CHECK (
((select has_permission('security.manage_records'::text)))
  );

ALTER POLICY "visitor_vehicles_select_policy" ON public.visitor_vehicles
  USING (
((select has_permission('security.operate_records'::text)))
  );

ALTER POLICY "visitor_vehicles_update_policy" ON public.visitor_vehicles
  USING (
((select has_permission('security.manage_records'::text)))
  );

COMMIT;
