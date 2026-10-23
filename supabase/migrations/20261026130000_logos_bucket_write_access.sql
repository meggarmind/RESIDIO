-- Restrict writes to the logos storage bucket to settings admins (#1056).
--
-- WHAT CHANGES
--   ALTER POLICY on the three storage.objects write policies for the `logos` bucket: upload
--   (INSERT), update (UPDATE, both USING and WITH CHECK) and delete (DELETE). Each now also
--   requires public.has_permission('settings.manage_general'), the permission the estate logo
--   upload action (src/actions/settings/upload-estate-logo.ts) already checks. has_permission
--   also requires an active profile and, with two-factor on, the second step (#1029).
--   The bucket expressions are copied unchanged from the live Residio_Stage definitions.
--   Public read ("Allow public read access to logos") is unchanged: the logo is shown by its
--   public URL across the app and in documents.
--
-- WHY
--   20251229110000_add_logos_storage_bucket let any authenticated account write to the bucket.
--
-- IDEMPOTENT: ALTER POLICY sets the full expression, so re-running gives the same result.
--
-- ROLLBACK (restores any-authenticated-account writes):
--   BEGIN;
--   ALTER POLICY "Allow authenticated users to upload logos" ON storage.objects
--     WITH CHECK ((bucket_id = 'logos'::text));
--   ALTER POLICY "Allow authenticated users to update logos" ON storage.objects
--     USING ((bucket_id = 'logos'::text)) WITH CHECK ((bucket_id = 'logos'::text));
--   ALTER POLICY "Allow authenticated users to delete logos" ON storage.objects
--     USING ((bucket_id = 'logos'::text));
--   COMMIT;
--
-- VERIFY (run on the database after applying):
--   SELECT policyname, cmd FROM pg_policies
--     WHERE schemaname = 'storage' AND tablename = 'objects'
--       AND coalesce(qual, '') || coalesce(with_check, '') LIKE '%''logos''%'
--       AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%has_permission(''settings.manage_general''%';
--     -- expect 1 row: "Allow public read access to logos", SELECT
--   SELECT policyname FROM pg_policies
--     WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Allow authenticated users to update logos'
--       AND qual LIKE '%settings.manage_general%' AND with_check LIKE '%settings.manage_general%';  -- expect 1 row

BEGIN;

ALTER POLICY "Allow authenticated users to upload logos" ON storage.objects
  WITH CHECK ((bucket_id = 'logos'::text) AND (select public.has_permission('settings.manage_general')));
ALTER POLICY "Allow authenticated users to update logos" ON storage.objects
  USING ((bucket_id = 'logos'::text) AND (select public.has_permission('settings.manage_general')))
  WITH CHECK ((bucket_id = 'logos'::text) AND (select public.has_permission('settings.manage_general')));
ALTER POLICY "Allow authenticated users to delete logos" ON storage.objects
  USING ((bucket_id = 'logos'::text) AND (select public.has_permission('settings.manage_general')));

COMMIT;
