-- Record when an approved request's changes were actually applied (#557).
--
-- approveRequest claims a request (status = 'approved') and THEN applies it. If the
-- process dies between the claim and the apply, or the release after a failed apply also
-- fails, the row stays 'approved' with its change NOT applied, and nothing could tell that
-- row apart from one that was applied. applied_at is set once the apply succeeds, so an
-- approved row with a null applied_at is exactly the stuck case, and reapplyApprovedRequest
-- can safely re-apply it.
--
-- Backfill: rows approved before this column existed were applied under the old flow, so
-- they take reviewed_at. Both live databases hold zero rows at the time of writing.
--
-- No policy, grant or index change: the existing policies already cover the table.
--
-- Rollback:
--   ALTER TABLE public.approval_requests DROP COLUMN applied_at;

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS applied_at timestamptz;

UPDATE public.approval_requests
SET applied_at = reviewed_at
WHERE status = 'approved' AND applied_at IS NULL;
