-- #956: one permissive policy per role and command on the approvals, settings, profiles and admin records tables
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
-- Modelled multiple_permissive_policies findings on these tables: 10 before, 0 after.
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
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['approval_requests', 'hierarchical_settings', 'impersonation_sessions', 'profiles', 'role_assignment_rules', 'two_factor_audit_log'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- approval_requests
-- CREATE POLICY "Users can view their own approval requests" ON public.approval_requests
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((requested_by = (select auth.uid())));
-- ALTER POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
--   USING ((select has_permission('approvals.view'::text)));
--
-- -- hierarchical_settings
-- DROP POLICY "hierarchical_settings_admin_all (insert)" ON public.hierarchical_settings;
-- DROP POLICY "hierarchical_settings_admin_all (update)" ON public.hierarchical_settings;
-- DROP POLICY "hierarchical_settings_admin_all (delete)" ON public.hierarchical_settings;
-- CREATE POLICY "hierarchical_settings_read_house" ON public.hierarchical_settings
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING (level = 'house');
-- CREATE POLICY "hierarchical_settings_read_own_resident" ON public.hierarchical_settings
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))));
-- CREATE POLICY "hierarchical_settings_admin_all" ON public.hierarchical_settings
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING (((select has_permission('settings.write_system'::text))));
-- ALTER POLICY "hierarchical_settings_read_estate" ON public.hierarchical_settings
--   USING (level = 'estate');
--
-- -- impersonation_sessions
-- CREATE POLICY "super_admin_read_all_impersonation_sessions" ON public.impersonation_sessions
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((select has_permission('impersonation.view_sessions'::text)));
-- ALTER POLICY "admins_read_own_impersonation_sessions" ON public.impersonation_sessions
--   USING ((admin_profile_id = (select auth.uid())));
--
-- -- profiles
-- CREATE POLICY "Users can view own profile" ON public.profiles
--   AS PERMISSIVE FOR SELECT TO public
--   USING (((select auth.uid()) = id));
-- ALTER POLICY "Admins and chairmen can view all profiles" ON public.profiles
--   USING (((select has_permission('system.view_all_profiles'::text))));
--
-- -- role_assignment_rules
-- DROP POLICY "Admins can manage role assignment rules (insert)" ON public.role_assignment_rules;
-- DROP POLICY "Admins can manage role assignment rules (update)" ON public.role_assignment_rules;
-- DROP POLICY "Admins can manage role assignment rules (delete)" ON public.role_assignment_rules;
-- CREATE POLICY "Admins can manage role assignment rules" ON public.role_assignment_rules
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))));
-- ALTER POLICY "role_assignment_rules_select" ON public.role_assignment_rules
--   USING (((select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text))));
--
-- -- two_factor_audit_log
-- CREATE POLICY "Users can view own audit log" ON public.two_factor_audit_log
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((profile_id = (select auth.uid())));
-- ALTER POLICY "Admins can view all audit logs" ON public.two_factor_audit_log
--   USING ((select has_permission('two_factor.view_audit_log'::text)));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "approval_requests": {
    "before": [
      "Admin and chairman can update approval requests|UPDATE|authenticated|PERMISSIVE",
      "Admin and chairman can view all approval requests|SELECT|authenticated|PERMISSIVE",
      "Users can create their own approval requests|INSERT|authenticated|PERMISSIVE",
      "Users can view their own approval requests|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admin and chairman can update approval requests|UPDATE|authenticated|PERMISSIVE",
      "Admin and chairman can view all approval requests|SELECT|authenticated|PERMISSIVE",
      "Users can create their own approval requests|INSERT|authenticated|PERMISSIVE"
    ]
  },
  "hierarchical_settings": {
    "before": [
      "hierarchical_settings_admin_all|ALL|authenticated|PERMISSIVE",
      "hierarchical_settings_read_estate|SELECT|authenticated|PERMISSIVE",
      "hierarchical_settings_read_house|SELECT|authenticated|PERMISSIVE",
      "hierarchical_settings_read_own_resident|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "hierarchical_settings_admin_all (delete)|DELETE|authenticated|PERMISSIVE",
      "hierarchical_settings_admin_all (insert)|INSERT|authenticated|PERMISSIVE",
      "hierarchical_settings_admin_all (update)|UPDATE|authenticated|PERMISSIVE",
      "hierarchical_settings_read_estate|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "impersonation_sessions": {
    "before": [
      "admins_insert_own_impersonation_sessions|INSERT|authenticated|PERMISSIVE",
      "admins_read_own_impersonation_sessions|SELECT|authenticated|PERMISSIVE",
      "admins_update_own_impersonation_sessions|UPDATE|authenticated|PERMISSIVE",
      "super_admin_read_all_impersonation_sessions|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "admins_insert_own_impersonation_sessions|INSERT|authenticated|PERMISSIVE",
      "admins_read_own_impersonation_sessions|SELECT|authenticated|PERMISSIVE",
      "admins_update_own_impersonation_sessions|UPDATE|authenticated|PERMISSIVE"
    ]
  },
  "profiles": {
    "before": [
      "Admins and chairmen can view all profiles|SELECT|public|PERMISSIVE",
      "Admins can delete profiles|DELETE|public|PERMISSIVE",
      "Admins can insert profiles|INSERT|public|PERMISSIVE",
      "Users can update own profile|UPDATE|public|PERMISSIVE",
      "Users can view own profile|SELECT|public|PERMISSIVE"
    ],
    "after": [
      "Admins and chairmen can view all profiles|SELECT|public|PERMISSIVE",
      "Admins can delete profiles|DELETE|public|PERMISSIVE",
      "Admins can insert profiles|INSERT|public|PERMISSIVE",
      "Users can update own profile|UPDATE|public|PERMISSIVE"
    ]
  },
  "role_assignment_rules": {
    "before": [
      "Admins can manage role assignment rules|ALL|authenticated|PERMISSIVE",
      "role_assignment_rules_select|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins can manage role assignment rules (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins can manage role assignment rules (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins can manage role assignment rules (update)|UPDATE|authenticated|PERMISSIVE",
      "role_assignment_rules_select|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "two_factor_audit_log": {
    "before": [
      "Admins can view all audit logs|SELECT|authenticated|PERMISSIVE",
      "System can manage audit logs|ALL|service_role|PERMISSIVE",
      "Users can view own audit log|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins can view all audit logs|SELECT|authenticated|PERMISSIVE",
      "System can manage audit logs|ALL|service_role|PERMISSIVE"
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

-- approval_requests
ALTER POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
  USING (((select has_permission('approvals.view'::text)) OR (requested_by = (select auth.uid()))));
DROP POLICY IF EXISTS "Users can view their own approval requests" ON public.approval_requests;

-- hierarchical_settings
ALTER POLICY "hierarchical_settings_read_estate" ON public.hierarchical_settings
  USING (((level = 'estate') OR (select has_permission('settings.write_system'::text)) OR (level = 'house') OR ((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))));
DROP POLICY IF EXISTS "hierarchical_settings_read_house" ON public.hierarchical_settings;
DROP POLICY IF EXISTS "hierarchical_settings_read_own_resident" ON public.hierarchical_settings;
DROP POLICY IF EXISTS "hierarchical_settings_admin_all (insert)" ON public.hierarchical_settings;
CREATE POLICY "hierarchical_settings_admin_all (insert)" ON public.hierarchical_settings
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('settings.write_system'::text)));
DROP POLICY IF EXISTS "hierarchical_settings_admin_all (update)" ON public.hierarchical_settings;
CREATE POLICY "hierarchical_settings_admin_all (update)" ON public.hierarchical_settings
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('settings.write_system'::text)));
DROP POLICY IF EXISTS "hierarchical_settings_admin_all (delete)" ON public.hierarchical_settings;
CREATE POLICY "hierarchical_settings_admin_all (delete)" ON public.hierarchical_settings
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('settings.write_system'::text)));
DROP POLICY IF EXISTS "hierarchical_settings_admin_all" ON public.hierarchical_settings;

