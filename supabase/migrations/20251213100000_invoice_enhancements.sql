-- Migration: Invoice Enhancements for Phase 1
-- Adds invoice type classification, rate snapshots, and window-based due dates

-- 1. Create invoice_type enum
DO $$ BEGIN
  CREATE TYPE invoice_type_enum AS ENUM (
    'SERVICE_CHARGE',  -- Regular monthly billing
    'LEVY',            -- One-time levies
    'ADJUSTMENT',      -- Credit/debit notes (Phase 2)
    'OTHER'            -- Miscellaneous
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add columns to invoices table
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type invoice_type_enum NOT NULL DEFAULT 'SERVICE_CHARGE',
  ADD COLUMN IF NOT EXISTS rate_snapshot JSONB;

-- 3. Create index for invoice_type filtering
CREATE INDEX IF NOT EXISTS idx_invoices_invoice_type ON invoices(invoice_type);

-- 4. Add comments for documentation
COMMENT ON COLUMN invoices.invoice_type IS 'Classification: SERVICE_CHARGE (monthly), LEVY (one-time), ADJUSTMENT (credit/debit notes), OTHER';
COMMENT ON COLUMN invoices.rate_snapshot IS 'Captured billing profile and items at time of invoice generation for audit';

-- 5. Update system setting: Change from day-of-month to window-based
-- First update existing setting if it exists
UPDATE system_settings
SET key = 'invoice_due_window_days',
    value = '"30"',
    description = 'Number of days from invoice issue date until due date'
WHERE key = 'invoice_due_day';

-- If setting doesn't exist, insert it
INSERT INTO system_settings (key, value, description, category)
VALUES ('invoice_due_window_days', '"30"', 'Number of days from invoice issue date until due date', 'billing')
ON CONFLICT (key) DO NOTHING;

-- 6. Backfill invoice_type for existing invoices
-- All invoices linked to house_levy_history are LEVY type
UPDATE invoices
SET invoice_type = 'LEVY'
WHERE id IN (SELECT invoice_id FROM house_levy_history WHERE invoice_id IS NOT NULL);

-- All other invoices are SERVICE_CHARGE (default already set, but ensure)
UPDATE invoices
SET invoice_type = 'SERVICE_CHARGE'
WHERE id NOT IN (SELECT invoice_id FROM house_levy_history WHERE invoice_id IS NOT NULL);
