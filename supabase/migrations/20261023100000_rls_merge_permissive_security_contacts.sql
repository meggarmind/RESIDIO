-- #956: one permissive policy per role and command on the security contacts and access codes tables
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
-- Modelled multiple_permissive_policies findings on these tables: 5 before, 0 after.
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
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['access_codes', 'security_contacts'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- access_codes
-- CREATE POLICY "access_codes_select_policy" ON public.access_codes
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((select has_permission('security.operate_records'::text))));
-- ALTER POLICY "Residents can view own access codes" ON public.access_codes
--   USING ((contact_id IN ( SELECT security_contacts.id FROM security_contacts WHERE (security_contacts.resident_id = (select get_my_resident_id())))));
--
-- -- security_contacts
-- CREATE POLICY "security_contacts_select_policy" ON public.security_contacts
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((select has_permission('security.operate_records'::text))));
-- CREATE POLICY "security_contacts_insert_policy" ON public.security_contacts
--   AS PERMISSIVE FOR INSERT TO authenticated
--   WITH CHECK (((select has_permission('security.manage_records'::text))));
-- CREATE POLICY "security_contacts_update_policy" ON public.security_contacts
--   AS PERMISSIVE FOR UPDATE TO authenticated
--   USING (((select has_permission('security.manage_records'::text))));
-- CREATE POLICY "security_contacts_delete_policy" ON public.security_contacts
--   AS PERMISSIVE FOR DELETE TO authenticated
--   USING (((select has_permission('security.suspend_revoke'::text))));
-- ALTER POLICY "Residents can view own security contacts" ON public.security_contacts
--   USING ((resident_id = (select get_my_resident_id())));
-- ALTER POLICY "Residents can create own security contacts" ON public.security_contacts
--   WITH CHECK ((resident_id = (select get_my_resident_id())));
-- ALTER POLICY "Residents can update own security contacts" ON public.security_contacts
--   USING ((resident_id = (select get_my_resident_id())))
--   WITH CHECK ((resident_id = (select get_my_resident_id())));
-- ALTER POLICY "Residents can delete own security contacts" ON public.security_contacts
--   USING ((resident_id = (select get_my_resident_id())));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "access_codes": {
    "before": [
      "Residents can view own access codes|SELECT|authenticated|PERMISSIVE",
      "access_codes_delete_policy|DELETE|authenticated|PERMISSIVE",
      "access_codes_insert_policy|INSERT|authenticated|PERMISSIVE",
      "access_codes_select_policy|SELECT|authenticated|PERMISSIVE",
      "access_codes_update_policy|UPDATE|authenticated|PERMISSIVE"
    ],
    "after": [
      "Residents can view own access codes|SELECT|authenticated|PERMISSIVE",
      "access_codes_delete_policy|DELETE|authenticated|PERMISSIVE",
      "access_codes_insert_policy|INSERT|authenticated|PERMISSIVE",
      "access_codes_update_policy|UPDATE|authenticated|PERMISSIVE"
    ]
  },
  "security_contacts": {
    "before": [
      "Residents can create own security contacts|INSERT|authenticated|PERMISSIVE",
      "Residents can delete own security contacts|DELETE|authenticated|PERMISSIVE",
      "Residents can update own security contacts|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own security contacts|SELECT|authenticated|PERMISSIVE",
      "security_contacts_delete_policy|DELETE|authenticated|PERMISSIVE",
      "security_contacts_insert_policy|INSERT|authenticated|PERMISSIVE",
      "security_contacts_select_policy|SELECT|authenticated|PERMISSIVE",
      "security_contacts_update_policy|UPDATE|authenticated|PERMISSIVE"
    ],
    "after": [
      "Residents can create own security contacts|INSERT|authenticated|PERMISSIVE",
      "Residents can delete own security contacts|DELETE|authenticated|PERMISSIVE",
      "Residents can update own security contacts|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own security contacts|SELECT|authenticated|PERMISSIVE"
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

-- access_codes
ALTER POLICY "Residents can view own access codes" ON public.access_codes
  USING (((contact_id IN ( SELECT security_contacts.id FROM security_contacts WHERE (security_contacts.resident_id = (select get_my_resident_id())))) OR (select has_permission('security.operate_records'::text))));
DROP POLICY IF EXISTS "access_codes_select_policy" ON public.access_codes;

-- security_contacts
ALTER POLICY "Residents can view own security contacts" ON public.security_contacts
  USING (((resident_id = (select get_my_resident_id())) OR (select has_permission('security.operate_records'::text))));
DROP POLICY IF EXISTS "security_contacts_select_policy" ON public.security_contacts;
ALTER POLICY "Residents can create own security contacts" ON public.security_contacts
  WITH CHECK (((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text))));
DROP POLICY IF EXISTS "security_contacts_insert_policy" ON public.security_contacts;
ALTER POLICY "Residents can update own security contacts" ON public.security_contacts
  USING (((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text))))
  WITH CHECK (((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text))));
DROP POLICY IF EXISTS "security_contacts_update_policy" ON public.security_contacts;
ALTER POLICY "Residents can delete own security contacts" ON public.security_contacts
  USING (((resident_id = (select get_my_resident_id())) OR (select has_permission('security.suspend_revoke'::text))));
DROP POLICY IF EXISTS "security_contacts_delete_policy" ON public.security_contacts;

COMMIT;
