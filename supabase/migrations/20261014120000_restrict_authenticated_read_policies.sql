-- ============================================================================
-- Migration: replace USING (true) SELECT policies on 8 tables with permission
--            predicates; declare 5 tables as reference data
-- ============================================================================
-- Issue #237 (Refs, does not close: system_settings is still undecided).
-- Scope set by the owner on 2026-10-14. The issue body's "22 tables" is stale;
-- the live list measured on Residio_Stage and Residio_Prod (identical) is
-- the eight below plus the five declared tables and system_settings (pending).
-- (invoice_generation_locks, also on the issue's list, was dropped entirely by
-- 20260908000000_drop_invoice_generation_locks.sql.)
--
-- Mechanism: each table carries a PERMISSIVE SELECT policy TO authenticated
-- with USING (true), so any signed-in account, including a resident, reads
-- every row. PERMISSIVE policies OR with their siblings, so the open policy is
-- DROPPED and replaced rather than narrowed alongside.
--
-- Every permission name below was verified to exist in a seeding migration
-- (has_permission() returns false silently for an unknown name, which would
-- deny everyone):
--   reports.view_financial       20251222000000_create_rbac_system.sql
--   system.manage_roles          20251222000000_create_rbac_system.sql
--   system.assign_roles          20251222000000_create_rbac_system.sql
--   view_expenditure             20260114225000_create_expenditure_module.sql
--   billing.view                 20251222000000_create_rbac_system.sql
--   billing.create_invoice       20251222000000_create_rbac_system.sql
--   houses.view                  20251222000000_create_rbac_system.sql
--   houses.update                20251222000000_create_rbac_system.sql
--   houses.assign_resident       20251222000000_create_rbac_system.sql
--   residents.view               20251222000000_create_rbac_system.sql
--   notifications.view           20251231120200_add_announcements_permissions_data.sql
--   two_factor.manage_policies   20260111102822_add_two_factor_permissions_data.sql
--
-- ---------------------------------------------------------------------------
-- Table | old policy dropped | new policy | new predicate
-- ---------------------------------------------------------------------------
-- resident_payment_cadence_summary
--   drop "Authenticated users can view payment cadence summary"
--   new  "resident_payment_cadence_summary_select"
--   has_permission('reports.view_financial')
--   (getPaymentCadenceAnalytics reads it for the analytics payment-behaviour tab)
--
-- report_archive
--   drop "Authenticated users can view report archive"
--   new  "report_archive_select"
--   has_permission('reports.view_financial')
--   (getReportArchive requires reports.view_financial; the download route and
--   the archive writer use the service-role client and are unaffected. The
--   INSERT policy, reports.export, is untouched.)
--
-- role_assignment_rules
--   drop "Authenticated users can read role assignment rules"
--   new  "role_assignment_rules_select"
--   has_permission('system.manage_roles') OR has_permission('system.assign_roles')
--   (the settings UI needs manage_roles; assignRoleToUser requires
--   assign_roles and enforces the rules by READING this table with the
--   caller's JWT. If assign_roles were not admitted, the read would return no
--   row and checkRoleAssignmentAllowed would default to ALLOWED, silently
--   failing open. The FOR ALL manage policy is untouched.)
--
-- petty_cash_accounts
--   drop "Authenticated users can view petty cash accounts"
--   new  "petty_cash_accounts_select"
--   has_permission('view_expenditure') OR has_permission('billing.view')
--   (the expenditure page requires view_expenditure; the admin dashboard
--   snapshot, which requires billing.view, sums active petty cash balances
--   into "Estate Cash" and would silently under-report without billing.view.
--   The FOR ALL manage_expenditure policy is untouched.)
--
-- house_levy_history
--   drop "house_levy_history_select_policy"
--   new  "house_levy_history_select_policy" (same name, new predicate)
--   has_permission('billing.view') OR has_permission('billing.create_invoice')
--     OR has_permission('houses.update')
--   (generateLeviesForHouse requires billing.create_invoice; updateHouse reads
--   it through hasExistingDevelopmentLevy and requires houses.update.)
--
-- house_ownership_history
--   drop "Authenticated users can view ownership history"
--   new  "house_ownership_history_select"
--   has_permission('houses.view') OR has_permission('houses.assign_resident')
--   (getOwnershipHistory backs the houses UI; the assign / move-out / transfer
--   actions require houses.assign_resident or houses.update and read the table
--   with the caller's JWT. All seeded roles that hold those also hold
--   houses.view, so this is the view-level permission plus the assign guard.)
--
-- two_factor_policies
--   drop "Authenticated users can view policies"
--   new  "two_factor_policies_select"
--   has_permission('two_factor.manage_policies')
--   (every server-side read, including the per-user status check in
--   get-status.ts, uses the service-role client; no signed-in user reads it
--   directly. The RESTRICTIVE is_approved() policy from 20260830090000 and the
--   service_role policy are untouched.)
--
-- notification_preferences
--   drop "notification_preferences_select"
--   new  "notification_preferences_select" (same name, new predicate)
--   has_permission('notifications.view') OR has_permission('residents.view')
--     OR resident_id = public.get_my_resident_id()
--   (own-row clause keeps the resident's read of their own preferences, as the
--   sibling "Residents can view own notification preferences" does; column
--   verified in 20251223000000_create_notification_system.sql. The admin
--   permissions mirror getResidentPreferences. Preference writes are
--   unchanged.)
--
-- ---------------------------------------------------------------------------
-- Declared reference data -- NO policy change
-- ---------------------------------------------------------------------------
-- These five tables hold estate-wide reference data every signed-in account is
-- meant to read. Their USING (true) SELECT policy TO authenticated is
-- deliberate, not an oversight:
--   billing_items                 catalogue of billable items
--   billing_profiles              levy profile catalogue
--   notification_templates        message templates
--   notification_schedules        reminder schedule definitions
--   security_contact_categories   dropdown of contact categories
-- src/__tests__/authenticated-read-closure.test.ts pins this list.
-- system_settings is NOT decided and is intentionally untouched here.
--
-- ---------------------------------------------------------------------------
-- Who loses access
-- ---------------------------------------------------------------------------
-- Residents and every non-admin account lose estate-wide SELECT on all eight
-- tables (notification_preferences: a resident keeps their OWN rows). Roles
-- that keep access, per the seeding migrations (live role grants can differ;
-- confirm with the role-access matrix probe after applying):
--   reports.view_financial       super_admin, chairman, vice_chairman,
--                                financial_officer, project_manager
--   system.manage_roles /
--   system.assign_roles          super_admin
--   view_expenditure             super_admin, chairman, vice_chairman,
--                                financial_officer
--   billing.view                 super_admin, chairman, vice_chairman,
--                                financial_officer, secretary, project_manager
--   houses.view                  all seven admin roles
--   two_factor.manage_policies   super_admin, chairman
--   notifications.view           super_admin, chairman, vice_chairman,
--                                financial_officer, security_officer
-- Narrowing among admin-side roles: secretary and security_officer lose the
-- payment cadence summary and the report archive; every role except
-- super_admin loses role_assignment_rules; every role except super_admin and
-- chairman loses two_factor_policies; security_officer loses
-- petty_cash_accounts (no view_expenditure, no billing.view).
--
-- service_role policies are untouched (service_role bypasses RLS).
--
-- ---------------------------------------------------------------------------
-- ROLLBACK: restores the exact prior policies (name, command, roles, USING
-- true). Run the whole block in one transaction.
-- ---------------------------------------------------------------------------
-- BEGIN;
-- DROP POLICY IF EXISTS "resident_payment_cadence_summary_select" ON public.resident_payment_cadence_summary;
-- DROP POLICY IF EXISTS "Authenticated users can view payment cadence summary" ON public.resident_payment_cadence_summary;
-- CREATE POLICY "Authenticated users can view payment cadence summary"
--   ON public.resident_payment_cadence_summary FOR SELECT TO authenticated
--   USING (true);
--
-- DROP POLICY IF EXISTS "report_archive_select" ON public.report_archive;
-- DROP POLICY IF EXISTS "Authenticated users can view report archive" ON public.report_archive;
-- CREATE POLICY "Authenticated users can view report archive"
--   ON public.report_archive FOR SELECT TO authenticated
--   USING (true);
--
-- DROP POLICY IF EXISTS "role_assignment_rules_select" ON public.role_assignment_rules;
-- DROP POLICY IF EXISTS "Authenticated users can read role assignment rules" ON public.role_assignment_rules;
-- CREATE POLICY "Authenticated users can read role assignment rules"
--   ON public.role_assignment_rules FOR SELECT TO authenticated
--   USING (true);
--
-- DROP POLICY IF EXISTS "petty_cash_accounts_select" ON public.petty_cash_accounts;
-- DROP POLICY IF EXISTS "Authenticated users can view petty cash accounts" ON public.petty_cash_accounts;
-- CREATE POLICY "Authenticated users can view petty cash accounts"
--   ON public.petty_cash_accounts FOR SELECT TO authenticated
--   USING (true);
--
-- DROP POLICY IF EXISTS "house_levy_history_select_policy" ON public.house_levy_history;
-- CREATE POLICY "house_levy_history_select_policy"
--   ON public.house_levy_history FOR SELECT TO authenticated
--   USING (true);
--
-- DROP POLICY IF EXISTS "house_ownership_history_select" ON public.house_ownership_history;
-- DROP POLICY IF EXISTS "Authenticated users can view ownership history" ON public.house_ownership_history;
-- CREATE POLICY "Authenticated users can view ownership history"
--   ON public.house_ownership_history FOR SELECT TO authenticated
--   USING (true);
--
-- DROP POLICY IF EXISTS "two_factor_policies_select" ON public.two_factor_policies;
-- DROP POLICY IF EXISTS "Authenticated users can view policies" ON public.two_factor_policies;
-- CREATE POLICY "Authenticated users can view policies"
--   ON public.two_factor_policies FOR SELECT TO authenticated
--   USING (true);
--
-- DROP POLICY IF EXISTS "notification_preferences_select" ON public.notification_preferences;
-- CREATE POLICY "notification_preferences_select"
--   ON public.notification_preferences FOR SELECT TO authenticated
--   USING (true);
-- COMMIT;

