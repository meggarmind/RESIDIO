-- Migration: Create Access Codes Table
-- Stores access codes for security contacts

-- 1. Create access code type enum
DO $$ BEGIN
  CREATE TYPE access_code_type AS ENUM ('permanent', 'one_time');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Create access_codes table
CREATE TABLE IF NOT EXISTS access_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES security_contacts(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  code_type access_code_type NOT NULL DEFAULT 'permanent',
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_until TIMESTAMPTZ,
  max_uses INTEGER,               -- NULL for unlimited, 1 for one-time codes
  current_uses INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  revoked_by UUID REFERENCES profiles(id)
);

-- 3. Add comments
COMMENT ON TABLE access_codes IS 'Access codes for security contacts';
COMMENT ON COLUMN access_codes.contact_id IS 'The security contact this code belongs to';
COMMENT ON COLUMN access_codes.code IS 'Unique alphanumeric access code (e.g., RES-A15-7K3M)';
COMMENT ON COLUMN access_codes.code_type IS 'Type of code: permanent or one_time';
COMMENT ON COLUMN access_codes.valid_from IS 'When this code becomes valid';
COMMENT ON COLUMN access_codes.valid_until IS 'When this code expires (NULL for permanent based on contact validity)';
COMMENT ON COLUMN access_codes.max_uses IS 'Maximum number of uses (NULL for unlimited)';
COMMENT ON COLUMN access_codes.current_uses IS 'Current number of times this code has been used';
COMMENT ON COLUMN access_codes.is_active IS 'Whether this code is currently active';
COMMENT ON COLUMN access_codes.revoked_at IS 'When this code was revoked';
COMMENT ON COLUMN access_codes.revoked_by IS 'User who revoked this code';

-- 4. Enable RLS
ALTER TABLE access_codes ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- Same as security_contacts - admin, chairman, financial_secretary can manage
-- Security officer can view and use for verification
CREATE POLICY "access_codes_select_policy" ON access_codes
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
  );

CREATE POLICY "access_codes_insert_policy" ON access_codes
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary')
  );

CREATE POLICY "access_codes_update_policy" ON access_codes
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
  );

CREATE POLICY "access_codes_delete_policy" ON access_codes
  FOR DELETE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman')
  );

-- 6. Function to generate unique alphanumeric access code
-- Format: RES-XXX-XXXX (e.g., RES-A5K-7M3N)
CREATE OR REPLACE FUNCTION generate_access_code()
RETURNS TEXT AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  max_attempts INTEGER := 100;
  attempt INTEGER := 0;
  chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- Excluding 0,O,1,I to avoid confusion
  part1 TEXT;
  part2 TEXT;
BEGIN
  LOOP
    attempt := attempt + 1;

    -- Generate first part (3 chars)
    part1 := '';
    FOR i IN 1..3 LOOP
      part1 := part1 || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    -- Generate second part (4 chars)
    part2 := '';
    FOR i IN 1..4 LOOP
      part2 := part2 || substr(chars, floor(random() * length(chars) + 1)::int, 1);
    END LOOP;

    new_code := 'RES-' || part1 || '-' || part2;

    -- Check if code already exists
    SELECT EXISTS(
      SELECT 1 FROM access_codes WHERE code = new_code
    ) INTO code_exists;

    -- Exit loop if code is unique
    EXIT WHEN NOT code_exists;

    -- Safety check to prevent infinite loop
    IF attempt >= max_attempts THEN
      RAISE EXCEPTION 'Could not generate unique access code after % attempts', max_attempts;
    END IF;
  END LOOP;

  RETURN new_code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 7. Create trigger function to auto-generate code on insert
CREATE OR REPLACE FUNCTION set_access_code()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.code IS NULL OR NEW.code = '' THEN
    NEW.code := generate_access_code();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER access_codes_set_code
  BEFORE INSERT ON access_codes
  FOR EACH ROW
  EXECUTE FUNCTION set_access_code();

-- 8. Create indexes
CREATE INDEX IF NOT EXISTS idx_access_codes_contact_id ON access_codes(contact_id);
CREATE INDEX IF NOT EXISTS idx_access_codes_code ON access_codes(code);
CREATE INDEX IF NOT EXISTS idx_access_codes_is_active ON access_codes(is_active);
CREATE INDEX IF NOT EXISTS idx_access_codes_valid_until ON access_codes(valid_until);
CREATE INDEX IF NOT EXISTS idx_access_codes_code_type ON access_codes(code_type);

-- 9. Grant execute permission
GRANT EXECUTE ON FUNCTION generate_access_code() TO authenticated;
