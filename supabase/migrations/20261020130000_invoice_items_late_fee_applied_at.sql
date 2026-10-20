-- Migration: durable late-fee marker on invoice items (issue #830)
--
-- The late-fee run (src/lib/billing/apply-late-fees.ts) recorded that an invoice was charged only
-- by an invoice item described exactly 'Late Fee (auto)' (#806). Admin-written items are free text,
-- so an admin line with that description made the run and preview skip the invoice and sized any
-- waiver from it. late_fee_applied_at is set only by the run, on the item it creates; the run,
-- preview and waivers now read it instead of the description.
--
-- Backfill: existing 'Late Fee (auto)' items are taken as run-created, stamped with their
-- created_at. An admin item carrying that exact description before this migration cannot be told
-- apart and is backfilled too, which keeps today's behaviour for it.
--
-- ROLLBACK (revert the TS callers first, or the run errors on the missing column, then):
--   ALTER TABLE public.invoice_items DROP COLUMN IF EXISTS late_fee_applied_at;

ALTER TABLE public.invoice_items
    ADD COLUMN IF NOT EXISTS late_fee_applied_at timestamptz;

COMMENT ON COLUMN public.invoice_items.late_fee_applied_at IS
    'When the late-fee run created this item; NULL for every other item. The durable late-fee marker (#830).';

UPDATE public.invoice_items
SET late_fee_applied_at = created_at
WHERE description = 'Late Fee (auto)'
  AND late_fee_applied_at IS NULL;
