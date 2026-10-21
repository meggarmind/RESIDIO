-- #956: one permissive policy per role and command on the announcements, notifications and report subscriptions tables
--
-- THIS CHANGES NO ACCESS. Where two or more permissive policies applied to the same role and
-- command, Postgres evaluated every one for every row and ORed them. Each such set becomes one
-- policy whose expression is the OR of the originals (a disjunct that appears in more than one
-- original is written once; OR is idempotent):
--
-- * Overlapping policies of the same command: one is ALTERed to the combined expression, keeping
--   its name, command and roles; the others are dropped.
-- * A FOR ALL policy that overlapped a SELECT policy is split into INSERT, UPDATE and DELETE
--   policies with its own expressions (its USING stands in as the INSERT check when it had no
--   WITH CHECK, as Postgres did), and its SELECT part is ORed into the SELECT policy.
-- * Only policies granted to the same role are merged. Overlaps between a TO public and a TO
--   authenticated policy are left alone: merging them changes which roles a predicate applies to,
--   which needs an owner decision (docs/security/rls-policy-consolidation.md).
--
-- The original definitions come from docs/security/rls-policy-consolidation.md, derived from the
-- migrations. Residio_Stage must confirm them before this is applied (that document's query).
-- Modelled multiple_permissive_policies findings on these tables: 11 before, 0 after.
--
-- GUARD: the DO block aborts the migration unless every table's full policy set (name, command,
-- roles, permissive flag) is exactly the expected state before this migration or exactly the state
-- after it. The first catches drift from the mapping; the second makes a re-run a no-op. Every
-- statement after it is idempotent.
--
-- VERIFY (after applying): the guard query below returns the "after" state for every table, and
-- the advisor's multiple_permissive_policies count drops by the difference above.
--
--   SELECT tablename, policyname, cmd, roles, permissive, qual, with_check FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['announcement_categories', 'announcement_read_receipts', 'announcements', 'message_templates', 'notification_preferences', 'recipient_group_members', 'recipient_groups', 'report_subscriptions'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- announcement_categories
-- DROP POLICY "announcement_categories_admin_all (insert)" ON public.announcement_categories;
-- DROP POLICY "announcement_categories_admin_all (update)" ON public.announcement_categories;
-- DROP POLICY "announcement_categories_admin_all (delete)" ON public.announcement_categories;
-- CREATE POLICY "announcement_categories_admin_all" ON public.announcement_categories
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('announcements.manage_categories'::text)))
--   WITH CHECK ((select has_permission('announcements.manage_categories'::text)));
-- ALTER POLICY "announcement_categories_select_policy" ON public.announcement_categories
--   USING (is_active = true);
--
-- -- announcement_read_receipts
-- CREATE POLICY "read_receipts_own_select" ON public.announcement_read_receipts
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid()))))));
-- ALTER POLICY "read_receipts_admin_select" ON public.announcement_read_receipts
--   USING ((select has_permission('announcements.publish'::text)));
--
-- -- announcements
-- CREATE POLICY "announcements_resident_select" ON public.announcements
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses))))))));
-- ALTER POLICY "announcements_admin_select" ON public.announcements
--   USING ((select has_permission('announcements.view'::text)));
--
-- -- message_templates
-- DROP POLICY "message_templates_admin_all (insert)" ON public.message_templates;
-- DROP POLICY "message_templates_admin_all (update)" ON public.message_templates;
-- DROP POLICY "message_templates_admin_all (delete)" ON public.message_templates;
-- CREATE POLICY "message_templates_admin_all" ON public.message_templates
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('announcements.manage_templates'::text)))
--   WITH CHECK ((select has_permission('announcements.manage_templates'::text)));
-- ALTER POLICY "message_templates_select_policy" ON public.message_templates
--   USING (is_active = true);
--
-- -- notification_preferences
-- CREATE POLICY "Residents can view own notification preferences" ON public.notification_preferences
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((resident_id = (select get_my_resident_id())));
-- CREATE POLICY "notification_preferences_update" ON public.notification_preferences
--   AS PERMISSIVE FOR UPDATE TO authenticated
--   USING (((select has_permission('notifications.manage_delivery'::text))))
--   WITH CHECK (((select has_permission('notifications.manage_delivery'::text))));
-- ALTER POLICY "Residents can update own notification preferences" ON public.notification_preferences
--   USING ((resident_id = (select get_my_resident_id())))
--   WITH CHECK ((resident_id = (select get_my_resident_id())));
--
-- -- recipient_group_members
-- DROP POLICY "recipient_group_members_write (insert)" ON public.recipient_group_members;
-- DROP POLICY "recipient_group_members_write (update)" ON public.recipient_group_members;
-- DROP POLICY "recipient_group_members_write (delete)" ON public.recipient_group_members;
-- CREATE POLICY "recipient_group_members_write" ON public.recipient_group_members
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('groups.manage')))
--   WITH CHECK ((select has_permission('groups.manage')));
-- ALTER POLICY "recipient_group_members_select" ON public.recipient_group_members
--   USING ((select has_permission('groups.view')));
--
-- -- recipient_groups
-- DROP POLICY "recipient_groups_write (insert)" ON public.recipient_groups;
-- DROP POLICY "recipient_groups_write (update)" ON public.recipient_groups;
-- DROP POLICY "recipient_groups_write (delete)" ON public.recipient_groups;
-- CREATE POLICY "recipient_groups_write" ON public.recipient_groups
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('groups.manage')))
--   WITH CHECK ((select has_permission('groups.manage')));
-- ALTER POLICY "recipient_groups_select" ON public.recipient_groups
--   USING ((select has_permission('groups.view')));
--
-- -- report_subscriptions
-- CREATE POLICY "report_subscriptions_own_select" ON public.report_subscriptions
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))));
-- CREATE POLICY "report_subscriptions_own_insert" ON public.report_subscriptions
--   AS PERMISSIVE FOR INSERT TO authenticated
--   WITH CHECK ((EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))));
-- CREATE POLICY "report_subscriptions_own_update" ON public.report_subscriptions
--   AS PERMISSIVE FOR UPDATE TO authenticated
--   USING ((EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))
--   WITH CHECK ((EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))));
-- ALTER POLICY "report_subscriptions_admin_select" ON public.report_subscriptions
--   USING ((select has_permission('report_subscriptions.view'::text)));
-- ALTER POLICY "report_subscriptions_admin_insert" ON public.report_subscriptions
--   WITH CHECK ((select has_permission('report_subscriptions.manage'::text)));
-- ALTER POLICY "report_subscriptions_admin_update" ON public.report_subscriptions
--   USING ((select has_permission('report_subscriptions.manage'::text)))
--   WITH CHECK ((select has_permission('report_subscriptions.manage'::text)));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "announcement_categories": {
    "before": [
      "announcement_categories_admin_all|ALL|authenticated|PERMISSIVE",
      "announcement_categories_select_policy|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "announcement_categories_admin_all (delete)|DELETE|authenticated|PERMISSIVE",
      "announcement_categories_admin_all (insert)|INSERT|authenticated|PERMISSIVE",
      "announcement_categories_admin_all (update)|UPDATE|authenticated|PERMISSIVE",
      "announcement_categories_select_policy|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "announcement_read_receipts": {
    "before": [
      "read_receipts_admin_select|SELECT|authenticated|PERMISSIVE",
      "read_receipts_own_insert|INSERT|authenticated|PERMISSIVE",
      "read_receipts_own_select|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "read_receipts_admin_select|SELECT|authenticated|PERMISSIVE",
      "read_receipts_own_insert|INSERT|authenticated|PERMISSIVE"
    ]
  },
  "announcements": {
    "before": [
      "announcements_admin_delete|DELETE|authenticated|PERMISSIVE",
      "announcements_admin_insert|INSERT|authenticated|PERMISSIVE",
      "announcements_admin_select|SELECT|authenticated|PERMISSIVE",
      "announcements_admin_update|UPDATE|authenticated|PERMISSIVE",
      "announcements_resident_select|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "announcements_admin_delete|DELETE|authenticated|PERMISSIVE",
      "announcements_admin_insert|INSERT|authenticated|PERMISSIVE",
      "announcements_admin_select|SELECT|authenticated|PERMISSIVE",
      "announcements_admin_update|UPDATE|authenticated|PERMISSIVE"
    ]
  },
  "message_templates": {
    "before": [
      "message_templates_admin_all|ALL|authenticated|PERMISSIVE",
      "message_templates_select_policy|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "message_templates_admin_all (delete)|DELETE|authenticated|PERMISSIVE",
      "message_templates_admin_all (insert)|INSERT|authenticated|PERMISSIVE",
      "message_templates_admin_all (update)|UPDATE|authenticated|PERMISSIVE",
      "message_templates_select_policy|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "notification_preferences": {
    "before": [
      "Residents can update own notification preferences|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own notification preferences|SELECT|authenticated|PERMISSIVE",
      "notification_preferences_delete|DELETE|authenticated|PERMISSIVE",
      "notification_preferences_insert|INSERT|authenticated|PERMISSIVE",
      "notification_preferences_select|SELECT|authenticated|PERMISSIVE",
      "notification_preferences_update|UPDATE|authenticated|PERMISSIVE"
    ],
    "after": [
      "Residents can update own notification preferences|UPDATE|authenticated|PERMISSIVE",
      "notification_preferences_delete|DELETE|authenticated|PERMISSIVE",
      "notification_preferences_insert|INSERT|authenticated|PERMISSIVE",
      "notification_preferences_select|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "recipient_group_members": {
    "before": [
      "recipient_group_members_select|SELECT|authenticated|PERMISSIVE",
      "recipient_group_members_write|ALL|authenticated|PERMISSIVE"
    ],
    "after": [
      "recipient_group_members_select|SELECT|authenticated|PERMISSIVE",
      "recipient_group_members_write (delete)|DELETE|authenticated|PERMISSIVE",
      "recipient_group_members_write (insert)|INSERT|authenticated|PERMISSIVE",
      "recipient_group_members_write (update)|UPDATE|authenticated|PERMISSIVE"
    ]
  },
  "recipient_groups": {
    "before": [
      "recipient_groups_select|SELECT|authenticated|PERMISSIVE",
      "recipient_groups_write|ALL|authenticated|PERMISSIVE"
    ],
    "after": [
      "recipient_groups_select|SELECT|authenticated|PERMISSIVE",
      "recipient_groups_write (delete)|DELETE|authenticated|PERMISSIVE",
      "recipient_groups_write (insert)|INSERT|authenticated|PERMISSIVE",
      "recipient_groups_write (update)|UPDATE|authenticated|PERMISSIVE"
    ]
  },
  "report_subscriptions": {
    "before": [
      "report_subscriptions_admin_insert|INSERT|authenticated|PERMISSIVE",
      "report_subscriptions_admin_select|SELECT|authenticated|PERMISSIVE",
      "report_subscriptions_admin_update|UPDATE|authenticated|PERMISSIVE",
      "report_subscriptions_own_insert|INSERT|authenticated|PERMISSIVE",
      "report_subscriptions_own_select|SELECT|authenticated|PERMISSIVE",
      "report_subscriptions_own_update|UPDATE|authenticated|PERMISSIVE"
    ],
    "after": [
      "report_subscriptions_admin_insert|INSERT|authenticated|PERMISSIVE",
      "report_subscriptions_admin_select|SELECT|authenticated|PERMISSIVE",
      "report_subscriptions_admin_update|UPDATE|authenticated|PERMISSIVE"
    ]
  }
}';
  v_table text;
  v_live text[];
  v_before text[];
  v_after text[];
BEGIN
  FOR v_table IN SELECT jsonb_object_keys(v_expected) LOOP
    SELECT coalesce(array_agg(format('%s|%s|%s|%s', p.policyname, p.cmd,
             (SELECT string_agg(r::text, ',' ORDER BY r::text) FROM unnest(p.roles) AS r), p.permissive)), '{}')
      INTO v_live
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = v_table;
    v_before := ARRAY(SELECT jsonb_array_elements_text(v_expected -> v_table -> 'before'));
    v_after := ARRAY(SELECT jsonb_array_elements_text(v_expected -> v_table -> 'after'));
    IF NOT ((v_live @> v_before AND v_live <@ v_before) OR (v_live @> v_after AND v_live <@ v_after)) THEN
      RAISE EXCEPTION '#956: public.% policies match neither the expected before-state nor the after-state; live: %',
        v_table, v_live;
    END IF;
  END LOOP;
END
$guard$;

-- announcement_categories
ALTER POLICY "announcement_categories_select_policy" ON public.announcement_categories
  USING (((is_active = true) OR (select has_permission('announcements.manage_categories'::text))));
DROP POLICY IF EXISTS "announcement_categories_admin_all (insert)" ON public.announcement_categories;
CREATE POLICY "announcement_categories_admin_all (insert)" ON public.announcement_categories
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('announcements.manage_categories'::text)));
DROP POLICY IF EXISTS "announcement_categories_admin_all (update)" ON public.announcement_categories;
CREATE POLICY "announcement_categories_admin_all (update)" ON public.announcement_categories
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('announcements.manage_categories'::text)))
  WITH CHECK ((select has_permission('announcements.manage_categories'::text)));
