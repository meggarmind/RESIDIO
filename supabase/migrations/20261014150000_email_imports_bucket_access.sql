-- ============================================================================
-- Migration: gate the email-imports storage bucket behind email_imports.view
-- ============================================================================
-- Issue #206. The private storage bucket `email-imports` (statement
-- attachments fetched from the estate mailbox) carried three policies on
-- storage.objects, two of which had no authorization at all:
--
--   1. "Allow authenticated uploads to email-imports"
--        INSERT TO authenticated WITH CHECK (bucket_id = 'email-imports')
--      Any signed-in account, including a resident, could write files.
--   2. "Allow authenticated reads from email-imports"
--        SELECT TO authenticated USING (bucket_id = 'email-imports')
--      Any signed-in account, including a resident, could read every file.
--   3. "Allow service role full access to email-imports"
--        ALL TO service_role (same predicate)
--      Correct, and the only path the app uses.
--
-- Every application code path (src/actions/email-imports/parse-email.ts,
-- src/lib/email-imports/store-attachments.ts,
-- src/lib/email-imports/fetch-emails.ts) uses createAdminClient(), the
-- service role. No user-JWT access to the bucket exists.
--
-- Owner decision (#206):
--   * Policy 2 is replaced by the same-named SELECT policy, TO authenticated,
--     USING (bucket_id = 'email-imports' AND
--     public.has_permission('email_imports.view')).
--   * Policy 1 is DROPPED. There is no user-facing upload path; uploads go
--     through the service role, which policy 3 covers. Nothing replaces it.
--   * Policy 3 is NOT touched. No other bucket and no other table is touched.
--
-- WHO LOSES WHAT: every signed-in account without email_imports.view loses
-- read access to the bucket, which includes resident, secretary,
-- security_officer and project_manager. Every signed-in account loses the
-- (unused) ability to upload. Holders of email_imports.view on Residio_Stage
-- (chairman, financial_officer, super_admin, vice_chairman) keep read access.
-- Service-role code paths are unaffected.
--
-- Idempotent: DROP POLICY IF EXISTS, then CREATE. Uses only has_permission();
-- no role-name comparisons.
--
-- ROLLBACK (restores exactly the three live predicates; policy 3 is never
-- touched by this migration, so it is not part of the rollback):
-- DROP POLICY IF EXISTS "Allow authenticated reads from email-imports" ON storage.objects;
-- CREATE POLICY "Allow authenticated reads from email-imports"
--   ON storage.objects FOR SELECT TO authenticated
--   USING (bucket_id = 'email-imports');
-- DROP POLICY IF EXISTS "Allow authenticated uploads to email-imports" ON storage.objects;
-- CREATE POLICY "Allow authenticated uploads to email-imports"
--   ON storage.objects FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'email-imports');
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Allow authenticated uploads to email-imports" ON storage.objects;

DROP POLICY IF EXISTS "Allow authenticated reads from email-imports" ON storage.objects;
CREATE POLICY "Allow authenticated reads from email-imports"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'email-imports' AND public.has_permission('email_imports.view'));

COMMIT;
