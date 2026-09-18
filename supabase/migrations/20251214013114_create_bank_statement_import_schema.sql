-- Phase 6: Bank Statement Import & Payment Tracking
-- Migration: Create tables for bank statement import functionality

-- ============================================
-- 1. Resident Payment Aliases
-- ============================================
-- Stores alternative names used by residents when making payments
-- (e.g., spouse name, company name, family member)

CREATE TABLE resident_payment_aliases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  alias_name TEXT NOT NULL,
  notes TEXT, -- optional: "Wife's account", "Company account"
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id),
  UNIQUE(resident_id, alias_name)
);

-- Index for fast lookup during matching
CREATE INDEX idx_payment_aliases_name ON resident_payment_aliases(LOWER(alias_name));
CREATE INDEX idx_payment_aliases_resident ON resident_payment_aliases(resident_id);

-- RLS for resident_payment_aliases
ALTER TABLE resident_payment_aliases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin, Chairman, Financial Secretary can manage aliases"
  ON resident_payment_aliases
  FOR ALL
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- ============================================
-- 2. Estate Bank Accounts
-- ============================================
-- Reference table for estate bank accounts that receive payments

CREATE TABLE estate_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_number TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  bank_name TEXT NOT NULL DEFAULT 'FirstBank',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for estate_bank_accounts
ALTER TABLE estate_bank_accounts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view bank accounts"
  ON estate_bank_accounts
  FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Admin can manage bank accounts"
  ON estate_bank_accounts
  FOR ALL
  USING (get_my_role() = 'admin');

-- Seed initial bank accounts
INSERT INTO estate_bank_accounts (account_number, account_name, bank_name) VALUES
  ('2020473725', 'Estate Account 1', 'FirstBank'),
  ('2033212151', 'Estate Account 2', 'FirstBank');

-- ============================================
-- 3. Bank Statement Imports
-- ============================================
-- Tracks each import session/batch

CREATE TABLE bank_statement_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL CHECK (file_type IN ('csv', 'xlsx')),
  bank_account_id UUID REFERENCES estate_bank_accounts(id),
  bank_name TEXT DEFAULT 'FirstBank',
  transaction_filter TEXT DEFAULT 'credit' CHECK (transaction_filter IN ('credit', 'debit', 'all')),
  total_rows INTEGER NOT NULL DEFAULT 0,
  matched_rows INTEGER DEFAULT 0,
  created_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  error_rows INTEGER DEFAULT 0,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'awaiting_approval', 'approved', 'completed', 'failed', 'rejected')),
  column_mapping JSONB,
  import_summary JSONB,
  created_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Indexes for bank_statement_imports
CREATE INDEX idx_imports_status ON bank_statement_imports(status);
CREATE INDEX idx_imports_created_by ON bank_statement_imports(created_by);
CREATE INDEX idx_imports_bank_account ON bank_statement_imports(bank_account_id);
CREATE INDEX idx_imports_created_at ON bank_statement_imports(created_at DESC);

-- RLS for bank_statement_imports
ALTER TABLE bank_statement_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin, Chairman, Financial Secretary can manage imports"
  ON bank_statement_imports
  FOR ALL
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- ============================================
-- 4. Bank Statement Rows
-- ============================================
-- Individual rows from imported bank statements

CREATE TABLE bank_statement_rows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id UUID NOT NULL REFERENCES bank_statement_imports(id) ON DELETE CASCADE,
  row_number INTEGER NOT NULL,
  raw_data JSONB NOT NULL,
  transaction_date DATE,
  description TEXT,
  amount DECIMAL(12,2),
  transaction_type TEXT CHECK (transaction_type IN ('credit', 'debit')),
  reference TEXT,
  matched_resident_id UUID REFERENCES residents(id),
  match_confidence TEXT CHECK (match_confidence IN ('high', 'medium', 'low', 'none', 'manual')),
  match_method TEXT CHECK (match_method IN ('alias', 'phone', 'name', 'house_number', 'manual')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'matched', 'unmatched', 'duplicate', 'created', 'skipped', 'error')),
  payment_id UUID REFERENCES payment_records(id),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for bank_statement_rows
CREATE INDEX idx_import_rows_import ON bank_statement_rows(import_id);
CREATE INDEX idx_import_rows_status ON bank_statement_rows(status);
CREATE INDEX idx_import_rows_resident ON bank_statement_rows(matched_resident_id);
CREATE INDEX idx_import_rows_date ON bank_statement_rows(transaction_date);

-- RLS for bank_statement_rows
ALTER TABLE bank_statement_rows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin, Chairman, Financial Secretary can manage import rows"
  ON bank_statement_rows
  FOR ALL
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

-- ============================================
-- 5. Add import tracking to payment_records
-- ============================================

ALTER TABLE payment_records
ADD COLUMN import_id UUID REFERENCES bank_statement_imports(id),
ADD COLUMN import_row_id UUID REFERENCES bank_statement_rows(id);

-- Index for finding payments by import
CREATE INDEX idx_payments_import ON payment_records(import_id);

-- ============================================
-- 6. Add import approval setting to system_settings
-- ============================================

INSERT INTO system_settings (key, value, description)
VALUES ('import_requires_approval', 'false', 'When true, bank statement imports require approval before payments are created')
ON CONFLICT (key) DO NOTHING;
