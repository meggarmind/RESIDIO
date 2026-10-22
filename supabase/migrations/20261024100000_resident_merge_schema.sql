-- Merge residents, schema and permission (#987, database half of #821). Migration A of three.
--
-- WHAT CHANGES
--   1. Permission residents.merge (category residents), granted to super_admin only (owner decision
--      Q1, 2026-10-21). Widen it later with a role_permissions seed, never by editing this file.
--   2. residents.merged_into_resident_id uuid NULL REFERENCES residents(id) ON DELETE RESTRICT.
--      Set only by public.merge_residents (20261024100100) on the archived duplicate. Two checks:
--        - residents_merged_into_not_self: a record is never merged into itself;
--        - residents_merged_into_archived: a merged record stays archived. Re-activating one means
--          undoing the merge by hand first (Q9: no un-merge button).
--   3. public.resident_merges: one row per merge. kept_resident_id, merged_resident_id (unique: a
--      record is merged once), merged_by, merged_at, snapshot jsonb (everything that moved, enough
--      to reverse the merge by hand, Q9) and counts jsonb (rows per table). Both resident columns are
--      ON DELETE RESTRICT, so a merged record and its history cannot be hard-deleted.
--      RLS: SELECT needs residents.merge. Nothing else is granted to anon or authenticated; rows are
--      written only by merge_residents, a SECURITY DEFINER function.
--   The application side registers PERMISSIONS.RESIDENTS_MERGE and the audit entity type
--   resident_merges in the same change.
--
-- WHO IS AFFECTED: nobody yet. No resident is merged until merge_residents is called, the new
--   column is NULL on every row, and only super_admin gains a permission.
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING, ADD COLUMN / CREATE TABLE / CREATE INDEX IF NOT EXISTS,
--   constraints and the policy are dropped before they are created.
--
-- ROLLBACK (apply the rollbacks of 20261024100200 and 20261024100100 first, they depend on this):
--   DROP TABLE IF EXISTS public.resident_merges;
--   ALTER TABLE public.residents DROP CONSTRAINT IF EXISTS residents_merged_into_archived;
--   ALTER TABLE public.residents DROP CONSTRAINT IF EXISTS residents_merged_into_not_self;
--   ALTER TABLE public.residents DROP COLUMN IF EXISTS merged_into_resident_id;
--   DELETE FROM public.app_permissions WHERE name = 'residents.merge';  -- role_permissions rows cascade
--   (Rolling back after a merge has run loses the merge history and the archived records' pointers.
--   Export public.resident_merges first.)
--
-- VERIFY (read-only, after applying):
--   SELECT r.name FROM public.role_permissions rp
--     JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name = 'residents.merge';                                         -- one row: super_admin
--   SELECT count(*) FROM public.residents WHERE merged_into_resident_id IS NOT NULL;  -- 0
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.resident_merges'::regclass;  -- true
--   SELECT has_table_privilege('anon', 'public.resident_merges', 'SELECT');           -- false

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('residents.merge', 'Merge Residents', 'Can merge a duplicate resident record into another: moves houses, payments, invoices, wallet and history, then archives the duplicate. Cannot be undone in the app.', 'residents', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name = 'super_admin'
  AND p.name = 'residents.merge'
ON CONFLICT DO NOTHING;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS merged_into_resident_id uuid NULL REFERENCES public.residents(id) ON DELETE RESTRICT;

ALTER TABLE public.residents DROP CONSTRAINT IF EXISTS residents_merged_into_not_self;
ALTER TABLE public.residents
  ADD CONSTRAINT residents_merged_into_not_self CHECK (merged_into_resident_id <> id);

ALTER TABLE public.residents DROP CONSTRAINT IF EXISTS residents_merged_into_archived;
ALTER TABLE public.residents
  ADD CONSTRAINT residents_merged_into_archived
  CHECK (merged_into_resident_id IS NULL OR account_status = 'archived');

COMMENT ON COLUMN public.residents.merged_into_resident_id IS
  'Set on an archived duplicate by merge_residents: the record it was merged into (#987). NULL on every other record.';

CREATE INDEX IF NOT EXISTS idx_residents_merged_into
  ON public.residents (merged_into_resident_id)
  WHERE merged_into_resident_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.resident_merges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kept_resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
  merged_resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
  merged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  merged_at timestamptz NOT NULL DEFAULT now(),
  snapshot jsonb NOT NULL,
  counts jsonb NOT NULL,
  CONSTRAINT resident_merges_distinct CHECK (kept_resident_id <> merged_resident_id),
  CONSTRAINT resident_merges_merged_resident_key UNIQUE (merged_resident_id)
);

COMMENT ON TABLE public.resident_merges IS
  'One row per resident merge (#987): who merged which duplicate into which record, and a snapshot of every row that moved so the merge can be reversed by hand. Written only by merge_residents.';

CREATE INDEX IF NOT EXISTS idx_resident_merges_kept
  ON public.resident_merges (kept_resident_id);

ALTER TABLE public.resident_merges ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.resident_merges FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.resident_merges TO authenticated;
GRANT ALL ON TABLE public.resident_merges TO service_role;

DROP POLICY IF EXISTS "resident_merges_select" ON public.resident_merges;
CREATE POLICY "resident_merges_select"
  ON public.resident_merges
  FOR SELECT
  TO authenticated
  USING ((SELECT public.has_permission('residents.merge')));

COMMIT;
