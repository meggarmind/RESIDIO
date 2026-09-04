-- ============================================================================
-- Migration: audit_logs SELECT policy follows settings.view_audit_logs, not
--            the legacy profiles.role column
-- ============================================================================
-- Purpose: Issue #181 (epic #180, wave 4d). The audit_logs SELECT policy
--          ("Admins and chairman can view audit logs", created in
--          20251213200000_create_audit_logs.sql) has two defects:
--
--          1. It reads `profiles.role` directly, bypassing the RBAC system
--             (app_roles / role_permissions / has_permission()) entirely --
--             the same class of drift #181 also fixes in the three legacy
--             role checks in src/actions/audit/get-audit-logs.ts.
--          2. It admits legacy role 'chairman'. Per ADR-0006, chairman must
--             not read audit logs. `settings.view_audit_logs` is held only
--             by super_admin and vice_chairman (verified against the live
--             role_permissions table ahead of this migration).
--
-- Access change (deliberate -- read this before applying):
--
--   Correction: an earlier draft of this comment claimed `LEGACY_ROLE_MAP`
--   writes a vice_chairman's legacy `profiles.role` column as 'chairman'. It
--   does not -- `src/actions/roles/assign-role.ts` maps only super_admin,
--   chairman, financial_officer and security_officer to a legacy bucket;
--   vice_chairman has no legacy equivalent and its `profiles.role` column is
--   NULL. (The `vice_chairman -> chairman` collapse exists, but only inside
--   the SQL function `get_my_role()`, which this policy never called -- it
--   read the raw column directly.) So this is not a pure revoke: it is a
--   revoke for chairman AND a new grant for vice_chairman.
--
--   | Role                                        | Before               | After                    |
--   |---------------------------------------------|----------------------|---------------------------|
--   | super_admin                                  | admitted (role='admin') | admitted               |
--   | chairman                                     | admitted (role='chairman') | REVOKED -- the intent |
--   | vice_chairman                                | not admitted (role IS NULL) | ADMITTED -- a new grant |
--   | stale role='admin' row whose role_id lacks the permission | admitted | revoked           |
--
--   Live check performed ahead of this migration (do not re-derive; re-run if
--   this migration sits unapplied for long enough that the roster may have
--   changed): exactly three active profiles exist today -- one super_admin
--   (holds settings.view_audit_logs), one chairman (does not), one
--   financial_officer (does not, and was never admitted by either policy).
--   No vice_chairman account exists yet, so today the new grant has zero
--   effect on live data, and no profile has a stale role='admin' whose
--   role_id lacks the permission. The only observable change on live data
--   right now is the chairman revocation.
--
-- has_permission() is SECURITY DEFINER (20251222000000_create_rbac_system.sql)
-- and additionally requires profiles.approval_status = 'active'
-- (20260829100200_gate_auth_helpers_on_approval_status.sql), so evaluating it
-- inside this policy does not recurse through RLS and does not admit a
-- pending/suspended account even if it otherwise holds the permission.
--
-- `TO authenticated` is required, not cosmetic: has_permission(text) has
-- EXECUTE revoked from `anon` (20260829100200), so without a TO clause this
-- policy would apply to PUBLIC including anon, and an unauthenticated SELECT
-- against audit_logs would raise "permission denied for function
-- has_permission" (a 500) instead of returning an empty set. Scoping to
-- `authenticated` matches how notification_queue's policies are written
-- (20251223000000_create_notification_system.sql) and keeps the failure mode
-- an empty result set, not an error.
--
-- The INSERT policy "Authenticated users can insert audit logs" is the audit
-- logging path (used by every server action's logAudit() call) and is NOT
-- touched by this migration -- dropping or narrowing it would silently stop
-- audit logging.
--
-- Written to be safely re-runnable: both DROP POLICY IF EXISTS statements
-- below are idempotent, so a second apply does not abort with 42710
-- (duplicate policy) the way a bare CREATE POLICY would.
--
-- This migration is NOT applied by the authoring session. Apply and verify
-- manually, then check it into the applied-migrations record per
-- docs/agents/migrations-on-merge.md.
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS "Admins and chairman can view audit logs" ON audit_logs;
DROP POLICY IF EXISTS "Users with settings.view_audit_logs can view audit logs" ON audit_logs;

CREATE POLICY "Users with settings.view_audit_logs can view audit logs"
  ON audit_logs FOR SELECT TO authenticated
  USING (public.has_permission('settings.view_audit_logs'));

COMMIT;

-- ============================================================================
-- Rollback -- original policy, verbatim from
-- 20251213200000_create_audit_logs.sql
-- ============================================================================
-- The original policy never called has_permission() and so never needed a TO
-- clause to avoid the anon EXECUTE-denied failure mode above; restoring it
-- verbatim (no TO authenticated) reproduces the original behaviour exactly.
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS "Users with settings.view_audit_logs can view audit logs" ON audit_logs;
--
-- CREATE POLICY "Admins and chairman can view audit logs"
--   ON audit_logs FOR SELECT
--   USING (
--     EXISTS (
--       SELECT 1 FROM profiles
--       WHERE profiles.id = auth.uid()
--       AND profiles.role IN ('admin', 'chairman')
--     )
--   );
--
-- COMMIT;
-- ============================================================================
