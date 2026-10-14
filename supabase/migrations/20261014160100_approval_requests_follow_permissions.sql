-- ============================================================================
-- Migration: approval_requests RLS follows the approvals permissions
-- ============================================================================
-- Purpose: Issue #577 (found under #555). Two approval_requests policies
--          authorize by comparing get_my_role_name() against a literal list of
--          role names (super_admin, chairman, vice_chairman), so the RBAC
--          catalogue is bypassed. financial_officer holds approvals.view and
--          approvals.approve_reject (granted deliberately in
--          20251222000000_create_rbac_system.sql) and the app gates on both
--          (authorizePermission in src/actions/approvals/index.ts), but RLS
--          silently denies it: it cannot see or decide requests.
--
--          OWNER DECISION (2026-10-14): financial_officer SHOULD be able to
--          view and approve/reject approval requests. The fix is to make the
--          policies follow the permissions (ADR-0007 direction), not to revoke
--          the grant.
--
-- Measured live on Residio_Stage, 2026-10-14:
--   approval_requests has four policies, all TO authenticated:
--     UPDATE "Admin and chairman can update approval requests"
--            USING and WITH CHECK get_my_role_name() = ANY (ARRAY['super_admin','chairman','vice_chairman'])
--     SELECT "Admin and chairman can view all approval requests"
--            USING get_my_role_name() = ANY (ARRAY['super_admin','chairman','vice_chairman'])
--     INSERT "Users can create their own approval requests"
--            WITH CHECK requested_by = auth.uid()
--     SELECT "Users can view their own approval requests"
--            USING requested_by = auth.uid()
--   Roles holding approvals.approve_reject and approvals.view: chairman,
--   financial_officer, super_admin, vice_chairman. The only role whose access
--   changes is financial_officer (gains view and update).
--
-- Scope: rewrites exactly the two role-name policies. Exact names, commands and
--        `TO authenticated` are kept so the policy set stays diffable by name.
--        The INSERT and own-row SELECT policies are untouched. No table,
--        column or grant changes. public.has_permission() is SECURITY DEFINER,
--        STABLE, true only for an active profile whose role holds an active
--        permission of that name.
--
-- Rollback (re-creates the old role-name policies):
--
--   DROP POLICY IF EXISTS "Admin and chairman can update approval requests" ON public.approval_requests;
--   CREATE POLICY "Admin and chairman can update approval requests" ON public.approval_requests
--     AS PERMISSIVE FOR UPDATE TO authenticated
--     USING (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]))
--     WITH CHECK (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]));
--
--   DROP POLICY IF EXISTS "Admin and chairman can view all approval requests" ON public.approval_requests;
--   CREATE POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
--     AS PERMISSIVE FOR SELECT TO authenticated
--     USING (get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text]));
--
-- This migration is NOT applied by the authoring session. Apply and verify per
-- docs/agents/migrations-on-merge.md and CORE.md section 11.
-- ============================================================================

DROP POLICY IF EXISTS "Admin and chairman can update approval requests" ON public.approval_requests;
CREATE POLICY "Admin and chairman can update approval requests" ON public.approval_requests
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (public.has_permission('approvals.approve_reject'))
  WITH CHECK (public.has_permission('approvals.approve_reject'));

DROP POLICY IF EXISTS "Admin and chairman can view all approval requests" ON public.approval_requests;
CREATE POLICY "Admin and chairman can view all approval requests" ON public.approval_requests
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (public.has_permission('approvals.view'));
