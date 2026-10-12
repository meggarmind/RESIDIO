-- Issue #473: maker-checker is not enforced on late_fee_waivers.
--
-- The single FOR ALL policy "Admins can manage late fee waivers" is gated on
-- billing.request_late_fee_waiver, so a financial_officer (request, not approve)
-- could set status = 'approved' through the Data API. Split it:
--   SELECT  billing.request_late_fee_waiver          (unchanged read behaviour)
--   INSERT  request permission, status 'pending', requested_by = caller
--   UPDATE  billing.approve_late_fee_waiver; the new row may only be 'approved'
--           when requested_by <> auth.uid() (requester cannot approve own)
--   DELETE  none (no caller in src/; previously open to request holders)
-- requested_by is made immutable by trigger, otherwise an approver could
-- re-point requested_by at someone else inside the same UPDATE and satisfy the
-- WITH CHECK. 'rejected' and 'pending' (the action's claim-release path) are
-- allowed for any approver.
--
-- Idempotent. Apply to Residio_Stage after merge, Residio_Prod with the release.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS late_fee_waivers_requested_by_immutable ON public.late_fee_waivers;
--   DROP FUNCTION IF EXISTS public.late_fee_waivers_requested_by_immutable();
--   DROP POLICY IF EXISTS "Request holders can view late fee waivers" ON public.late_fee_waivers;
--   DROP POLICY IF EXISTS "Request holders can create late fee waivers" ON public.late_fee_waivers;
--   DROP POLICY IF EXISTS "Approvers can decide late fee waivers" ON public.late_fee_waivers;
--   CREATE POLICY "Admins can manage late fee waivers"
--     ON public.late_fee_waivers FOR ALL TO authenticated
--     USING (public.has_permission('billing.request_late_fee_waiver'))
--     WITH CHECK (public.has_permission('billing.request_late_fee_waiver'));
--   (text from 20260905002000_policies_part_b_follow_permissions.sql:354)

DROP POLICY IF EXISTS "Admins can manage late fee waivers" ON public.late_fee_waivers;
DROP POLICY IF EXISTS "Request holders can view late fee waivers" ON public.late_fee_waivers;
DROP POLICY IF EXISTS "Request holders can create late fee waivers" ON public.late_fee_waivers;
DROP POLICY IF EXISTS "Approvers can decide late fee waivers" ON public.late_fee_waivers;

CREATE POLICY "Request holders can view late fee waivers"
  ON public.late_fee_waivers FOR SELECT TO authenticated
  USING (public.has_permission('billing.request_late_fee_waiver'));

CREATE POLICY "Request holders can create late fee waivers"
  ON public.late_fee_waivers FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission('billing.request_late_fee_waiver')
    AND status = 'pending'
    AND requested_by = auth.uid()
  );

CREATE POLICY "Approvers can decide late fee waivers"
  ON public.late_fee_waivers FOR UPDATE TO authenticated
  USING (public.has_permission('billing.approve_late_fee_waiver'))
  WITH CHECK (
    public.has_permission('billing.approve_late_fee_waiver')
    AND (status <> 'approved' OR requested_by <> auth.uid())
  );

CREATE OR REPLACE FUNCTION public.late_fee_waivers_requested_by_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.requested_by IS DISTINCT FROM OLD.requested_by THEN
    RAISE EXCEPTION 'late_fee_waivers.requested_by is immutable'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS late_fee_waivers_requested_by_immutable ON public.late_fee_waivers;
CREATE TRIGGER late_fee_waivers_requested_by_immutable
  BEFORE UPDATE ON public.late_fee_waivers
  FOR EACH ROW EXECUTE FUNCTION public.late_fee_waivers_requested_by_immutable();
