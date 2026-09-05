-- ============================================================================
-- Migration: 15 announcement / notification / reporting / finance RLS
--            policies follow has_permission(), not the legacy profiles.role
--            column
-- ============================================================================
-- Purpose: Issue #187 (epic #182), same job as #186 (part A) for a different
--          fifteen policies across ten tables. Each still authorizes by
--          reading `profiles.role` directly, bypassing the RBAC system
--          (app_roles / role_permissions / has_permission()) entirely.
--          `profiles.role` is the dead vocabulary per ADR-0007:
--          get_my_role() stopped reading it, handle_new_user() writes NULL to
--          it, and epic #182 drops it. Any policy still reading it silently
--          changes meaning the moment that column goes.
--
--          Each policy below keeps its exact name and command and is rewritten
--          to a single public.has_permission('<name>') call. Names are kept so
--          the live policy set stays diffable by name against the #185
--          role-access matrix baseline.
--
-- Permission choice per policy (each verified against role_permissions before
-- this migration was written -- do NOT re-derive it from the policy's old role
-- list, which is the very thing being retired):
--
--   announcements                  SELECT  announcements_admin_select        announcements.view
--   announcements                  INSERT  announcements_admin_insert        announcements.create
--   announcements                  UPDATE  announcements_admin_update        announcements.update
--   announcements                  DELETE  announcements_admin_delete        announcements.delete
--   announcement_categories        ALL     announcement_categories_admin_all announcements.manage_categories
--   announcement_read_receipts     SELECT  read_receipts_admin_select        announcements.publish
--   message_templates              ALL     message_templates_admin_all       announcements.manage_templates
--   in_app_notifications           INSERT  in_app_notifications_admin_insert notifications.send
--   report_subscriptions           SELECT  report_subscriptions_admin_select report_subscriptions.view
--   report_subscriptions           INSERT  report_subscriptions_admin_insert report_subscriptions.manage
--   report_subscriptions           UPDATE  report_subscriptions_admin_update report_subscriptions.manage
--   search_logs                    SELECT  "Admins can view search logs"     settings.view_audit_logs
--   late_fee_log                   SELECT  "Admins can view late fee log"    billing.apply_late_fees
--   late_fee_waivers               ALL     "Admins can manage late fee waivers" billing.request_late_fee_waiver
--   petty_cash_accounts            ALL     "Admins can manage petty cash accounts" manage_expenditure
--
-- Access change (deliberate -- this is mostly a widening, not pure cleanup):
--
--   A role with no legacy equivalent holds `profiles.role = NULL` (see
--   LEGACY_ROLE_MAP in src/actions/roles/assign-role.ts, which maps only
--   super_admin -> admin, chairman -> chairman, financial_officer ->
--   financial_secretary and security_officer -> security_officer). vice_chairman,
--   secretary and project_manager have no legacy bucket at all, so they are
--   DENIED by all fifteen of these policies today no matter what they hold in
--   RBAC. Rewriting to has_permission() grants access wherever the permission
--   is actually held -- most rewrites below therefore grant vice_chairman
--   access. That is the point of the epic, not a side effect to correct.
--
--   Two cells move further than a bucket-fill and are called out individually
--   because they widen the ADMITTED set past what the legacy role list ever
--   named:
--
--     * announcements_admin_delete: the legacy predicate admitted `admin`
--       alone. announcements.delete is held by chairman, who already holds
--       create/update/publish on the same table -- being unable to delete
--       what you can create was the gap, not a boundary worth preserving.
--     * report_subscriptions_admin_select: the legacy predicate admitted
--       `admin` alone. report_subscriptions.view is held by chairman and
--       vice_chairman.
--
--   One cell moves the other way and is a deliberate, owner-approved
--   narrowing, not an oversight:
--
--     * search_logs ("Admins can view search logs"): the legacy predicate
--       admitted admin, chairman and financial_secretary. settings.view_audit_logs
--       is held only by super_admin and vice_chairman, so this policy drops
--       chairman and financial_officer. This aligns the RLS policy with the
--       app-layer guard on the same rows: getSearchAnalytics() in
--       src/actions/analytics/get-search-analytics.ts:24 already calls
--       authorizePermission(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS), because
--       search_logs records what each admin typed and who typed it -- audit
--       trail data, not general reporting data.
--
--   Two policies preserve their exact legacy audience -- no movement at all,
--   not even vice_chairman -- because neither permission below is held by
--   vice_chairman:
--
--     * late_fee_waivers ("Admins can manage late fee waivers"), on
--       billing.request_late_fee_waiver.
--     * petty_cash_accounts ("Admins can manage petty cash accounts"), on
--       manage_expenditure.
--
--   read_receipts_admin_select is worth its own note because the permission
--   chosen is not the obvious one: announcement_read_receipts identifies which
--   resident read which announcement and when -- personal data, not merely
--   announcement content. announcements.view (the seemingly natural fit) is
--   also held by financial_officer and security_officer, which would widen who
--   sees that personal data. announcements.publish reproduces the same
--   admin+chairman legacy pattern as the rest of this migration -- it is not
--   one of the two zero-movement cases above, and still gains vice_chairman
--   like every other policy here.
--
-- petty_cash_accounts uses the BARE permission name `manage_expenditure`, not
-- `finance.manage_expenditure` -- that category-prefixed name does not exist
-- in app_permissions. Six permissions in this database are stored without a
-- category prefix, and has_permission() returns false for an unknown name
-- instead of erroring, so a wrong prefix here would compile, apply, and deny
-- everyone silently.
--
-- has_permission() is SECURITY DEFINER (20251222000000_create_rbac_system.sql)
-- and additionally requires profiles.approval_status = 'active'
-- (20260829100200_gate_auth_helpers_on_approval_status.sql). That matters
-- twice here: evaluating it inside these policies does not recurse through RLS
-- -- and every predicate it replaces reads `profiles`, the table whose own RLS
-- would otherwise be in the loop -- and a pending or suspended account is not
-- admitted even if its role holds the permission.
--
-- `TO authenticated` is required, not cosmetic: has_permission(text) has
-- EXECUTE revoked from `anon` (20260829100200), so a policy with no TO clause
-- applies to PUBLIC including anon, and an unauthenticated query would raise
-- "permission denied for function has_permission" (a 500) instead of returning
-- an empty set. Scoping to `authenticated` keeps the failure mode an empty
-- result set.
--
-- FOR ALL policies set BOTH USING and WITH CHECK, and so do the two UPDATE
-- policies. Postgres defaults WITH CHECK to the USING expression when it is
-- omitted (that is how the legacy late_fee_waivers and petty_cash_accounts
-- policies got by with only USING, per the prior definitions below), so
-- stating it explicitly here is not a behaviour change -- it is stated so a
-- later hand-edit of one clause cannot leave the read and write sides silently
-- disagreeing.
--
-- Written to be safely re-runnable: every policy name is dropped with
-- IF EXISTS immediately before its CREATE POLICY, and the names are unchanged,
-- so a second apply does not abort with 42710 (duplicate policy).
--
-- This migration is NOT applied by the authoring session. Apply and verify
-- manually, then check it into the applied-migrations record per
-- docs/agents/migrations-on-merge.md.
-- ============================================================================

