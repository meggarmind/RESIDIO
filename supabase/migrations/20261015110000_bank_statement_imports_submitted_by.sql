-- Record who submitted a bank import for approval (#628, maker != checker).
--
-- WHAT CHANGES
--   ADD COLUMN public.bank_statement_imports.submitted_by uuid REFERENCES public.profiles(id)
--   ON DELETE SET NULL, and ADD COLUMN public.bank_statement_imports.submitted_at timestamptz.
--   Both nullable, no default.
--
-- WHY
--   submitForApproval recorded nobody, and approveImport never compared the approver with
--   anyone, so one person holding imports.review and imports.approve could submit and
--   approve the same import. Owner decision 2026-10-15: the submitter may not approve their
--   own import. The server writes submitted_by on submit and refuses approval when the
--   approver is the submitter.
--
-- WHO IS AFFECTED
--   Only the import approval flow. Existing rows get NULL (no submitter recorded); the
--   application treats NULL as "no submitter to compare with". bank_statement_imports is
--   empty on Residio_Stage and Residio_Prod today. No RLS, grant or policy changes. Adding
--   nullable columns without a default does not rewrite the table.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
--
-- ROLLBACK (loses submitter history only; statuses, approvals and rows are kept):
--   BEGIN;
--   ALTER TABLE public.bank_statement_imports DROP COLUMN IF EXISTS submitted_by;
--   ALTER TABLE public.bank_statement_imports DROP COLUMN IF EXISTS submitted_at;
--   COMMIT;
--   Roll the application code back first (or at the same time): submitForApproval writes
--   these columns and fails if they are missing.
--
-- VERIFY (run on the database after applying):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'bank_statement_imports'
--      AND column_name IN ('submitted_by', 'submitted_at')
--    ORDER BY column_name;
--     -- expect 2 rows: submitted_at timestamp with time zone YES null;
--     --                submitted_by uuid YES null
--   SELECT c.conname, c.confdeltype, c.confrelid::regclass AS references_table
--     FROM pg_constraint c
--    WHERE c.conrelid = 'public.bank_statement_imports'::regclass AND c.contype = 'f'
--      AND c.conkey = ARRAY[(SELECT attnum FROM pg_attribute
--                             WHERE attrelid = 'public.bank_statement_imports'::regclass
--                               AND attname = 'submitted_by')];
--     -- expect 1 row: references_table profiles, confdeltype 'n' (SET NULL)

BEGIN;

ALTER TABLE public.bank_statement_imports
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz;

COMMIT;