DROP POLICY IF EXISTS "announcement_categories_admin_all (delete)" ON public.announcement_categories;
CREATE POLICY "announcement_categories_admin_all (delete)" ON public.announcement_categories
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('announcements.manage_categories'::text)));
DROP POLICY IF EXISTS "announcement_categories_admin_all" ON public.announcement_categories;

-- announcement_read_receipts
ALTER POLICY "read_receipts_admin_select" ON public.announcement_read_receipts
  USING (((select has_permission('announcements.publish'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid())))))));
DROP POLICY IF EXISTS "read_receipts_own_select" ON public.announcement_read_receipts;

-- announcements
ALTER POLICY "announcements_admin_select" ON public.announcements
  USING (((select has_permission('announcements.view'::text)) OR ((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses)))))))));
DROP POLICY IF EXISTS "announcements_resident_select" ON public.announcements;

-- message_templates
ALTER POLICY "message_templates_select_policy" ON public.message_templates
  USING (((is_active = true) OR (select has_permission('announcements.manage_templates'::text))));
DROP POLICY IF EXISTS "message_templates_admin_all (insert)" ON public.message_templates;
CREATE POLICY "message_templates_admin_all (insert)" ON public.message_templates
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('announcements.manage_templates'::text)));
DROP POLICY IF EXISTS "message_templates_admin_all (update)" ON public.message_templates;
CREATE POLICY "message_templates_admin_all (update)" ON public.message_templates
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('announcements.manage_templates'::text)))
  WITH CHECK ((select has_permission('announcements.manage_templates'::text)));
