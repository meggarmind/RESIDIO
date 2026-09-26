-- Migration: Add verification and source columns to expenses table
-- Part of Unified Expenditure Engine implementation

-- Create enums for expense source type and payment method
DO $$ BEGIN
    CREATE TYPE expense_source_type AS ENUM ('manual', 'bank_import', 'petty_cash');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expense_payment_method AS ENUM ('bank_transfer', 'cash', 'cheque', 'pos');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Add new columns to expenses table
ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bank_row_id uuid REFERENCES bank_statement_rows(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS source_type expense_source_type NOT NULL DEFAULT 'manual',
ADD COLUMN IF NOT EXISTS payment_method expense_payment_method NOT NULL DEFAULT 'bank_transfer';

-- Add indexes for querying
CREATE INDEX IF NOT EXISTS idx_expenses_is_verified ON expenses(is_verified);
CREATE INDEX IF NOT EXISTS idx_expenses_source_type ON expenses(source_type);

-- Add comments for documentation
COMMENT ON COLUMN expenses.is_verified IS 'Whether this expense has been verified against a bank statement';
COMMENT ON COLUMN expenses.verified_at IS 'Timestamp when the expense was verified';
COMMENT ON COLUMN expenses.verified_by IS 'Admin who manually verified the expense (null for auto-verified)';
COMMENT ON COLUMN expenses.bank_row_id IS 'Link to the bank statement row that verified this expense';
COMMENT ON COLUMN expenses.source_type IS 'Origin of the expense: manual entry, bank import, or petty cash';
COMMENT ON COLUMN expenses.payment_method IS 'How the expense was paid';
