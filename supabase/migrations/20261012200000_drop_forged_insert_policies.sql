-- Issue #471: three tables accept forged inserts.
--
-- Drops exactly three permissive INSERT policies. Every legitimate writer uses
-- the service-role client, which bypasses RLS:
--   audit_logs             src/lib/audit/logger.ts            (createAdminClient)
--   late_fee_log           src/actions/billing/apply-late-fees.ts (createAdminClient)
--   invoice_generation_log scripts/generate-invoices-manual.ts (service-role key)
-- No SQL function, trigger or RPC inserts into any of the three (checked in
-- supabase/baseline and supabase/migrations; the only INSERTs are one-off
-- statements in 20260101231824_cleanup_test_users_and_role_flags.sql, run by
-- the migration owner). With RLS enabled and no INSERT policy, anon and
-- authenticated inserts fail with 42501.
--
-- Idempotent. Apply to Residio_Stage after merge, Residio_Prod with the release.
--
-- ROLLBACK (verbatim from supabase/baseline/00000000000000_baseline.sql):
--   CREATE POLICY "Authenticated users can insert audit logs" ON public.audit_logs AS PERMISSIVE FOR INSERT TO public
--     WITH CHECK ((auth.uid() IS NOT NULL));
--   CREATE POLICY invoice_generation_log_insert ON public.invoice_generation_log AS PERMISSIVE FOR INSERT TO public
--     WITH CHECK (true);
--   CREATE POLICY "System can insert late fee log" ON public.late_fee_log AS PERMISSIVE FOR INSERT TO authenticated
--     WITH CHECK (true);
--
-- Probe: docs/security/probe-471-473-rls.sql (rolled back, run by coordinator).

DROP POLICY IF EXISTS "Authenticated users can insert audit logs" ON public.audit_logs;
DROP POLICY IF EXISTS "invoice_generation_log_insert" ON public.invoice_generation_log;
DROP POLICY IF EXISTS "System can insert late fee log" ON public.late_fee_log;
