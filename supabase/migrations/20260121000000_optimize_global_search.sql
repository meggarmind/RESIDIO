-- Enable pg_trgm extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Residents: Index for name, phone, email
CREATE INDEX IF NOT EXISTS idx_residents_name_trgm ON residents 
  USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_residents_phone_trgm ON residents 
  USING GIN (phone_primary gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_residents_email_trgm ON residents 
  USING GIN (email gin_trgm_ops);

-- Houses: Index for house number
CREATE INDEX IF NOT EXISTS idx_houses_number_trgm ON houses 
  USING GIN (house_number gin_trgm_ops);

-- Streets: Index for street name
CREATE INDEX IF NOT EXISTS idx_streets_name_trgm ON streets 
  USING GIN (name gin_trgm_ops);

-- Payments: Index for reference number
CREATE INDEX IF NOT EXISTS idx_payment_records_reference_trgm ON payment_records 
  USING GIN (reference_number gin_trgm_ops);

-- Security Contacts: Index for full name
CREATE INDEX IF NOT EXISTS idx_security_contacts_name_trgm ON security_contacts 
  USING GIN (full_name gin_trgm_ops);

-- Documents: Index for title
CREATE INDEX IF NOT EXISTS idx_documents_title_trgm ON documents 
  USING GIN (title gin_trgm_ops);
