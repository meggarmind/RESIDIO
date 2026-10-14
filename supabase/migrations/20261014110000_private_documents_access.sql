-- Issue #383 part B: private documents are visible only to the linked resident
-- and to holders of documents.update (owner-approved rule, 2026-10-14).
--
-- WHAT CHANGES
--   A documents row is "private" when resident_id OR house_id is non-null.
--   A private row, and the storage object holding its file, is readable only by:
--     (1) the linked resident: profiles.resident_id = documents.resident_id for
--         the caller, or, for house_id, the caller's profiles.resident_id has an
--         ACTIVE (is_active = true) resident_houses row for that house; and
--     (2) holders of documents.update (has_permission('documents.update')).
--   A row with BOTH resident_id and house_id null behaves exactly as today.
--
-- WHO LOSES ACCESS
--   security_officer and any other role holding only documents.view lose every
--   private row and its file (they keep all non-private documents). Holders of
--   documents.update and the linked resident keep access. No role name is
--   hardcoded (#213); the decision follows permissions.
--
-- TWO POLICIES, NOT ONE
--   The issue body named only public.documents. The storage policy "Users can
--   download documents from storage" admits ANY documents.view holder to ANY
--   object in the bucket, and signed URLs are minted with the caller's JWT, so
--   fixing the table alone would leave private files downloadable. Both are
--   replaced here.
--   Storage mapping: documents.file_path = storage.objects.name. Both upload
--   paths in src/actions/documents/upload-document.ts write the same bucket-
--   relative filePath to storage and to documents.file_path.
--   DECISION TO CONFIRM: a storage object with NO matching documents row is
--   readable only by documents.update holders (an orphan; fail closed).
--   If several rows share a file_path, every one of them must pass.
--
-- HELPERS
--   Both are SECURITY DEFINER STABLE with search_path pinned, so the policies do
--   not depend on the caller's RLS over profiles / resident_houses / documents
--   (a subquery under the caller's RLS could silently deny). EXECUTE is granted
--   to authenticated only; revoked from PUBLIC and anon.
--
-- LIVE-POLICY DISCREPANCY (CORE #228: live state is the truth)
--   Written against the policies measured on Residio_Stage on 2026-10-14, which
--   may differ from earlier migration files. The replacement and the rollback
--   below are expressed against the live definitions.
--
-- ROLLBACK:
-- BEGIN;
-- DROP POLICY IF EXISTS "Users can view documents based on permissions" ON public.documents;
-- CREATE POLICY "Users can view documents based on permissions"
--   ON public.documents FOR SELECT TO authenticated
--   USING (
--     (is_archived = false) AND (
--       EXISTS (
--         SELECT 1 FROM profiles p
--           JOIN role_permissions rp ON rp.role_id = p.role_id
--           JOIN app_permissions ap ON ap.id = rp.permission_id
--           JOIN app_roles ar ON ar.id = p.role_id
--         WHERE p.id = auth.uid() AND ap.name = 'documents.view' AND ar.name <> 'resident'
--       )
--       OR EXISTS (
--         SELECT 1 FROM profiles p
--           JOIN role_permissions rp ON rp.role_id = p.role_id
--           JOIN app_permissions ap ON ap.id = rp.permission_id
--           JOIN app_roles ar ON ar.id = p.role_id
--         WHERE p.id = auth.uid() AND ap.name = 'documents.view' AND ar.name = 'resident'
--           AND (
--             documents.category_id IS NULL
--             OR EXISTS (
--               SELECT 1 FROM document_categories dc
--               WHERE dc.id = documents.category_id AND dc.is_resident_accessible = true
--             )
--           )
--       )
--     )
--   );
-- DROP POLICY IF EXISTS "Users can download documents from storage" ON storage.objects;
-- CREATE POLICY "Users can download documents from storage"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (
--     (bucket_id = 'documents') AND EXISTS (
--       SELECT 1 FROM profiles p
--         JOIN role_permissions rp ON rp.role_id = p.role_id
--         JOIN app_permissions ap ON ap.id = rp.permission_id
--       WHERE p.id = auth.uid() AND ap.name = 'documents.view'
--     )
--   );
-- DROP FUNCTION IF EXISTS public.can_read_document_file(text);
-- DROP FUNCTION IF EXISTS public.can_view_private_document(uuid, uuid);
-- COMMIT;

BEGIN;

CREATE OR REPLACE FUNCTION public.can_view_private_document(p_resident_id uuid, p_house_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
  SELECT
    (p_resident_id IS NULL AND p_house_id IS NULL)
    OR public.has_permission('documents.update')
    OR EXISTS (
      SELECT 1 FROM public.profiles pr
      WHERE pr.id = auth.uid()
        AND pr.resident_id IS NOT NULL
        AND (
          pr.resident_id = p_resident_id
          OR EXISTS (
            SELECT 1 FROM public.resident_houses rh
            WHERE rh.resident_id = pr.resident_id
              AND rh.house_id = p_house_id
              AND rh.is_active = true
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.can_read_document_file(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = p_object_name) THEN
      EXISTS (
        SELECT 1
        FROM public.profiles p
          JOIN public.role_permissions rp ON rp.role_id = p.role_id
          JOIN public.app_permissions ap ON ap.id = rp.permission_id
        WHERE p.id = auth.uid() AND ap.name = 'documents.view'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.file_path = p_object_name
          AND NOT public.can_view_private_document(d.resident_id, d.house_id)
      )
    ELSE public.has_permission('documents.update')
  END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_view_private_document(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_read_document_file(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_private_document(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_read_document_file(text) TO authenticated;

DROP POLICY IF EXISTS "Users can view documents based on permissions" ON public.documents;
CREATE POLICY "Users can view documents based on permissions"
  ON public.documents FOR SELECT TO authenticated
  USING (
    (
      (is_archived = false) AND (
        EXISTS (
          SELECT 1 FROM profiles p
            JOIN role_permissions rp ON rp.role_id = p.role_id
            JOIN app_permissions ap ON ap.id = rp.permission_id
            JOIN app_roles ar ON ar.id = p.role_id
          WHERE p.id = auth.uid() AND ap.name = 'documents.view' AND ar.name <> 'resident'
        )
        OR EXISTS (
          SELECT 1 FROM profiles p
            JOIN role_permissions rp ON rp.role_id = p.role_id
            JOIN app_permissions ap ON ap.id = rp.permission_id
            JOIN app_roles ar ON ar.id = p.role_id
          WHERE p.id = auth.uid() AND ap.name = 'documents.view' AND ar.name = 'resident'
            AND (
              documents.category_id IS NULL
              OR EXISTS (
                SELECT 1 FROM document_categories dc
                WHERE dc.id = documents.category_id AND dc.is_resident_accessible = true
              )
            )
        )
      )
    )
    AND public.can_view_private_document(documents.resident_id, documents.house_id)
  );

DROP POLICY IF EXISTS "Users can download documents from storage" ON storage.objects;
CREATE POLICY "Users can download documents from storage"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    (bucket_id = 'documents') AND public.can_read_document_file(name)
  );

COMMIT;