BEGIN;

-- resident_payment_cadence_summary ------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view payment cadence summary" ON public.resident_payment_cadence_summary;
DROP POLICY IF EXISTS "resident_payment_cadence_summary_select" ON public.resident_payment_cadence_summary;
CREATE POLICY "resident_payment_cadence_summary_select"
  ON public.resident_payment_cadence_summary FOR SELECT TO authenticated
  USING (public.has_permission('reports.view_financial'));

-- report_archive -------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view report archive" ON public.report_archive;
DROP POLICY IF EXISTS "report_archive_select" ON public.report_archive;
CREATE POLICY "report_archive_select"
  ON public.report_archive FOR SELECT TO authenticated
  USING (public.has_permission('reports.view_financial'));

-- role_assignment_rules ------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can read role assignment rules" ON public.role_assignment_rules;
DROP POLICY IF EXISTS "role_assignment_rules_select" ON public.role_assignment_rules;
CREATE POLICY "role_assignment_rules_select"
  ON public.role_assignment_rules FOR SELECT TO authenticated
  USING (public.has_permission('system.manage_roles') OR public.has_permission('system.assign_roles'));

-- petty_cash_accounts --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view petty cash accounts" ON public.petty_cash_accounts;
DROP POLICY IF EXISTS "petty_cash_accounts_select" ON public.petty_cash_accounts;
CREATE POLICY "petty_cash_accounts_select"
  ON public.petty_cash_accounts FOR SELECT TO authenticated
  USING (public.has_permission('view_expenditure') OR public.has_permission('billing.view'));

