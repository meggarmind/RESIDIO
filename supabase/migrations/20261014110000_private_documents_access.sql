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
-- DESIGN: RESTRICTIVE POLICIES, LIVE POLICIES UNTOUCHED
--   The live permissive SELECT policies are NOT dropped, recreated or restated:
--     public.documents   "Users can view documents based on permissions"
--     storage.objects    "Users can download documents from storage"
--   Restating the documents policy would copy its role-name comparisons into a
--   new migration, which the hardcoded-role-name ratchet forbids; rewriting them
--   is owned by #213. Instead two RESTRICTIVE SELECT policies are added.
--   Postgres combines policies as (any PERMISSIVE passes) AND (every RESTRICTIVE
--   passes), so a row or file is visible only if BOTH the live policy and the new
--   restriction pass. The live policies keep admitting exactly whom they admit
--   today; the restriction can only remove access, never add it.
--
-- WHO LOSES ACCESS
--   security_officer and any other role holding only documents.view lose every
--   private row and its file (they keep all non-private documents). Holders of
--   documents.update and the linked resident keep whatever the live policies
--   already gave them. No role name is used; the decision follows permissions.
--
-- TWO POLICIES, NOT ONE
--   The issue body named only public.documents. The live storage policy admits
--   ANY documents.view holder to ANY object in the bucket, and signed URLs are
--   minted with the caller's JWT, so restricting the table alone would leave
--   private files downloadable.
--   A restrictive policy on storage.objects applies to EVERY bucket, so the
--   storage restriction opens with `bucket_id <> 'documents' OR ...` and other
--   buckets pass untouched.
--   Storage mapping: documents.file_path = storage.objects.name. Both upload
--   paths in src/actions/documents/upload-document.ts write the same bucket-
--   relative filePath to storage and to documents.file_path.
--   DECISION TO CONFIRM: a storage object in the documents bucket with NO
--   matching documents row is readable only by documents.update holders (an
--   orphan; fail closed). If several rows share a file_path, every one must pass.
--
-- HELPERS
--   Both are SECURITY DEFINER STABLE with search_path pinned, so the policies do
--   not depend on the caller's RLS over profiles / resident_houses / documents
--   (a subquery under the caller's RLS could silently deny). EXECUTE is granted
--   to authenticated only; revoked from PUBLIC and anon.
--
-- ROLLBACK (nothing live is replaced, so nothing else to restore):
-- BEGIN;
-- DROP POLICY IF EXISTS "Private documents visible to linked resident or editors" ON public.documents;
-- DROP POLICY IF EXISTS "Document files follow document visibility" ON storage.objects;
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
        AND pr.approval_status = 'active'
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

DROP POLICY IF EXISTS "Private documents visible to linked resident or editors" ON public.documents;
CREATE POLICY "Private documents visible to linked resident or editors"
  ON public.documents AS RESTRICTIVE FOR SELECT TO authenticated
  USING (public.can_view_private_document(resident_id, house_id));

DROP POLICY IF EXISTS "Document files follow document visibility" ON storage.objects;
CREATE POLICY "Document files follow document visibility"
  ON storage.objects AS RESTRICTIVE FOR SELECT TO authenticated
  USING (bucket_id <> 'documents' OR public.can_read_document_file(name));

COMMIT;
