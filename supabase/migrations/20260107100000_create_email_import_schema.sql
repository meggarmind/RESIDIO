-- ============================================================
-- Email Import Schema for Gmail Bank Statement Integration
-- ============================================================
-- This migration creates the tables needed for:
-- 1. Storing Gmail OAuth credentials (encrypted)
-- 2. Tracking email import sessions
-- 3. Storing email messages and attachments
-- 4. Extracted transactions for matching/processing
-- 5. Bank account PDF passwords (encrypted)

-- ============================================================
-- 1. Estate Bank Account Passwords (for password-protected PDFs)
-- ============================================================

CREATE TABLE IF NOT EXISTS estate_bank_account_passwords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bank_account_id UUID NOT NULL REFERENCES estate_bank_accounts(id) ON DELETE CASCADE,
  password_encrypted TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id),
  CONSTRAINT unique_bank_account_password UNIQUE (bank_account_id)
);

-- Comments
COMMENT ON TABLE estate_bank_account_passwords IS 'Encrypted passwords for bank account PDF statements';
COMMENT ON COLUMN estate_bank_account_passwords.password_encrypted IS 'AES-256-GCM encrypted password';

-- ============================================================
-- 2. Gmail OAuth Credentials
-- ============================================================

CREATE TABLE IF NOT EXISTS gmail_oauth_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_address TEXT NOT NULL,
  access_token_encrypted TEXT NOT NULL,
  refresh_token_encrypted TEXT NOT NULL,
  token_expiry TIMESTAMPTZ NOT NULL,
  scopes TEXT[] NOT NULL DEFAULT ARRAY['https://www.googleapis.com/auth/gmail.readonly'],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_sync_at TIMESTAMPTZ,
  last_sync_status TEXT CHECK (last_sync_status IN ('success', 'error', 'partial')),
  last_sync_message TEXT,
  last_sync_emails_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Only allow one active Gmail connection
CREATE UNIQUE INDEX IF NOT EXISTS idx_gmail_oauth_single_active
  ON gmail_oauth_credentials (is_active) WHERE (is_active = TRUE);

-- Comments
COMMENT ON TABLE gmail_oauth_credentials IS 'Gmail OAuth 2.0 credentials for email import integration';
COMMENT ON COLUMN gmail_oauth_credentials.access_token_encrypted IS 'AES-256-GCM encrypted access token';
COMMENT ON COLUMN gmail_oauth_credentials.refresh_token_encrypted IS 'AES-256-GCM encrypted refresh token';
COMMENT ON COLUMN gmail_oauth_credentials.is_active IS 'Only one active connection allowed';

-- ============================================================
-- 3. Email Import Sessions
-- ============================================================

CREATE TYPE email_import_status AS ENUM (
  'pending',
  'fetching',
  'parsing',
  'matching',
  'processing',
  'completed',
  'failed'
);

CREATE TYPE email_import_trigger AS ENUM (
  'manual',
  'cron'
);

CREATE TABLE IF NOT EXISTS email_imports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_email TEXT NOT NULL,
  bank_name TEXT NOT NULL DEFAULT 'First Bank',
  trigger_type email_import_trigger NOT NULL,

  -- Counters
  emails_fetched INTEGER NOT NULL DEFAULT 0,
  emails_parsed INTEGER NOT NULL DEFAULT 0,
  emails_skipped INTEGER NOT NULL DEFAULT 0,
  emails_errored INTEGER NOT NULL DEFAULT 0,
  transactions_extracted INTEGER NOT NULL DEFAULT 0,
  transactions_matched INTEGER NOT NULL DEFAULT 0,
  transactions_auto_processed INTEGER NOT NULL DEFAULT 0,
  transactions_queued INTEGER NOT NULL DEFAULT 0,
  transactions_skipped INTEGER NOT NULL DEFAULT 0,
  transactions_errored INTEGER NOT NULL DEFAULT 0,

  -- Status
  status email_import_status NOT NULL DEFAULT 'pending',
  error_message TEXT,
  import_summary JSONB,

  -- Timestamps
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Index for listing and filtering
CREATE INDEX IF NOT EXISTS idx_email_imports_status ON email_imports(status);
CREATE INDEX IF NOT EXISTS idx_email_imports_created_at ON email_imports(created_at DESC);

-- Comments
COMMENT ON TABLE email_imports IS 'Email fetch/import sessions tracking';

-- ============================================================
-- 4. Email Messages
-- ============================================================

CREATE TYPE email_message_type AS ENUM (
  'transaction_alert',
  'statement_attachment',
  'unknown'
);

CREATE TYPE email_processing_status AS ENUM (
  'pending',
  'parsed',
  'skipped',
  'error'
);

CREATE TABLE IF NOT EXISTS email_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_import_id UUID NOT NULL REFERENCES email_imports(id) ON DELETE CASCADE,

  -- Gmail identifiers
  gmail_message_id TEXT NOT NULL,
  gmail_thread_id TEXT,

  -- Email metadata
  subject TEXT,
  from_address TEXT,
  to_address TEXT,
  received_at TIMESTAMPTZ,

  -- Classification
  email_type email_message_type NOT NULL DEFAULT 'unknown',

  -- Storage paths (in Supabase Storage bucket: email-imports)
  raw_content_path TEXT,

  -- Attachments metadata: [{name, path, size, mime_type}]
  attachments JSONB DEFAULT '[]'::JSONB,

  -- Processing
  processing_status email_processing_status NOT NULL DEFAULT 'pending',
  processing_error TEXT,
  transactions_extracted INTEGER NOT NULL DEFAULT 0,

  -- Timestamps
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate message processing
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_messages_gmail_id
  ON email_messages(gmail_message_id);