-- house_levy_history ---------------------------------------------------------
DROP POLICY IF EXISTS "house_levy_history_select_policy" ON public.house_levy_history;
CREATE POLICY "house_levy_history_select_policy"
  ON public.house_levy_history FOR SELECT TO authenticated
  USING (public.has_permission('billing.view') OR public.has_permission('billing.create_invoice') OR public.has_permission('houses.update'));

-- house_ownership_history ----------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view ownership history" ON public.house_ownership_history;
DROP POLICY IF EXISTS "house_ownership_history_select" ON public.house_ownership_history;
CREATE POLICY "house_ownership_history_select"
  ON public.house_ownership_history FOR SELECT TO authenticated
  USING (public.has_permission('houses.view') OR public.has_permission('houses.assign_resident'));

-- two_factor_policies --------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view policies" ON public.two_factor_policies;
DROP POLICY IF EXISTS "two_factor_policies_select" ON public.two_factor_policies;
CREATE POLICY "two_factor_policies_select"
  ON public.two_factor_policies FOR SELECT TO authenticated
  USING (public.has_permission('two_factor.manage_policies'));

-- notification_preferences ---------------------------------------------------
DROP POLICY IF EXISTS "notification_preferences_select" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (public.has_permission('notifications.view') OR public.has_permission('residents.view') OR resident_id = public.get_my_resident_id());

COMMIT;
