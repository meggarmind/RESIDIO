-- Enhance bank_statement_imports and bank_statement_rows for duplicate protection

-- Add columns to bank_statement_imports for file tracking and overlap detection
ALTER TABLE bank_statement_imports
ADD COLUMN IF NOT EXISTS file_hash TEXT,
ADD COLUMN IF NOT EXISTS period_start DATE,
ADD COLUMN IF NOT EXISTS period_end DATE;

-- Add transaction_hash to bank_statement_rows
ALTER TABLE bank_statement_rows
ADD COLUMN IF NOT EXISTS transaction_hash TEXT,
ADD COLUMN IF NOT EXISTS duplicate_reason TEXT;

-- Add transaction_hash to payment_records and expenses for cross-referencing
ALTER TABLE payment_records
ADD COLUMN IF NOT EXISTS transaction_hash TEXT;

ALTER TABLE expenses
ADD COLUMN IF NOT EXISTS transaction_hash TEXT;

-- Create unique constraints to prevent duplicates at the DB level
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'bank_statement_rows_transaction_hash_key') THEN
        ALTER TABLE bank_statement_rows ADD CONSTRAINT bank_statement_rows_transaction_hash_key UNIQUE (transaction_hash);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'payment_records_transaction_hash_key') THEN
        ALTER TABLE payment_records ADD CONSTRAINT payment_records_transaction_hash_key UNIQUE (transaction_hash);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'expenses_transaction_hash_key') THEN
        ALTER TABLE expenses ADD CONSTRAINT expenses_transaction_hash_key UNIQUE (transaction_hash);
    END IF;
END $$;

-- Add index for fast logical lookups
CREATE INDEX IF NOT EXISTS idx_bank_statement_rows_hash ON bank_statement_rows(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_payment_records_hash ON payment_records(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_expenses_hash ON expenses(transaction_hash);
CREATE INDEX IF NOT EXISTS idx_bank_statement_imports_file_hash ON bank_statement_imports(file_hash);

-- Audit log entries for these changes
COMMENT ON COLUMN bank_statement_rows.transaction_hash IS 'SHA-256 hash of date+amount+normalized_description+reference';
COMMENT ON COLUMN payment_records.transaction_hash IS 'Cross-reference hash from imported bank statement rows';
COMMENT ON COLUMN expenses.transaction_hash IS 'Cross-reference hash from imported bank statement rows';
COMMENT ON COLUMN bank_statement_imports.file_hash IS 'SHA-256 hash of the uploaded file content';
