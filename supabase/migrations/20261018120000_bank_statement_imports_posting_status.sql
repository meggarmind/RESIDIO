-- Add the 'posting' status to bank statement imports (#707, owner decision on #668 Q3).
--
-- WHAT CHANGES
--   Replaces the CHECK on public.bank_statement_imports.status with one that also allows
--   'posting'. Every value allowed before is still allowed.
--
-- WHY
--   processImport checked status = 'approved' and wrote the final status only at the end, so two
--   concurrent runs could both pass the check and create payments twice. It now claims the import
--   first with a guarded update (approved -> posting, WHERE status = 'approved'); a run that
--   updates zero rows creates nothing. The final write moves posting -> completed/failed.
--   'processing' is the review phase before submission, so it cannot double as the claim.
--
-- WHO IS AFFECTED
--   Only the bank statement import flow. Widening a CHECK changes no existing row, and no RLS,
--   grant or policy changes.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS, then ADD CONSTRAINT.
--
-- ROLLBACK (fails if any import is still in 'posting'; move those to 'failed' first):
--   BEGIN;
--   ALTER TABLE public.bank_statement_imports DROP CONSTRAINT IF EXISTS bank_statement_imports_status_check;
--   ALTER TABLE public.bank_statement_imports ADD CONSTRAINT bank_statement_imports_status_check
--     CHECK (status IN ('pending', 'processing', 'awaiting_approval', 'approved', 'completed', 'failed', 'rejected'));
--   COMMIT;
--   Roll the application code back first (or at the same time): processImport writes 'posting'
--   and every run fails at the claim if the value is not allowed.
--
-- VERIFY (run on the database after applying):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conrelid = 'public.bank_statement_imports'::regclass
--      AND conname = 'bank_statement_imports_status_check';
--     -- expect 1 row whose list includes 'posting' and the seven earlier values

BEGIN;

ALTER TABLE public.bank_statement_imports
  DROP CONSTRAINT IF EXISTS bank_statement_imports_status_check;

ALTER TABLE public.bank_statement_imports
  ADD CONSTRAINT bank_statement_imports_status_check
  CHECK (status IN ('pending', 'processing', 'awaiting_approval', 'approved', 'posting', 'completed', 'failed', 'rejected'));

COMMIT;
