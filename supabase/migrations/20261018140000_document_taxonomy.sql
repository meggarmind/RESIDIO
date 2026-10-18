-- Migration: document taxonomy -- nested tags and typed custom fields (#382 Slice 2)
--
-- WHAT CHANGES
--   Four tables, structured like the Phase 15 migration (20251228100000):
--     document_tags                 name, color, parent_tag_id (self-FK, depth capped at 5), is_active
--     document_tag_assignments      document_id, tag_id, unique pair
--     document_custom_fields        name, data_type, options jsonb, is_active
--     document_custom_field_values  document_id, field_id, one typed value column per data_type
--   Two permissions in the existing `documents` category: documents.manage_tags and
--   documents.manage_custom_fields. No enum change.
--
-- WHO IS AFFECTED
--   The two new permissions go to every role that holds documents.manage_categories when this runs.
--   On Residio_Stage and Residio_Prod (read 2026-10-18) that is super_admin, chairman and
--   vice_chairman. No existing permission or policy changes.
--
-- RLS mirrors the documents policies:
--   * tag and field definitions: readers holding documents.view see active rows; holders of the
--     manage permission see and write every row (as document_categories does).
--   * assignments and values: visible exactly when the document itself is visible, because the
--     policy reads public.documents under the caller's own RLS (archived and private documents
--     included). Writes also need documents.update (tag assignment at upload: documents.upload).
--
-- Tags and custom-field values are keyed on the ROOT document (parent_document_id IS NULL). A
-- version upload is a new documents row pointing at the root, so the values survive it. The app
-- resolves the root before every read and write (src/actions/documents/taxonomy.ts).
--
-- Correspondents are not modelled: documents.resident_id and documents.house_id already exist,
-- and vendors live in the expenditure module.
--
-- IDEMPOTENT: IF NOT EXISTS / CREATE OR REPLACE / DROP ... IF EXISTS / ON CONFLICT DO NOTHING.
--
-- ROLLBACK:
--   BEGIN;
--   DROP TABLE IF EXISTS public.document_custom_field_values;
--   DROP TABLE IF EXISTS public.document_custom_fields;
--   DROP TABLE IF EXISTS public.document_tag_assignments;
--   DROP TABLE IF EXISTS public.document_tags;
--   DROP FUNCTION IF EXISTS public.enforce_document_tag_depth();
--   DROP FUNCTION IF EXISTS public.enforce_document_custom_field_value_type();
--   DROP FUNCTION IF EXISTS public.prevent_document_custom_field_type_change();
--   DROP FUNCTION IF EXISTS public.set_document_taxonomy_updated_at();
--   DELETE FROM public.role_permissions WHERE permission_id IN (SELECT id FROM public.app_permissions
--     WHERE name IN ('documents.manage_tags', 'documents.manage_custom_fields'));
--   DELETE FROM public.app_permissions WHERE name IN ('documents.manage_tags', 'documents.manage_custom_fields');
--   COMMIT;
--
-- VERIFY (run on the database after applying):
--   SELECT r.name AS role, p.name AS permission
--     FROM public.app_permissions p
--     JOIN public.role_permissions rp ON rp.permission_id = p.id
--     JOIN public.app_roles r ON r.id = rp.role_id
--    WHERE p.name IN ('documents.manage_tags', 'documents.manage_custom_fields')
--    ORDER BY 2, 1;
--     -- expect the roles holding documents.manage_categories, once per permission

BEGIN;

-- ============================================
-- 1. DOCUMENT TAGS (nested, depth capped at 5)
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  color VARCHAR(7) NOT NULL DEFAULT '#6b7280' CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  parent_tag_id UUID REFERENCES public.document_tags(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tags_not_own_parent CHECK (parent_tag_id IS DISTINCT FROM id)
);

CREATE UNIQUE INDEX IF NOT EXISTS document_tags_name_unique ON public.document_tags (lower(name));
CREATE INDEX IF NOT EXISTS idx_document_tags_parent ON public.document_tags (parent_tag_id)
  WHERE parent_tag_id IS NOT NULL;

-- Depth = 1 for a root tag. A tag's depth plus the height of the subtree under it must stay <= 5,
-- so re-parenting a branch cannot push its descendants past the cap. A parent chain that reaches
-- the tag itself is a cycle and is refused.
CREATE OR REPLACE FUNCTION public.enforce_document_tag_depth()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_max_depth CONSTANT INT := 5;
  v_ancestors INT := 0;
  v_height INT;
  v_cursor UUID := NEW.parent_tag_id;