-- ============================================================================
-- ROLLBACK: restores all fifteen previous policy definitions
-- ============================================================================
-- Predicates transcribed from the live pg_policies definitions as they stood
-- before this migration, not from the original CREATE TABLE migrations.
--
-- late_fee_waivers and petty_cash_accounts are FOR ALL policies restored with
-- ONLY a USING clause -- that is what they had live (WITH CHECK: none),
-- Postgres having defaulted it to the USING expression. Adding an explicit
-- WITH CHECK on the way back would not change runtime behaviour, but it would
-- not be what was live either, so it is left out.
--
-- These are SQL comments, not executable statements. The legacy-role migration
-- ratchet (src/__tests__/legacy-role-migration-ratchet.test.ts) strips comments
-- before scanning, so preserving the old predicates here does not put this file
-- on its allowlist.
--
-- BEGIN;
--
-- -- ---- announcements -------------------------------------------------------
-- DROP POLICY IF EXISTS "announcements_admin_select" ON public.announcements;
-- CREATE POLICY "announcements_admin_select"
--   ON public.announcements FOR SELECT TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])))));
--
-- DROP POLICY IF EXISTS "announcements_admin_insert" ON public.announcements;
-- CREATE POLICY "announcements_admin_insert"
--   ON public.announcements FOR INSERT TO authenticated
--   WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))));
--
-- DROP POLICY IF EXISTS "announcements_admin_update" ON public.announcements;
-- CREATE POLICY "announcements_admin_update"
--   ON public.announcements FOR UPDATE TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))))
--   WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))));
--
-- DROP POLICY IF EXISTS "announcements_admin_delete" ON public.announcements;
-- CREATE POLICY "announcements_admin_delete"
--   ON public.announcements FOR DELETE TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::user_role))));
--
-- -- ---- categories, read receipts, templates --------------------------------
-- DROP POLICY IF EXISTS "announcement_categories_admin_all" ON public.announcement_categories;
-- CREATE POLICY "announcement_categories_admin_all"
--   ON public.announcement_categories FOR ALL TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))))
--   WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))));
--
-- DROP POLICY IF EXISTS "read_receipts_admin_select" ON public.announcement_read_receipts;
-- CREATE POLICY "read_receipts_admin_select"
--   ON public.announcement_read_receipts FOR SELECT TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))));
--
-- DROP POLICY IF EXISTS "message_templates_admin_all" ON public.message_templates;
-- CREATE POLICY "message_templates_admin_all"
--   ON public.message_templates FOR ALL TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))))
--   WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))));
--
-- -- ---- notifications ---------------------------------------------------------
-- DROP POLICY IF EXISTS "in_app_notifications_admin_insert" ON public.in_app_notifications;
-- CREATE POLICY "in_app_notifications_admin_insert"
--   ON public.in_app_notifications FOR INSERT TO authenticated
--   WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role, 'security_officer'::user_role])))));
--
-- -- ---- report subscriptions ---------------------------------------------------
-- DROP POLICY IF EXISTS "report_subscriptions_admin_select" ON public.report_subscriptions;
-- CREATE POLICY "report_subscriptions_admin_select"
--   ON public.report_subscriptions FOR SELECT TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = 'admin'::user_role))));
--
-- DROP POLICY IF EXISTS "report_subscriptions_admin_insert" ON public.report_subscriptions;
-- CREATE POLICY "report_subscriptions_admin_insert"
--   ON public.report_subscriptions FOR INSERT TO authenticated
--   WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))));
--
-- DROP POLICY IF EXISTS "report_subscriptions_admin_update" ON public.report_subscriptions;
-- CREATE POLICY "report_subscriptions_admin_update"
--   ON public.report_subscriptions FOR UPDATE TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))))
--   WITH CHECK (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role])))));
--
-- -- ---- search logs, late fees, petty cash --------------------------------------
-- DROP POLICY IF EXISTS "Admins can view search logs" ON public.search_logs;
-- CREATE POLICY "Admins can view search logs"
--   ON public.search_logs FOR SELECT TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])))));
--
-- DROP POLICY IF EXISTS "Admins can view late fee log" ON public.late_fee_log;
-- CREATE POLICY "Admins can view late fee log"
--   ON public.late_fee_log FOR SELECT TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])))));
--
-- DROP POLICY IF EXISTS "Admins can manage late fee waivers" ON public.late_fee_waivers;
-- CREATE POLICY "Admins can manage late fee waivers"
--   ON public.late_fee_waivers FOR ALL TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = auth.uid()) AND (p.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])))));
--
-- DROP POLICY IF EXISTS "Admins can manage petty cash accounts" ON public.petty_cash_accounts;
-- CREATE POLICY "Admins can manage petty cash accounts"
--   ON public.petty_cash_accounts FOR ALL TO authenticated
--   USING (EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = auth.uid()) AND (profiles.role = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role])))));
--
-- COMMIT;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Announcements
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "announcements_admin_select" ON public.announcements;
CREATE POLICY "announcements_admin_select"
  ON public.announcements FOR SELECT TO authenticated
  USING (public.has_permission('announcements.view'));

