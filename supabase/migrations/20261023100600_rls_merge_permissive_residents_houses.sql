-- #956: one permissive policy per role and command on the residents and resident houses tables
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
-- Modelled multiple_permissive_policies findings on these tables: 11 before, 3 after.
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
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['resident_houses', 'residents'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- resident_houses
-- CREATE POLICY "Residents can view own house assignments" ON public.resident_houses
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((resident_id = (select get_my_resident_id())));
-- CREATE POLICY "Security officers can view active resident houses" ON public.resident_houses
--   AS PERMISSIVE FOR SELECT TO public
--   USING ((((select has_permission('security.view_active_residents'::text))) AND (is_active = true)));
-- ALTER POLICY "Residents can view housemates house assignments" ON public.resident_houses
--   USING (house_id IN (SELECT get_my_house_ids()));
-- ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
--   USING (((select has_permission('houses.manage_records'::text))));
--
-- -- residents
-- CREATE POLICY "Residents can view own record" ON public.residents
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((id = (select get_my_resident_id())));
-- CREATE POLICY "Security officers can view active residents" ON public.residents
--   AS PERMISSIVE FOR SELECT TO public
--   USING ((((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status)));
-- ALTER POLICY "Residents can view housemates" ON public.residents
--   USING ((id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true)))));
-- ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
--   USING (((select has_permission('residents.manage_records'::text))));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "resident_houses": {
    "before": [
      "Admins chairmen fin sec can delete resident houses|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can insert resident houses|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update resident houses|UPDATE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all resident houses|SELECT|public|PERMISSIVE",
      "Residents can view housemates house assignments|SELECT|authenticated|PERMISSIVE",
      "Residents can view own house assignments|SELECT|authenticated|PERMISSIVE",
      "Security officers can view active resident houses|SELECT|public|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can delete resident houses|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can insert resident houses|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update resident houses|UPDATE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all resident houses|SELECT|public|PERMISSIVE",
      "Residents can view housemates house assignments|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "residents": {
    "before": [
      "Admins chairmen fin sec can insert residents|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update residents|UPDATE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all residents|SELECT|public|PERMISSIVE",
      "Only admins can delete residents|DELETE|public|PERMISSIVE",
      "Residents can update own contact info|UPDATE|authenticated|PERMISSIVE",
      "Residents can view housemates|SELECT|authenticated|PERMISSIVE",
      "Residents can view own record|SELECT|authenticated|PERMISSIVE",
      "Security officers can view active residents|SELECT|public|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can insert residents|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can update residents|UPDATE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all residents|SELECT|public|PERMISSIVE",
      "Only admins can delete residents|DELETE|public|PERMISSIVE",
      "Residents can update own contact info|UPDATE|authenticated|PERMISSIVE",
      "Residents can view housemates|SELECT|authenticated|PERMISSIVE"
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

-- resident_houses
ALTER POLICY "Residents can view housemates house assignments" ON public.resident_houses
  USING (((house_id IN (SELECT get_my_house_ids())) OR (resident_id = (select get_my_resident_id()))));
DROP POLICY IF EXISTS "Residents can view own house assignments" ON public.resident_houses;
ALTER POLICY "Admins chairmen fin sec can view all resident houses" ON public.resident_houses
  USING (((select has_permission('houses.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true))));
DROP POLICY IF EXISTS "Security officers can view active resident houses" ON public.resident_houses;

-- residents
ALTER POLICY "Residents can view housemates" ON public.residents
  USING (((id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true)))) OR (id = (select get_my_resident_id()))));
DROP POLICY IF EXISTS "Residents can view own record" ON public.residents;
ALTER POLICY "Admins chairmen fin sec can view all residents" ON public.residents
  USING (((select has_permission('residents.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status))));
DROP POLICY IF EXISTS "Security officers can view active residents" ON public.residents;

COMMIT;