BEGIN
  IF NEW.parent_tag_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Serialise tree edits: two concurrent re-parents could otherwise each pass and form a cycle.
  PERFORM pg_advisory_xact_lock(hashtext('public.document_tags.tree'));

  WHILE v_cursor IS NOT NULL LOOP
    IF v_cursor = NEW.id THEN
      RAISE EXCEPTION 'A tag cannot be nested under itself or one of its own sub-tags'
        USING ERRCODE = 'check_violation';
    END IF;
    v_ancestors := v_ancestors + 1;
    IF v_ancestors >= v_max_depth THEN
      RAISE EXCEPTION 'Tags can be nested at most % levels deep', v_max_depth
        USING ERRCODE = 'check_violation';
    END IF;
    SELECT parent_tag_id INTO v_cursor FROM public.document_tags WHERE id = v_cursor;
  END LOOP;

  WITH RECURSIVE subtree(id, lvl) AS (
    SELECT NEW.id, 1
    UNION ALL
    SELECT t.id, s.lvl + 1
      FROM public.document_tags t
      JOIN subtree s ON t.parent_tag_id = s.id
     WHERE s.lvl <= v_max_depth
  )
  SELECT max(lvl) INTO v_height FROM subtree;

  IF v_ancestors + v_height > v_max_depth THEN
    RAISE EXCEPTION 'Tags can be nested at most % levels deep', v_max_depth
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trigger_document_tags_depth ON public.document_tags;
CREATE TRIGGER trigger_document_tags_depth
  BEFORE INSERT OR UPDATE OF parent_tag_id ON public.document_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_document_tag_depth();

-- ============================================
-- 2. DOCUMENT TAG ASSIGNMENTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_tag_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.document_tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tag_assignments_document_tag_unique UNIQUE (document_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_document_tag_assignments_tag ON public.document_tag_assignments (tag_id);

-- ============================================
-- 3. DOCUMENT CUSTOM FIELDS
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  data_type TEXT NOT NULL
    CHECK (data_type IN ('text', 'number', 'date', 'money', 'boolean', 'url', 'document_link')),
  options JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(options) = 'object'),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS document_custom_fields_name_unique
  ON public.document_custom_fields (lower(name));

-- Stored values are typed by the field, so the type is fixed once the field exists.
CREATE OR REPLACE FUNCTION public.prevent_document_custom_field_type_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  IF NEW.data_type IS DISTINCT FROM OLD.data_type THEN
    RAISE EXCEPTION 'A custom field''s data type cannot be changed after it is created'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trigger_document_custom_fields_type_fixed ON public.document_custom_fields;
CREATE TRIGGER trigger_document_custom_fields_type_fixed
  BEFORE UPDATE OF data_type ON public.document_custom_fields
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_document_custom_field_type_change();

-- ============================================
-- 4. DOCUMENT CUSTOM FIELD VALUES (typed columns)
-- ============================================
CREATE TABLE IF NOT EXISTS public.document_custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.document_custom_fields(id) ON DELETE CASCADE,
  value_text TEXT,
  value_number NUMERIC,
  value_date DATE,
  value_money NUMERIC(15, 2),
  value_boolean BOOLEAN,
  value_url TEXT CHECK (value_url ~* '^https?://'),
  value_document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_custom_field_values_document_field_unique UNIQUE (document_id, field_id),
  CONSTRAINT document_custom_field_values_exactly_one CHECK (
    num_nonnulls(value_text, value_number, value_date, value_money, value_boolean, value_url, value_document_id) = 1
  )
);

CREATE INDEX IF NOT EXISTS idx_document_custom_field_values_field ON public.document_custom_field_values (field_id);
CREATE INDEX IF NOT EXISTS idx_document_custom_field_values_linked
  ON public.document_custom_field_values (value_document_id) WHERE value_document_id IS NOT NULL;

-- The one non-null column must be the one the field's data_type names.
CREATE OR REPLACE FUNCTION public.enforce_document_custom_field_value_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type INTO v_type FROM public.document_custom_fields WHERE id = NEW.field_id;

  -- Parenthesised: unwrapped, plpgsql would end the IF condition at the CASE's first THEN.
  IF v_type IS NULL OR NOT (CASE v_type
      WHEN 'text' THEN NEW.value_text IS NOT NULL
      WHEN 'number' THEN NEW.value_number IS NOT NULL
      WHEN 'date' THEN NEW.value_date IS NOT NULL
      WHEN 'money' THEN NEW.value_money IS NOT NULL
      WHEN 'boolean' THEN NEW.value_boolean IS NOT NULL
      WHEN 'url' THEN NEW.value_url IS NOT NULL
      WHEN 'document_link' THEN NEW.value_document_id IS NOT NULL
      ELSE FALSE
    END)
  THEN
    RAISE EXCEPTION 'Value does not match the custom field''s data type (%)', coalesce(v_type, 'unknown field')
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trigger_document_custom_field_values_type ON public.document_custom_field_values;
CREATE TRIGGER trigger_document_custom_field_values_type
  BEFORE INSERT OR UPDATE ON public.document_custom_field_values
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_document_custom_field_value_type();

-- ============================================
-- 5. TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION public.set_document_taxonomy_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $fn$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trigger_document_tags_updated_at ON public.document_tags;
CREATE TRIGGER trigger_document_tags_updated_at
  BEFORE UPDATE ON public.document_tags
  FOR EACH ROW EXECUTE FUNCTION public.set_document_taxonomy_updated_at();