DROP POLICY IF EXISTS "announcements_admin_insert" ON public.announcements;
CREATE POLICY "announcements_admin_insert"
  ON public.announcements FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('announcements.create'));

DROP POLICY IF EXISTS "announcements_admin_update" ON public.announcements;
CREATE POLICY "announcements_admin_update"
  ON public.announcements FOR UPDATE TO authenticated
  USING (public.has_permission('announcements.update'))
  WITH CHECK (public.has_permission('announcements.update'));

-- Widens from the legacy `admin`-only predicate to chairman as well.
-- announcements.delete is held by chairman, who already holds
-- create/update/publish on this table -- being unable to delete what you can
-- create was the gap this rewrite closes, not a boundary worth preserving.
DROP POLICY IF EXISTS "announcements_admin_delete" ON public.announcements;
CREATE POLICY "announcements_admin_delete"
  ON public.announcements FOR DELETE TO authenticated
  USING (public.has_permission('announcements.delete'));

-- ---------------------------------------------------------------------------
-- Announcement categories and templates
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "announcement_categories_admin_all" ON public.announcement_categories;
CREATE POLICY "announcement_categories_admin_all"
  ON public.announcement_categories FOR ALL TO authenticated
  USING (public.has_permission('announcements.manage_categories'))
  WITH CHECK (public.has_permission('announcements.manage_categories'));