DROP POLICY IF EXISTS "message_templates_admin_all (delete)" ON public.message_templates;
CREATE POLICY "message_templates_admin_all (delete)" ON public.message_templates
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('announcements.manage_templates'::text)));
DROP POLICY IF EXISTS "message_templates_admin_all" ON public.message_templates;

-- notification_preferences
DROP POLICY IF EXISTS "Residents can view own notification preferences" ON public.notification_preferences;
ALTER POLICY "Residents can update own notification preferences" ON public.notification_preferences
  USING (((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.manage_delivery'::text))))
  WITH CHECK (((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.manage_delivery'::text))));
DROP POLICY IF EXISTS "notification_preferences_update" ON public.notification_preferences;

-- recipient_group_members
ALTER POLICY "recipient_group_members_select" ON public.recipient_group_members
  USING (((select has_permission('groups.view')) OR (select has_permission('groups.manage'))));
DROP POLICY IF EXISTS "recipient_group_members_write (insert)" ON public.recipient_group_members;
CREATE POLICY "recipient_group_members_write (insert)" ON public.recipient_group_members
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('groups.manage')));
DROP POLICY IF EXISTS "recipient_group_members_write (update)" ON public.recipient_group_members;
CREATE POLICY "recipient_group_members_write (update)" ON public.recipient_group_members
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('groups.manage')))
  WITH CHECK ((select has_permission('groups.manage')));
DROP POLICY IF EXISTS "recipient_group_members_write (delete)" ON public.recipient_group_members;
CREATE POLICY "recipient_group_members_write (delete)" ON public.recipient_group_members
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('groups.manage')));
DROP POLICY IF EXISTS "recipient_group_members_write" ON public.recipient_group_members;

