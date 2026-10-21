-- #956 part 2: one permissive policy per role and command on the houses, residents and resident
-- houses tables, by re-scoping their TO public policies to TO authenticated (owner decision
-- 2026-10-21, option A)
--
-- SIGNED-IN USERS SEE NO CHANGE. Part 1 left four overlaps here between a TO public and a TO
-- authenticated policy on the same command. Each TO public policy is re-scoped to TO authenticated
-- (ALTER POLICY ... TO authenticated, expressions kept), then ALTERed to the OR of itself and the
-- TO authenticated policy, which is dropped. For authenticated, the OR-ed expression Postgres
-- evaluates is the same before and after.
--
-- anon (and authenticator and dashboard_user) no longer evaluate these four policies, so anon reads
-- and updates no row through them. What anon got before is measured by the probe
-- (docs/security/probe-956-permissive-merge.sql). No signed-out code path reads these tables
-- (docs/security/rls-policy-consolidation.md, part 2). service_role bypasses RLS.
--
-- * houses SELECT: "All authenticated users can view active houses" (public) absorbs "Residents
--   can view assigned houses" (authenticated). The restrictive "Approved accounts only can read"
--   is untouched.
-- * residents SELECT: "Admins chairmen fin sec can view all residents" (public) absorbs "Residents
--   can view housemates" (authenticated).
-- * residents UPDATE: "Admins chairmen fin sec can update residents" (public) absorbs "Residents
--   can update own contact info" (authenticated). The admin policy had no WITH CHECK, so Postgres
--   checked with its USING; the merged policy states WITH CHECK as the same OR as its USING.
-- * resident_houses SELECT: "Admins chairmen fin sec can view all resident houses" (public)
--   absorbs "Residents can view housemates house assignments" (authenticated).
--
-- The INSERT, UPDATE and DELETE policies on houses and resident_houses, and the INSERT and DELETE
-- policies on residents, overlap nothing and stay TO public.
--
-- The original definitions come from docs/security/rls-policy-consolidation.md (part 2), derived
-- from the migrations up to part 1. Residio_Stage must confirm them before this is applied.
-- Modelled multiple_permissive_policies findings on these tables: 4 before, 0 after.
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
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['houses', 'residents', 'resident_houses'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- houses
-- CREATE POLICY "Residents can view assigned houses" ON public.houses
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((id IN ( SELECT resident_houses.house_id FROM resident_houses WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true)))));
-- ALTER POLICY "All authenticated users can view active houses" ON public.houses
--   TO public
--   USING (((is_active = true) OR ((select has_permission('houses.manage_records'::text)))));
--
-- -- residents
-- CREATE POLICY "Residents can view housemates" ON public.residents
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true)))) OR (id = (select get_my_resident_id()))));
-- ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
--   TO public
--   USING (((select has_permission('residents.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status))));
-- CREATE POLICY "Residents can update own contact info" ON public.residents
--   AS PERMISSIVE FOR UPDATE TO authenticated
--   USING ((id = (select get_my_resident_id())))
--   WITH CHECK ((id = (select get_my_resident_id())));
-- -- ALTER POLICY cannot remove a WITH CHECK, so the admin policy is recreated without one.
-- DROP POLICY "Admins chairmen fin sec can update residents" ON public.residents;
-- CREATE POLICY "Admins chairmen fin sec can update residents" ON public.residents
--   AS PERMISSIVE FOR UPDATE TO public
--   USING (((select has_permission('residents.manage_records'::text))));
--
-- -- resident_houses
-- CREATE POLICY "Residents can view housemates house assignments" ON public.resident_houses
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((house_id IN (SELECT get_my_house_ids())) OR (resident_id = (select get_my_resident_id()))));
-- ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
--   TO public
--   USING (((select has_permission('houses.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true))));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "houses": {
    "before": [
      "Admins chairmen and fin sec can delete houses|DELETE|public|PERMISSIVE",
      "Admins chairmen and fin sec can insert houses|INSERT|public|PERMISSIVE",
      "Admins chairmen and fin sec can update houses|UPDATE|public|PERMISSIVE",
      "All authenticated users can view active houses|SELECT|public|PERMISSIVE",
      "Approved accounts only can read|SELECT|authenticated|RESTRICTIVE",
      "Residents can view assigned houses|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen and fin sec can delete houses|DELETE|public|PERMISSIVE",
      "Admins chairmen and fin sec can insert houses|INSERT|public|PERMISSIVE",
      "Admins chairmen and fin sec can update houses|UPDATE|public|PERMISSIVE",
      "All authenticated users can view active houses|SELECT|authenticated|PERMISSIVE",
      "Approved accounts only can read|SELECT|authenticated|RESTRICTIVE"
    ]
  },
  "residents": {
    "before": [
      "Admins chairmen fin sec can insert residents|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update residents|UPDATE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all residents|SELECT|public|PERMISSIVE",
      "Only admins can delete residents|DELETE|public|PERMISSIVE",
      "Residents can update own contact info|UPDATE|authenticated|PERMISSIVE",
      "Residents can view housemates|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can insert residents|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update residents|UPDATE|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can view all residents|SELECT|authenticated|PERMISSIVE",
      "Only admins can delete residents|DELETE|public|PERMISSIVE"
    ]
  },
  "resident_houses": {
    "before": [
      "Admins chairmen fin sec can delete resident houses|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can insert resident houses|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update resident houses|UPDATE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all resident houses|SELECT|public|PERMISSIVE",
      "Residents can view housemates house assignments|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can delete resident houses|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can insert resident houses|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update resident houses|UPDATE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all resident houses|SELECT|authenticated|PERMISSIVE"
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

-- houses
ALTER POLICY "All authenticated users can view active houses" ON public.houses
  TO authenticated;
ALTER POLICY "All authenticated users can view active houses" ON public.houses
  USING (((is_active = true) OR (select has_permission('houses.manage_records'::text)) OR (id IN ( SELECT resident_houses.house_id FROM resident_houses WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true))))));
DROP POLICY IF EXISTS "Residents can view assigned houses" ON public.houses;

-- residents
ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
  TO authenticated;
ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
  USING (((select has_permission('residents.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status)) OR (id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true)))) OR (id = (select get_my_resident_id()))));
DROP POLICY IF EXISTS "Residents can view housemates" ON public.residents;
ALTER POLICY "Admins chairmen fin sec can update residents" ON public.residents
  TO authenticated;
ALTER POLICY "Admins chairmen fin sec can update residents" ON public.residents
  USING (((select has_permission('residents.manage_records'::text)) OR (id = (select get_my_resident_id()))))
  WITH CHECK (((select has_permission('residents.manage_records'::text)) OR (id = (select get_my_resident_id()))));
DROP POLICY IF EXISTS "Residents can update own contact info" ON public.residents;

-- resident_houses
ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
  TO authenticated;
ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
  USING (((select has_permission('houses.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true)) OR (house_id IN (SELECT get_my_house_ids())) OR (resident_id = (select get_my_resident_id()))));
DROP POLICY IF EXISTS "Residents can view housemates house assignments" ON public.resident_houses;

COMMIT;
