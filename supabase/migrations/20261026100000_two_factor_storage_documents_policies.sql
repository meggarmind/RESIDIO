-- Require the two-factor second step on the documents storage policies (#1041, follow-up to #1029).
--
-- WHAT CHANGES
--   ALTER POLICY on the four storage.objects policies for the `documents` bucket that check a
--   permission with their own profiles/role_permissions join: upload (INSERT, documents.upload),
--   download (SELECT, documents.view), update (UPDATE, documents.update) and delete (DELETE,
--   documents.delete). Each now also requires public.two_factor_session_ok() (#1029). The
--   expressions are otherwise copied unchanged from the live Residio_Stage definitions.
--   Accounts with two-factor off see no change.
--
-- WHY
--   20261026090000_two_factor_completion altered the public-schema policies only. These four still
--   let a session that skipped the second step read and change files in the documents bucket
--   through the storage API once its account turns two-factor on.
--
-- DEPENDS ON: 20261026090000_two_factor_completion (creates public.two_factor_session_ok()).
--
-- IDEMPOTENT: ALTER POLICY sets the full expression, so re-running gives the same result.
--
-- ROLLBACK (restores the policies without the two-factor check):
--   BEGIN;
--   -- Re-run the four ALTER POLICY statements below with the
--   -- `(select public.two_factor_session_ok()) AND` term removed.
--   COMMIT;
--
-- VERIFY (run on the database after applying):
--   SELECT policyname FROM pg_policies
--     WHERE schemaname = 'storage' AND tablename = 'objects'
--       AND policyname IN ('Users can upload documents to storage', 'Users can download documents from storage',
--                          'Users can update documents in storage', 'Users can delete documents from storage')
--       AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%two_factor_session_ok()%';  -- expect 4 rows
--   SELECT schemaname, tablename, policyname FROM pg_policies
--     WHERE coalesce(qual, '') || coalesce(with_check, '') LIKE '%role_permissions%'
--       AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%two_factor_session_ok()%';  -- expect 0 rows

ALTER POLICY "Users can upload documents to storage" ON storage.objects
  WITH CHECK ((select public.two_factor_session_ok()) AND ((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.upload'::text))))));
ALTER POLICY "Users can download documents from storage" ON storage.objects
  USING ((select public.two_factor_session_ok()) AND ((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.view'::text))))));
ALTER POLICY "Users can update documents in storage" ON storage.objects
  USING ((select public.two_factor_session_ok()) AND ((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.update'::text))))));
ALTER POLICY "Users can delete documents from storage" ON storage.objects
  USING ((select public.two_factor_session_ok()) AND ((bucket_id = 'documents'::text) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = auth.uid()) AND ((ap.name)::text = 'documents.delete'::text))))));
