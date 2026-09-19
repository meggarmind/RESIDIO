-- Add email import tracking columns to payment_records
ALTER TABLE payment_records
ADD COLUMN IF NOT EXISTS email_import_id UUID REFERENCES email_imports(id),
ADD COLUMN IF NOT EXISTS email_transaction_id UUID REFERENCES email_transactions(id);

-- Add index for email import lookup
CREATE INDEX IF NOT EXISTS idx_payment_records_email_import 
ON payment_records(email_import_id) 
WHERE email_import_id IS NOT NULL;

-- Add index for email transaction lookup
CREATE INDEX IF NOT EXISTS idx_payment_records_email_transaction 
ON payment_records(email_transaction_id) 
WHERE email_transaction_id IS NOT NULL;
