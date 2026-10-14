-- Revoke anon EXECUTE on SECURITY DEFINER functions and drop duplicate indexes (#63, slice 1).
--
-- WHAT CHANGES
--   1. REVOKE EXECUTE FROM PUBLIC, anon on public.adjust_wallet_credit(...) and
--      public.adjust_wallet_debit(...).
--   2. REVOKE EXECUTE FROM PUBLIC, anon, authenticated on
--      public.assert_active_super_admin_exists().
--   3. DROP INDEX IF EXISTS for three exact duplicates (below).
--
-- WHY
--   Supabase advisors flag SECURITY DEFINER functions that anon can execute over
--   RPC. The two wallet functions already refuse callers without
--   billing.manage_wallets (unless service_role), so this is defence in depth.
--   assert_active_super_admin_exists() RETURNS trigger; it cannot be called over
--   RPC, and trigger firing does not check the firing user's EXECUTE privilege.
--   The duplicate indexes cost write amplification and storage for no read benefit.
--
-- WHO LOSES WHAT
--   adjust_wallet_credit / adjust_wallet_debit: anon and PUBLIC lose EXECUTE.
--     authenticated KEEPS it (src/actions/billing/wallet.ts calls them with the
--     signed-in user's client; the in-function permission check gates use).
--   assert_active_super_admin_exists: anon, PUBLIC and authenticated lose EXECUTE.
--   service_role and postgres are untouched on all three.
--
-- DUPLICATE INDEXES (identical definitions, verified on Residio_Stage 2026-10-14)
--   public.announcement_read_receipts: drop idx_read_receipts_announcement
--     (kept: idx_announcement_read_receipts_announcement)
--   public.audit_logs: drop idx_audit_logs_entity_type_created
--     (kept: idx_audit_logs_entity_created)
--   public.generated_reports: drop idx_generated_reports_created (0 scans)
--     (kept: idx_generated_reports_created_at, 111 scans)
--
-- IDEMPOTENT: REVOKE of an absent privilege is a no-op; DROP INDEX IF EXISTS.
--
-- ROLLBACK (restores exactly the prior ACLs and index definitions):
--   Prior ACLs, measured on Residio_Stage 2026-10-14:
--     wallet functions: {postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--     trigger function: {=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
--   BEGIN;
--   GRANT EXECUTE ON FUNCTION public.adjust_wallet_credit(uuid, numeric, text, uuid, text) TO anon;
--   GRANT EXECUTE ON FUNCTION public.adjust_wallet_debit(uuid, numeric, text, uuid, text) TO anon;
--   GRANT EXECUTE ON FUNCTION public.assert_active_super_admin_exists() TO PUBLIC;
--   GRANT EXECUTE ON FUNCTION public.assert_active_super_admin_exists() TO anon;
--   GRANT EXECUTE ON FUNCTION public.assert_active_super_admin_exists() TO authenticated;
--   CREATE INDEX IF NOT EXISTS idx_read_receipts_announcement ON public.announcement_read_receipts USING btree (announcement_id);
--   CREATE INDEX IF NOT EXISTS idx_audit_logs_entity_type_created ON public.audit_logs USING btree (entity_type, created_at DESC);
--   CREATE INDEX IF NOT EXISTS idx_generated_reports_created ON public.generated_reports USING btree (created_at DESC);
--   COMMIT;
--   (PUBLIC was never granted on the wallet functions; their ACLs have no "=X" entry,
--   so no PUBLIC re-grant is written for them.)

BEGIN;

REVOKE EXECUTE ON FUNCTION public.adjust_wallet_credit(uuid, numeric, text, uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.adjust_wallet_debit(uuid, numeric, text, uuid, text) FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.assert_active_super_admin_exists() FROM PUBLIC, anon, authenticated;

DROP INDEX IF EXISTS public.idx_read_receipts_announcement;
DROP INDEX IF EXISTS public.idx_audit_logs_entity_type_created;
DROP INDEX IF EXISTS public.idx_generated_reports_created;

COMMIT;
