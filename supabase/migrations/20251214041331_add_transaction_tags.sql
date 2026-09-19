-- Transaction Tags for categorizing imported bank statement rows
-- This allows admins to categorize transactions for financial reporting

-- Create transaction_tags table
CREATE TABLE transaction_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  transaction_type TEXT NOT NULL CHECK (transaction_type IN ('credit', 'debit')),
  description TEXT,
  color TEXT DEFAULT 'gray', -- For badge display (gray, blue, green, red, yellow, purple, orange)
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for querying by type
CREATE INDEX idx_transaction_tags_type ON transaction_tags(transaction_type, is_active);

-- Add tag columns to bank_statement_rows
ALTER TABLE bank_statement_rows
ADD COLUMN tag_id UUID REFERENCES transaction_tags(id),
ADD COLUMN tagged_by UUID REFERENCES profiles(id),
ADD COLUMN tagged_at TIMESTAMPTZ;

-- Create index for filtering by tag
CREATE INDEX idx_bank_statement_rows_tag ON bank_statement_rows(tag_id);

-- Enable RLS
ALTER TABLE transaction_tags ENABLE ROW LEVEL SECURITY;

-- RLS Policies for transaction_tags
-- SELECT: All authenticated users can view active tags
CREATE POLICY "Authenticated users can view transaction tags"
ON transaction_tags FOR SELECT
TO authenticated
USING (is_active = true OR get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- INSERT: Only admin can create tags
CREATE POLICY "Only admin can create transaction tags"
ON transaction_tags FOR INSERT
TO authenticated
WITH CHECK (get_my_role() = 'admin');

-- UPDATE: Only admin can update tags
CREATE POLICY "Only admin can update transaction tags"
ON transaction_tags FOR UPDATE
TO authenticated
USING (get_my_role() = 'admin');

-- DELETE: Only admin can delete tags
CREATE POLICY "Only admin can delete transaction tags"
ON transaction_tags FOR DELETE
TO authenticated
USING (get_my_role() = 'admin');

-- Seed default transaction tags
INSERT INTO transaction_tags (name, transaction_type, description, color, sort_order) VALUES
  -- Credit (incoming) tags
  ('Rent Payment', 'credit', 'Monthly rent collection', 'green', 10),
  ('Service Charge', 'credit', 'Service charge payments', 'blue', 20),
  ('Development Levy', 'credit', 'Development levy payments', 'purple', 30),
  ('Security Levy', 'credit', 'Security levy payments', 'orange', 40),
  ('Utility Payment', 'credit', 'Electricity, water, etc.', 'yellow', 50),
  ('Other Income', 'credit', 'Miscellaneous income', 'gray', 100),
  -- Debit (outgoing) tags
  ('Bank Charges', 'debit', 'Bank fees and charges', 'red', 10),
  ('Contractor Payment', 'debit', 'Payments to contractors', 'purple', 20),
  ('Utility Bills', 'debit', 'Estate utility bills', 'yellow', 30),
  ('Maintenance', 'debit', 'Maintenance expenses', 'blue', 40),
  ('Security Expenses', 'debit', 'Security-related payments', 'orange', 50),
  ('Other Expense', 'debit', 'Miscellaneous expenses', 'gray', 100);