-- impersonation_sessions
ALTER POLICY "admins_read_own_impersonation_sessions" ON public.impersonation_sessions
  USING (((admin_profile_id = (select auth.uid())) OR (select has_permission('impersonation.view_sessions'::text))));
DROP POLICY IF EXISTS "super_admin_read_all_impersonation_sessions" ON public.impersonation_sessions;

-- profiles
ALTER POLICY "Admins and chairmen can view all profiles" ON public.profiles
  USING (((select has_permission('system.view_all_profiles'::text)) OR ((select auth.uid()) = id)));
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- role_assignment_rules
ALTER POLICY "role_assignment_rules_select" ON public.role_assignment_rules
  USING (((select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text)) OR (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text))))));
DROP POLICY IF EXISTS "Admins can manage role assignment rules (insert)" ON public.role_assignment_rules;
CREATE POLICY "Admins can manage role assignment rules (insert)" ON public.role_assignment_rules
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))));
DROP POLICY IF EXISTS "Admins can manage role assignment rules (update)" ON public.role_assignment_rules;
CREATE POLICY "Admins can manage role assignment rules (update)" ON public.role_assignment_rules
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))));
DROP POLICY IF EXISTS "Admins can manage role assignment rules (delete)" ON public.role_assignment_rules;
CREATE POLICY "Admins can manage role assignment rules (delete)" ON public.role_assignment_rules
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))));
DROP POLICY IF EXISTS "Admins can manage role assignment rules" ON public.role_assignment_rules;

-- two_factor_audit_log
ALTER POLICY "Admins can view all audit logs" ON public.two_factor_audit_log
  USING (((select has_permission('two_factor.view_audit_log'::text)) OR (profile_id = (select auth.uid()))));
DROP POLICY IF EXISTS "Users can view own audit log" ON public.two_factor_audit_log;

COMMIT;
