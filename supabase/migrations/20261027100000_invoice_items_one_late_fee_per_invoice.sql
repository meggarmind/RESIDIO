-- Migration: one late-fee item per invoice (issue #1057)
--
-- The late-fee run checked "already applied" and then inserted, so two overlapping runs (a
-- double-click on the manual trigger) could each add the fee. A partial unique index makes the
-- second insert fail with 23505, which the run treats as already applied.
--
-- Precondition: no invoice already holds two stamped items. Check before applying:
--   SELECT invoice_id FROM public.invoice_items WHERE late_fee_applied_at IS NOT NULL
--   GROUP BY invoice_id HAVING count(*) > 1;
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.invoice_items_one_late_fee_per_invoice;

CREATE UNIQUE INDEX IF NOT EXISTS invoice_items_one_late_fee_per_invoice
    ON public.invoice_items (invoice_id)
    WHERE late_fee_applied_at IS NOT NULL;
