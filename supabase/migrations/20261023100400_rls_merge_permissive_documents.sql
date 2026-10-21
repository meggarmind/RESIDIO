-- #956: one permissive policy per role and command on the documents tables
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
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['document_categories', 'document_custom_field_values', 'document_custom_fields', 'document_tags'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- document_categories
-- DROP POLICY "Admins can manage categories (insert)" ON public.document_categories;
-- DROP POLICY "Admins can manage categories (update)" ON public.document_categories;
-- DROP POLICY "Admins can manage categories (delete)" ON public.document_categories;
-- CREATE POLICY "Admins can manage categories" ON public.document_categories
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))));
-- ALTER POLICY "Authenticated users can view active categories" ON public.document_categories
--   USING (is_active = TRUE);
--
-- -- document_custom_field_values
-- DROP POLICY "Editors can write custom field values (insert)" ON public.document_custom_field_values;
-- DROP POLICY "Editors can write custom field values (update)" ON public.document_custom_field_values;
-- DROP POLICY "Editors can write custom field values (delete)" ON public.document_custom_field_values;
-- CREATE POLICY "Editors can write custom field values" ON public.document_custom_field_values
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING (((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))))
--   WITH CHECK (((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))));
-- ALTER POLICY "Custom field values follow document visibility" ON public.document_custom_field_values
--   USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id));
--
-- -- document_custom_fields
-- DROP POLICY "Custom field managers can manage custom fields (insert)" ON public.document_custom_fields;
-- DROP POLICY "Custom field managers can manage custom fields (update)" ON public.document_custom_fields;
-- DROP POLICY "Custom field managers can manage custom fields (delete)" ON public.document_custom_fields;
-- CREATE POLICY "Custom field managers can manage custom fields" ON public.document_custom_fields
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('documents.manage_custom_fields'::text)))
--   WITH CHECK ((select has_permission('documents.manage_custom_fields'::text)));
-- ALTER POLICY "Document viewers can view active custom fields" ON public.document_custom_fields
--   USING (((is_active = true) AND (select has_permission('documents.view'::text))));
--
-- -- document_tags
-- DROP POLICY "Tag managers can manage tags (insert)" ON public.document_tags;
-- DROP POLICY "Tag managers can manage tags (update)" ON public.document_tags;
-- DROP POLICY "Tag managers can manage tags (delete)" ON public.document_tags;
-- CREATE POLICY "Tag managers can manage tags" ON public.document_tags
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('documents.manage_tags'::text)))
--   WITH CHECK ((select has_permission('documents.manage_tags'::text)));
-- ALTER POLICY "Document viewers can view active tags" ON public.document_tags
--   USING (((is_active = true) AND (select has_permission('documents.view'::text))));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "document_categories": {
    "before": [
      "Admins can manage categories|ALL|authenticated|PERMISSIVE",
      "Authenticated users can view active categories|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins can manage categories (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins can manage categories (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins can manage categories (update)|UPDATE|authenticated|PERMISSIVE",
      "Authenticated users can view active categories|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "document_custom_field_values": {
    "before": [
      "Custom field values follow document visibility|SELECT|authenticated|PERMISSIVE",
      "Editors can write custom field values|ALL|authenticated|PERMISSIVE"
    ],
    "after": [
      "Custom field values follow document visibility|SELECT|authenticated|PERMISSIVE",
      "Editors can write custom field values (delete)|DELETE|authenticated|PERMISSIVE",
      "Editors can write custom field values (insert)|INSERT|authenticated|PERMISSIVE",
      "Editors can write custom field values (update)|UPDATE|authenticated|PERMISSIVE"
    ]
  },
  "document_custom_fields": {
    "before": [
      "Custom field managers can manage custom fields|ALL|authenticated|PERMISSIVE",
      "Document viewers can view active custom fields|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Custom field managers can manage custom fields (delete)|DELETE|authenticated|PERMISSIVE",
      "Custom field managers can manage custom fields (insert)|INSERT|authenticated|PERMISSIVE",
      "Custom field managers can manage custom fields (update)|UPDATE|authenticated|PERMISSIVE",
      "Document viewers can view active custom fields|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "document_tags": {
    "before": [
      "Document viewers can view active tags|SELECT|authenticated|PERMISSIVE",
      "Tag managers can manage tags|ALL|authenticated|PERMISSIVE"
    ],
    "after": [
      "Document viewers can view active tags|SELECT|authenticated|PERMISSIVE",
      "Tag managers can manage tags (delete)|DELETE|authenticated|PERMISSIVE",
      "Tag managers can manage tags (insert)|INSERT|authenticated|PERMISSIVE",
      "Tag managers can manage tags (update)|UPDATE|authenticated|PERMISSIVE"
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

-- document_categories
ALTER POLICY "Authenticated users can view active categories" ON public.document_categories
  USING (((is_active = TRUE) OR (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text))))));
DROP POLICY IF EXISTS "Admins can manage categories (insert)" ON public.document_categories;
CREATE POLICY "Admins can manage categories (insert)" ON public.document_categories
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))));
DROP POLICY IF EXISTS "Admins can manage categories (update)" ON public.document_categories;
CREATE POLICY "Admins can manage categories (update)" ON public.document_categories
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))));
DROP POLICY IF EXISTS "Admins can manage categories (delete)" ON public.document_categories;
CREATE POLICY "Admins can manage categories (delete)" ON public.document_categories
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))));
DROP POLICY IF EXISTS "Admins can manage categories" ON public.document_categories;