DROP TRIGGER IF EXISTS trigger_document_custom_fields_updated_at ON public.document_custom_fields;
CREATE TRIGGER trigger_document_custom_fields_updated_at
  BEFORE UPDATE ON public.document_custom_fields
  FOR EACH ROW EXECUTE FUNCTION public.set_document_taxonomy_updated_at();

DROP TRIGGER IF EXISTS trigger_document_custom_field_values_updated_at ON public.document_custom_field_values;
CREATE TRIGGER trigger_document_custom_field_values_updated_at
  BEFORE UPDATE ON public.document_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.set_document_taxonomy_updated_at();

-- ============================================
-- 6. PERMISSIONS
-- ============================================
INSERT INTO public.app_permissions (name, display_name, description, category, is_active) VALUES
  ('documents.manage_tags', 'Manage Tags', 'Create, edit, nest and deactivate document tags', 'documents', true),
  ('documents.manage_custom_fields', 'Manage Custom Fields', 'Create, edit and deactivate document custom fields', 'documents', true)
ON CONFLICT (name) DO NOTHING;

-- Same roles as document management today: whoever holds documents.manage_categories.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, p.id
FROM public.role_permissions rp
JOIN public.app_permissions mc ON mc.id = rp.permission_id AND mc.name = 'documents.manage_categories'
CROSS JOIN public.app_permissions p
WHERE p.name IN ('documents.manage_tags', 'documents.manage_custom_fields')
ON CONFLICT DO NOTHING;

-- ============================================
-- 7. ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.document_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tag_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_custom_field_values ENABLE ROW LEVEL SECURITY;

-- Tags
DROP POLICY IF EXISTS "Document viewers can view active tags" ON public.document_tags;
CREATE POLICY "Document viewers can view active tags"
  ON public.document_tags FOR SELECT TO authenticated
  USING (is_active = TRUE AND public.has_permission('documents.view'));

DROP POLICY IF EXISTS "Tag managers can manage tags" ON public.document_tags;
CREATE POLICY "Tag managers can manage tags"
  ON public.document_tags FOR ALL TO authenticated
  USING (public.has_permission('documents.manage_tags'))
  WITH CHECK (public.has_permission('documents.manage_tags'));

-- Custom fields
DROP POLICY IF EXISTS "Document viewers can view active custom fields" ON public.document_custom_fields;
CREATE POLICY "Document viewers can view active custom fields"
  ON public.document_custom_fields FOR SELECT TO authenticated
  USING (is_active = TRUE AND public.has_permission('documents.view'));

DROP POLICY IF EXISTS "Custom field managers can manage custom fields" ON public.document_custom_fields;
CREATE POLICY "Custom field managers can manage custom fields"
  ON public.document_custom_fields FOR ALL TO authenticated
  USING (public.has_permission('documents.manage_custom_fields'))
  WITH CHECK (public.has_permission('documents.manage_custom_fields'));

-- Tag assignments: follow the document's own visibility
DROP POLICY IF EXISTS "Tag assignments follow document visibility" ON public.document_tag_assignments;
CREATE POLICY "Tag assignments follow document visibility"
  ON public.document_tag_assignments FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_tag_assignments.document_id));

DROP POLICY IF EXISTS "Uploaders and editors can assign tags" ON public.document_tag_assignments;
CREATE POLICY "Uploaders and editors can assign tags"
  ON public.document_tag_assignments FOR INSERT TO authenticated
  WITH CHECK (
    (public.has_permission('documents.upload') OR public.has_permission('documents.update'))
    AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_tag_assignments.document_id)
  );

DROP POLICY IF EXISTS "Editors can remove tags" ON public.document_tag_assignments;
CREATE POLICY "Editors can remove tags"
  ON public.document_tag_assignments FOR DELETE TO authenticated
  USING (
    public.has_permission('documents.update')
    AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_tag_assignments.document_id)
  );

-- Custom field values: follow the document's own visibility
DROP POLICY IF EXISTS "Custom field values follow document visibility" ON public.document_custom_field_values;
CREATE POLICY "Custom field values follow document visibility"
  ON public.document_custom_field_values FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id));

DROP POLICY IF EXISTS "Editors can write custom field values" ON public.document_custom_field_values;
CREATE POLICY "Editors can write custom field values"
  ON public.document_custom_field_values FOR ALL TO authenticated
  USING (
    public.has_permission('documents.update')
    AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id)
  )
  WITH CHECK (
    public.has_permission('documents.update')
    AND EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id)
  );

-- ============================================
-- 8. GRANTS (no anonymous access; trigger functions fire without EXECUTE)
-- ============================================
REVOKE ALL ON public.document_tags, public.document_tag_assignments,
  public.document_custom_fields, public.document_custom_field_values FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_tags, public.document_tag_assignments,
  public.document_custom_fields, public.document_custom_field_values TO authenticated;

REVOKE EXECUTE ON FUNCTION public.enforce_document_tag_depth(),
  public.enforce_document_custom_field_value_type(),
  public.prevent_document_custom_field_type_change(),
  public.set_document_taxonomy_updated_at() FROM PUBLIC, anon, authenticated;

COMMIT;