-- Index for batch processing
CREATE INDEX IF NOT EXISTS idx_email_messages_import_status
  ON email_messages(email_import_id, processing_status);

-- Comments
COMMENT ON TABLE email_messages IS 'Individual email messages fetched from Gmail';
COMMENT ON COLUMN email_messages.gmail_message_id IS 'Unique Gmail message ID to prevent duplicate processing';
COMMENT ON COLUMN email_messages.raw_content_path IS 'Path in Supabase Storage email-imports bucket';

-- ============================================================
-- 5. Email Transactions (extracted from emails)
-- ============================================================

CREATE TYPE email_transaction_status AS ENUM (
  'pending',           -- Awaiting matching
  'matched',           -- Matched to resident, awaiting processing decision
  'auto_processed',    -- High-confidence auto-processed to payment
  'queued_for_review', -- Medium/low confidence queued for admin review
  'processed',         -- Manually processed by admin
  'skipped',           -- Skipped (duplicate, invalid, etc.)
  'error'              -- Error during processing
);

CREATE TABLE IF NOT EXISTS email_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_message_id UUID NOT NULL REFERENCES email_messages(id) ON DELETE CASCADE,
  email_import_id UUID NOT NULL REFERENCES email_imports(id) ON DELETE CASCADE,

  -- Transaction data
  transaction_date DATE,
  description TEXT,
  amount NUMERIC(12,2),
  transaction_type TEXT CHECK (transaction_type IN ('credit', 'debit')),
  reference TEXT,
  bank_account_last4 TEXT,

  -- Raw extracted data (for debugging)
  raw_extracted_data JSONB,

  -- Matching results (reuses existing types from bank_statement_rows)
  matched_resident_id UUID REFERENCES residents(id),
  match_confidence TEXT CHECK (match_confidence IN ('high', 'medium', 'low', 'none', 'manual')),
  match_method TEXT CHECK (match_method IN ('alias', 'phone', 'name', 'house_number', 'manual')),
  match_details JSONB, -- All potential matches from matcher

  -- Processing
  status email_transaction_status NOT NULL DEFAULT 'pending',
  payment_id UUID REFERENCES payment_records(id),
  skip_reason TEXT,
  error_message TEXT,

  -- Admin review
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,

  -- Timestamps
  matched_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for querying
CREATE INDEX IF NOT EXISTS idx_email_transactions_import
  ON email_transactions(email_import_id);
CREATE INDEX IF NOT EXISTS idx_email_transactions_message
  ON email_transactions(email_message_id);
CREATE INDEX IF NOT EXISTS idx_email_transactions_status
  ON email_transactions(status);
CREATE INDEX IF NOT EXISTS idx_email_transactions_matched_resident
  ON email_transactions(matched_resident_id) WHERE matched_resident_id IS NOT NULL;

-- Composite index for review queue
CREATE INDEX IF NOT EXISTS idx_email_transactions_review_queue
  ON email_transactions(status, match_confidence, created_at DESC)
  WHERE status = 'queued_for_review';

-- Comments
COMMENT ON TABLE email_transactions IS 'Transactions extracted from email messages';
COMMENT ON COLUMN email_transactions.match_details IS 'Full match results from ResidentMatcher including all potential matches';

-- ============================================================
-- 6. RLS Policies
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE estate_bank_account_passwords ENABLE ROW LEVEL SECURITY;
ALTER TABLE gmail_oauth_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_transactions ENABLE ROW LEVEL SECURITY;

-- Admin-only access for all email import tables
-- Using profiles.role check pattern consistent with existing RLS policies

CREATE POLICY "Admin access for bank account passwords"
  ON estate_bank_account_passwords
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman', 'financial_officer')
    )
  );

CREATE POLICY "Admin access for gmail oauth credentials"
  ON gmail_oauth_credentials
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman')
    )
  );

CREATE POLICY "Admin access for email imports"
  ON email_imports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman', 'financial_officer')
    )
  );

CREATE POLICY "Admin access for email messages"
  ON email_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman', 'financial_officer')
    )
  );

CREATE POLICY "Admin access for email transactions"
  ON email_transactions
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman', 'financial_officer')
    )
  );

-- ============================================================
-- 7. Updated_at Triggers
-- ============================================================

-- Trigger for estate_bank_account_passwords
CREATE TRIGGER set_estate_bank_account_passwords_updated_at
  BEFORE UPDATE ON estate_bank_account_passwords
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger for gmail_oauth_credentials
CREATE TRIGGER set_gmail_oauth_credentials_updated_at
  BEFORE UPDATE ON gmail_oauth_credentials
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 8. Supabase Storage Bucket
-- ============================================================
-- Note: This is created via Supabase dashboard or SQL but bucket policies
-- are typically managed in the Supabase dashboard

-- Create bucket for email imports (if using SQL)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-imports',
  'email-imports',
  false,
  104857600, -- 100MB max
  ARRAY[
    'message/rfc822',
    'application/pdf',
    'text/plain',
    'text/html',
    'application/octet-stream'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for email-imports bucket
CREATE POLICY "Admin can upload email imports"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'email-imports'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman', 'financial_officer')
    )
  );

CREATE POLICY "Admin can read email imports"
  ON storage.objects
  FOR SELECT
  USING (
    bucket_id = 'email-imports'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman', 'financial_officer')
    )
  );

CREATE POLICY "Admin can delete email imports"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'email-imports'
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role IN ('admin', 'chairman', 'financial_officer')
    )
  );
