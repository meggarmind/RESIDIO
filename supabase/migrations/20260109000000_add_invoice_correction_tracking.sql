-- Migration: Add Invoice Correction Tracking
-- Description: Adds fields to track invoice corrections (credit/debit notes) and link them to parent invoices
-- Author: Claude Code
-- Date: 2026-01-09

BEGIN;

-- Add correction tracking fields to invoices table
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parent_invoice_id UUID REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS correction_reason TEXT,
  ADD COLUMN IF NOT EXISTS is_correction BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS correction_type TEXT CHECK (correction_type IN ('credit_note', 'debit_note'));

-- Index for finding all corrections for an invoice (performance optimization)
CREATE INDEX IF NOT EXISTS idx_invoices_parent_invoice
  ON public.invoices(parent_invoice_id)
  WHERE parent_invoice_id IS NOT NULL;

-- Index for filtering correction invoices (reports and queries)
CREATE INDEX IF NOT EXISTS idx_invoices_is_correction
  ON public.invoices(is_correction)
  WHERE is_correction = TRUE;

-- Add column comments for documentation
COMMENT ON COLUMN public.invoices.parent_invoice_id IS 'Links correction invoices (credit/debit notes) to their parent invoice for audit trail';
COMMENT ON COLUMN public.invoices.correction_reason IS 'Business reason for the correction (e.g., "Payment misallocated - split for security and access card"). Appears in audit logs and emails.';
COMMENT ON COLUMN public.invoices.is_correction IS 'TRUE if this invoice is a credit note or debit note correction';
COMMENT ON COLUMN public.invoices.correction_type IS 'Type of correction: credit_note (reduces parent invoice) or debit_note (creates new charge)';

COMMIT;
