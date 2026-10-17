-- Migration: Revoke EXECUTE on process_expired_approvals() from authenticated (#701)
-- Purpose: process_expired_approvals() is SECURITY DEFINER and auto-rejects every expired pending
--   approval estate-wide, without notifying requesters. 20251231032140 granted it to authenticated
--   (as did the baseline's blanket GRANT), and 20260824201000 / 20260824202000 revoked only anon and
--   PUBLIC, so any signed-in user, a resident included, could call it through PostgREST.
-- Its only caller is the cron route /api/cron/expire-approvals, via expirePendingApprovals()
--   (src/lib/approvals/expire-approvals.ts), which uses the service-role admin client. service_role
--   keeps EXECUTE; the GRANT below only restates it. The function body is unchanged.
-- Idempotent: REVOKE/GRANT of an absent/present privilege is a no-op.
--
-- Verify after applying (expect authenticated=false, service_role=true):
--   SELECT has_function_privilege('authenticated', 'public.process_expired_approvals()', 'EXECUTE') AS authenticated,
--          has_function_privilege('service_role', 'public.process_expired_approvals()', 'EXECUTE') AS service_role;
--
-- ROLLBACK:
--   GRANT EXECUTE ON FUNCTION public.process_expired_approvals() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.process_expired_approvals() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_expired_approvals() TO service_role;
