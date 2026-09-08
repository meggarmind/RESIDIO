-- Drop invoice_generation_locks.
--
-- This table exists in the live database but no migration ever created it, and
-- nothing in src/ reads or writes it. Concurrency for invoice-generation runs is
-- handled by row-level leasing on invoice_generation_candidates (FOR UPDATE SKIP
-- LOCKED plus a claimed_at lease inside claim_invoice_generation_candidates,
-- 20260813170000_harden_invoice_generation_run_lifecycle.sql), which supersedes
-- the abandoned lock-table approach.
--
-- Verified 2026-09-08 against the live database: 0 rows, no foreign keys either
-- direction, no triggers, no views/rules, no functions reference the table, and
-- the only RLS policies are the two catch-all authenticated policies that were
-- created with the scaffold. Dropping the table removes those with it.

BEGIN;

DROP TABLE IF EXISTS public.invoice_generation_locks;

COMMIT;