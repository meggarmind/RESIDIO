-- Migration: Add verification columns to payment_records table
-- Part of Unified Expenditure Engine implementation

ALTER TABLE payment_records
ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bank_row_id uuid REFERENCES bank_statement_rows(id) ON DELETE SET NULL;

-- Add index for querying unverified payments
CREATE INDEX IF NOT EXISTS idx_payment_records_is_verified ON payment_records(is_verified);

-- Add comment for documentation
COMMENT ON COLUMN payment_records.is_verified IS 'Whether this payment has been verified against a bank statement';
COMMENT ON COLUMN payment_records.verified_at IS 'Timestamp when the payment was verified';
COMMENT ON COLUMN payment_records.verified_by IS 'Admin who manually verified the payment (null for auto-verified)';
COMMENT ON COLUMN payment_records.bank_row_id IS 'Link to the bank statement row that verified this payment';