-- recipient_groups
ALTER POLICY "recipient_groups_select" ON public.recipient_groups
  USING (((select has_permission('groups.view')) OR (select has_permission('groups.manage'))));
DROP POLICY IF EXISTS "recipient_groups_write (insert)" ON public.recipient_groups;
CREATE POLICY "recipient_groups_write (insert)" ON public.recipient_groups
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('groups.manage')));
DROP POLICY IF EXISTS "recipient_groups_write (update)" ON public.recipient_groups;
CREATE POLICY "recipient_groups_write (update)" ON public.recipient_groups
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('groups.manage')))
  WITH CHECK ((select has_permission('groups.manage')));
DROP POLICY IF EXISTS "recipient_groups_write (delete)" ON public.recipient_groups;
CREATE POLICY "recipient_groups_write (delete)" ON public.recipient_groups
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('groups.manage')));
DROP POLICY IF EXISTS "recipient_groups_write" ON public.recipient_groups;

-- report_subscriptions
ALTER POLICY "report_subscriptions_admin_select" ON public.report_subscriptions
  USING (((select has_permission('report_subscriptions.view'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))));
DROP POLICY IF EXISTS "report_subscriptions_own_select" ON public.report_subscriptions;
ALTER POLICY "report_subscriptions_admin_insert" ON public.report_subscriptions
  WITH CHECK (((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))));
DROP POLICY IF EXISTS "report_subscriptions_own_insert" ON public.report_subscriptions;
ALTER POLICY "report_subscriptions_admin_update" ON public.report_subscriptions
  USING (((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))))
  WITH CHECK (((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))));
DROP POLICY IF EXISTS "report_subscriptions_own_update" ON public.report_subscriptions;

COMMIT;
