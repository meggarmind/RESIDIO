-- Migration: Create Access Logs Table
-- Records check-in/check-out events at estate gates

-- 1. Create access_logs table
CREATE TABLE IF NOT EXISTS access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_code_id UUID REFERENCES access_codes(id) ON DELETE SET NULL,
  contact_id UUID NOT NULL REFERENCES security_contacts(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  check_in_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  check_out_time TIMESTAMPTZ,
  verified_by UUID REFERENCES profiles(id),
  gate_location TEXT,
  notes TEXT,
  flagged BOOLEAN NOT NULL DEFAULT false,
  flag_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Add comments
COMMENT ON TABLE access_logs IS 'Records of check-in/check-out events at estate gates';
COMMENT ON COLUMN access_logs.access_code_id IS 'The access code used for entry (may be NULL if code was deleted)';
COMMENT ON COLUMN access_logs.contact_id IS 'The security contact who accessed the estate';
COMMENT ON COLUMN access_logs.resident_id IS 'The resident the contact belongs to';
COMMENT ON COLUMN access_logs.check_in_time IS 'When the contact checked in at the gate';
COMMENT ON COLUMN access_logs.check_out_time IS 'When the contact checked out (optional)';
COMMENT ON COLUMN access_logs.verified_by IS 'Security officer who verified the entry';
COMMENT ON COLUMN access_logs.gate_location IS 'Which gate the entry occurred at';
COMMENT ON COLUMN access_logs.flagged IS 'Whether this entry was flagged for suspicious activity';
COMMENT ON COLUMN access_logs.flag_reason IS 'Reason for flagging the entry';

-- 3. Enable RLS
ALTER TABLE access_logs ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies
-- All security-related roles can view logs
CREATE POLICY "access_logs_select_policy" ON access_logs
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
  );

-- Security officers can record check-ins
CREATE POLICY "access_logs_insert_policy" ON access_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
  );

-- Security officers can update logs (for check-out, flagging)
CREATE POLICY "access_logs_update_policy" ON access_logs
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
  );

-- Only admin can delete logs (logs should generally be immutable)
CREATE POLICY "access_logs_delete_policy" ON access_logs
  FOR DELETE TO authenticated
  USING (
    get_my_role() = 'admin'
  );

-- 5. Function to increment access code usage on check-in
CREATE OR REPLACE FUNCTION increment_access_code_usage()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment if access_code_id is provided
  IF NEW.access_code_id IS NOT NULL THEN
    UPDATE access_codes
    SET current_uses = current_uses + 1
    WHERE id = NEW.access_code_id;

    -- Deactivate one-time codes after use
    UPDATE access_codes
    SET is_active = false
    WHERE id = NEW.access_code_id
      AND code_type = 'one_time'
      AND max_uses IS NOT NULL
      AND current_uses >= max_uses;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER access_logs_increment_usage
  AFTER INSERT ON access_logs
  FOR EACH ROW
  EXECUTE FUNCTION increment_access_code_usage();

-- 6. Create indexes
CREATE INDEX IF NOT EXISTS idx_access_logs_access_code_id ON access_logs(access_code_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_contact_id ON access_logs(contact_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_resident_id ON access_logs(resident_id);
CREATE INDEX IF NOT EXISTS idx_access_logs_check_in_time ON access_logs(check_in_time DESC);
CREATE INDEX IF NOT EXISTS idx_access_logs_verified_by ON access_logs(verified_by);
CREATE INDEX IF NOT EXISTS idx_access_logs_flagged ON access_logs(flagged) WHERE flagged = true;
CREATE INDEX IF NOT EXISTS idx_access_logs_created_at ON access_logs(created_at DESC);
