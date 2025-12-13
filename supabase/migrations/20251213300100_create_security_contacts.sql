-- Migration: Create Security Contacts Table
-- Stores authorized persons who can access the estate on behalf of residents

-- 1. Create security contact status enum
DO $$ BEGIN
  CREATE TYPE security_contact_status AS ENUM ('active', 'suspended', 'expired', 'revoked');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create ID type enum for identification documents
DO $$ BEGIN
  CREATE TYPE id_document_type AS ENUM (
    'nin',              -- National Identification Number
    'voters_card',      -- Voter's Card
    'drivers_license',  -- Driver's License
    'passport',         -- International Passport
    'company_id',       -- Company/Work ID
    'other'             -- Other identification
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. Create security_contacts table
CREATE TABLE IF NOT EXISTS security_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES security_contact_categories(id) ON DELETE RESTRICT,

  -- Basic info
  full_name TEXT NOT NULL,
  phone_primary TEXT NOT NULL,
  phone_secondary TEXT,

  -- For future photo/ID document uploads
  photo_url TEXT,
  id_type id_document_type,
  id_number TEXT,
  id_document_url TEXT,

  -- Additional details
  address TEXT,
  next_of_kin_name TEXT,
  next_of_kin_phone TEXT,
  employer TEXT,           -- For service providers
  relationship TEXT,       -- For visitors (e.g., "Brother", "Business Partner")
  notes TEXT,

  -- Status
  status security_contact_status NOT NULL DEFAULT 'active',

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

-- 4. Add comments
COMMENT ON TABLE security_contacts IS 'Authorized persons who can access the estate on behalf of residents';
COMMENT ON COLUMN security_contacts.resident_id IS 'The resident who registered this contact';
COMMENT ON COLUMN security_contacts.category_id IS 'Category of the contact (Domestic Staff, Service Provider, Visitor)';
COMMENT ON COLUMN security_contacts.full_name IS 'Full name as on ID document';
COMMENT ON COLUMN security_contacts.phone_primary IS 'Primary contact phone number';
COMMENT ON COLUMN security_contacts.phone_secondary IS 'Secondary/emergency phone number';
COMMENT ON COLUMN security_contacts.photo_url IS 'URL to contact photo (for future use)';
COMMENT ON COLUMN security_contacts.id_type IS 'Type of identification document';
COMMENT ON COLUMN security_contacts.id_number IS 'ID document number';
COMMENT ON COLUMN security_contacts.id_document_url IS 'URL to ID document image (for future use)';
COMMENT ON COLUMN security_contacts.employer IS 'Employer or company name (for service providers)';
COMMENT ON COLUMN security_contacts.relationship IS 'Relationship to resident (for visitors)';
COMMENT ON COLUMN security_contacts.status IS 'Current status of the contact';
COMMENT ON COLUMN security_contacts.created_by IS 'User who registered this contact';

-- 5. Enable RLS
ALTER TABLE security_contacts ENABLE ROW LEVEL SECURITY;

-- 6. RLS Policies
-- Admin, chairman, and financial_secretary can view all contacts
-- Security officer can view all contacts (read-only for verification)
CREATE POLICY "security_contacts_select_policy" ON security_contacts
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
  );

-- Admin, chairman, and financial_secretary can insert contacts
CREATE POLICY "security_contacts_insert_policy" ON security_contacts
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary')
  );

-- Admin, chairman, and financial_secretary can update contacts
CREATE POLICY "security_contacts_update_policy" ON security_contacts
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary')
  );

-- Only admin and chairman can delete contacts
CREATE POLICY "security_contacts_delete_policy" ON security_contacts
  FOR DELETE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman')
  );

-- 7. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_security_contacts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER security_contacts_updated_at
  BEFORE UPDATE ON security_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_security_contacts_updated_at();

-- 8. Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_security_contacts_resident_id ON security_contacts(resident_id);
CREATE INDEX IF NOT EXISTS idx_security_contacts_category_id ON security_contacts(category_id);
CREATE INDEX IF NOT EXISTS idx_security_contacts_status ON security_contacts(status);
CREATE INDEX IF NOT EXISTS idx_security_contacts_full_name ON security_contacts(full_name);
CREATE INDEX IF NOT EXISTS idx_security_contacts_phone_primary ON security_contacts(phone_primary);
CREATE INDEX IF NOT EXISTS idx_security_contacts_created_at ON security_contacts(created_at DESC);