-- document_custom_field_values
ALTER POLICY "Custom field values follow document visibility" ON public.document_custom_field_values
  USING (((EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id)) OR ((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id))))));
DROP POLICY IF EXISTS "Editors can write custom field values (insert)" ON public.document_custom_field_values;
CREATE POLICY "Editors can write custom field values (insert)" ON public.document_custom_field_values
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))));
DROP POLICY IF EXISTS "Editors can write custom field values (update)" ON public.document_custom_field_values;
CREATE POLICY "Editors can write custom field values (update)" ON public.document_custom_field_values
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))))
  WITH CHECK (((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))));
DROP POLICY IF EXISTS "Editors can write custom field values (delete)" ON public.document_custom_field_values;
CREATE POLICY "Editors can write custom field values (delete)" ON public.document_custom_field_values
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))));
DROP POLICY IF EXISTS "Editors can write custom field values" ON public.document_custom_field_values;

-- document_custom_fields
ALTER POLICY "Document viewers can view active custom fields" ON public.document_custom_fields
  USING ((((is_active = true) AND (select has_permission('documents.view'::text))) OR (select has_permission('documents.manage_custom_fields'::text))));
DROP POLICY IF EXISTS "Custom field managers can manage custom fields (insert)" ON public.document_custom_fields;
CREATE POLICY "Custom field managers can manage custom fields (insert)" ON public.document_custom_fields
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('documents.manage_custom_fields'::text)));
DROP POLICY IF EXISTS "Custom field managers can manage custom fields (update)" ON public.document_custom_fields;
CREATE POLICY "Custom field managers can manage custom fields (update)" ON public.document_custom_fields
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('documents.manage_custom_fields'::text)))
  WITH CHECK ((select has_permission('documents.manage_custom_fields'::text)));
DROP POLICY IF EXISTS "Custom field managers can manage custom fields (delete)" ON public.document_custom_fields;
CREATE POLICY "Custom field managers can manage custom fields (delete)" ON public.document_custom_fields
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('documents.manage_custom_fields'::text)));
DROP POLICY IF EXISTS "Custom field managers can manage custom fields" ON public.document_custom_fields;

-- document_tags
ALTER POLICY "Document viewers can view active tags" ON public.document_tags
  USING ((((is_active = true) AND (select has_permission('documents.view'::text))) OR (select has_permission('documents.manage_tags'::text))));
DROP POLICY IF EXISTS "Tag managers can manage tags (insert)" ON public.document_tags;
CREATE POLICY "Tag managers can manage tags (insert)" ON public.document_tags
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('documents.manage_tags'::text)));
DROP POLICY IF EXISTS "Tag managers can manage tags (update)" ON public.document_tags;
CREATE POLICY "Tag managers can manage tags (update)" ON public.document_tags
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('documents.manage_tags'::text)))
  WITH CHECK ((select has_permission('documents.manage_tags'::text)));
DROP POLICY IF EXISTS "Tag managers can manage tags (delete)" ON public.document_tags;
CREATE POLICY "Tag managers can manage tags (delete)" ON public.document_tags
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('documents.manage_tags'::text)));
DROP POLICY IF EXISTS "Tag managers can manage tags" ON public.document_tags;

COMMIT;