-- announcement_read_receipts identifies which resident read which
-- announcement and when -- personal data, not just announcement content.
-- announcements.view (the more obvious fit) is also held by financial_officer
-- and security_officer, which would widen who sees that personal data.
-- announcements.publish reuses the legacy admin+chairman pattern, gaining
-- vice_chairman like the rest of this migration -- see the header for why
-- this is not one of the two zero-movement cases.
DROP POLICY IF EXISTS "read_receipts_admin_select" ON public.announcement_read_receipts;
CREATE POLICY "read_receipts_admin_select"
  ON public.announcement_read_receipts FOR SELECT TO authenticated
  USING (public.has_permission('announcements.publish'));

DROP POLICY IF EXISTS "message_templates_admin_all" ON public.message_templates;
CREATE POLICY "message_templates_admin_all"
  ON public.message_templates FOR ALL TO authenticated
  USING (public.has_permission('announcements.manage_templates'))
  WITH CHECK (public.has_permission('announcements.manage_templates'));

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "in_app_notifications_admin_insert" ON public.in_app_notifications;
CREATE POLICY "in_app_notifications_admin_insert"
  ON public.in_app_notifications FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('notifications.send'));

-- ---------------------------------------------------------------------------
-- Report subscriptions
-- ---------------------------------------------------------------------------
-- Widens from the legacy `admin`-only predicate to chairman and
-- vice_chairman, both of which hold report_subscriptions.view.
DROP POLICY IF EXISTS "report_subscriptions_admin_select" ON public.report_subscriptions;
CREATE POLICY "report_subscriptions_admin_select"
  ON public.report_subscriptions FOR SELECT TO authenticated
  USING (public.has_permission('report_subscriptions.view'));

DROP POLICY IF EXISTS "report_subscriptions_admin_insert" ON public.report_subscriptions;
CREATE POLICY "report_subscriptions_admin_insert"
  ON public.report_subscriptions FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('report_subscriptions.manage'));

DROP POLICY IF EXISTS "report_subscriptions_admin_update" ON public.report_subscriptions;
CREATE POLICY "report_subscriptions_admin_update"
  ON public.report_subscriptions FOR UPDATE TO authenticated
  USING (public.has_permission('report_subscriptions.manage'))
  WITH CHECK (public.has_permission('report_subscriptions.manage'));

-- ---------------------------------------------------------------------------
-- Search logs (audit-trail data, not general reporting)
-- ---------------------------------------------------------------------------
-- NARROWS: the legacy predicate admitted admin, chairman and
-- financial_secretary. settings.view_audit_logs is held only by super_admin
-- and vice_chairman, so this drops chairman and financial_officer. Deliberate
-- and owner-approved: it aligns this policy with the app-layer guard on the
-- same rows, getSearchAnalytics() in
-- src/actions/analytics/get-search-analytics.ts:24, which already checks
-- PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS because search_logs records what each
-- admin typed and who typed it.
DROP POLICY IF EXISTS "Admins can view search logs" ON public.search_logs;
CREATE POLICY "Admins can view search logs"
  ON public.search_logs FOR SELECT TO authenticated
  USING (public.has_permission('settings.view_audit_logs'));

-- ---------------------------------------------------------------------------
-- Late fees and petty cash
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins can view late fee log" ON public.late_fee_log;
CREATE POLICY "Admins can view late fee log"
  ON public.late_fee_log FOR SELECT TO authenticated
  USING (public.has_permission('billing.apply_late_fees'));

-- No movement at all for this one, not even vice_chairman:
-- billing.request_late_fee_waiver is not held by vice_chairman, so the
-- admitted set is unchanged from the legacy predicate.
DROP POLICY IF EXISTS "Admins can manage late fee waivers" ON public.late_fee_waivers;
CREATE POLICY "Admins can manage late fee waivers"
  ON public.late_fee_waivers FOR ALL TO authenticated
  USING (public.has_permission('billing.request_late_fee_waiver'))
  WITH CHECK (public.has_permission('billing.request_late_fee_waiver'));

-- No movement at all for this one either: manage_expenditure is not held by
-- vice_chairman. Note the bare permission name -- NOT
-- `finance.manage_expenditure`, which does not exist in app_permissions.
DROP POLICY IF EXISTS "Admins can manage petty cash accounts" ON public.petty_cash_accounts;
CREATE POLICY "Admins can manage petty cash accounts"
  ON public.petty_cash_accounts FOR ALL TO authenticated
  USING (public.has_permission('manage_expenditure'))
  WITH CHECK (public.has_permission('manage_expenditure'));

COMMIT;
