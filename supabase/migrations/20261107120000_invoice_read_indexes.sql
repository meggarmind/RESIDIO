-- Indexes for invoice reads (#1439).
--
-- WHAT CHANGES
--   Five btree indexes, created only if absent:
--     idx_invoice_items_invoice_id      invoice_items (invoice_id)
--     idx_invoices_house_id             invoices (house_id)
--     idx_invoices_status_due_date      invoices (status, due_date)
--     idx_invoices_created_at           invoices (created_at)
--     idx_invoices_charge_category      invoices (charge_category)
--   No table, column, policy or function is changed.
--
-- WHY (measured on Residio_Stage, 2 Nov 2026)
--   invoice_items had 97,824 sequential scans and 0 index scans. Reading 1,000 unpaid invoices
--   with their items took 953.8 ms without an invoice_items(invoice_id) index and 31.4 ms with it
--   (measured in a rolled-back transaction).
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.idx_invoice_items_invoice_id;
--   DROP INDEX IF EXISTS public.idx_invoices_house_id;
--   DROP INDEX IF EXISTS public.idx_invoices_status_due_date;
--   DROP INDEX IF EXISTS public.idx_invoices_created_at;
--   DROP INDEX IF EXISTS public.idx_invoices_charge_category;
--
-- IDEMPOTENT: CREATE INDEX IF NOT EXISTS. Not CONCURRENTLY: migrations run in a transaction.

CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON public.invoice_items (invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_house_id ON public.invoices (house_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status_due_date ON public.invoices (status, due_date);
CREATE INDEX IF NOT EXISTS idx_invoices_created_at ON public.invoices (created_at);
CREATE INDEX IF NOT EXISTS idx_invoices_charge_category ON public.invoices (charge_category);
