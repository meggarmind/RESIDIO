-- ============================================
-- Developer/Owner Approval System
-- Adds auto-reject after 72 hours and notification tracking
-- ============================================

-- Add new columns to approval_requests table
ALTER TABLE approval_requests
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS affected_resident_id UUID REFERENCES residents(id),
  ADD COLUMN IF NOT EXISTS affected_house_id UUID REFERENCES houses(id);

-- Create index for expiration queries
CREATE INDEX IF NOT EXISTS idx_approval_requests_expires_at 
  ON approval_requests(expires_at) 
  WHERE status = 'pending';

-- Create index for affected resident lookup
CREATE INDEX IF NOT EXISTS idx_approval_requests_affected_resident
  ON approval_requests(affected_resident_id)
  WHERE affected_resident_id IS NOT NULL;

-- Function to check if approval is required for developer/owner action
CREATE OR REPLACE FUNCTION requires_approval_for_action(
  p_house_id UUID,
  p_requester_resident_id UUID,
  p_action_type TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_requester_role TEXT;
  v_has_occupier BOOLEAN;
BEGIN
  -- Get requester's role at this house
  SELECT resident_role INTO v_requester_role
  FROM resident_houses
  WHERE house_id = p_house_id
  AND resident_id = p_requester_resident_id
  AND is_active = true
  LIMIT 1;
  
  -- Only developers and non_resident_landlords need approval
  IF v_requester_role NOT IN ('developer', 'non_resident_landlord') THEN
    RETURN FALSE;
  END IF;
  
  -- Check if there's an active owner-occupier or tenant
  SELECT EXISTS(
    SELECT 1 FROM resident_houses
    WHERE house_id = p_house_id
    AND is_active = true
    AND resident_id != p_requester_resident_id
    AND resident_role IN ('resident_landlord', 'tenant')
  ) INTO v_has_occupier;
  
  RETURN v_has_occupier;
END;
$$;

-- Function to get the primary occupier for approval notifications
CREATE OR REPLACE FUNCTION get_primary_occupier(p_house_id UUID)
RETURNS TABLE (
  resident_id UUID,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone_primary TEXT,
  resident_role TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    r.id,
    r.first_name,
    r.last_name,
    r.email,
    r.phone_primary,
    rh.resident_role::TEXT
  FROM resident_houses rh
  JOIN residents r ON rh.resident_id = r.id
  WHERE rh.house_id = p_house_id
  AND rh.is_active = true
  AND rh.resident_role IN ('resident_landlord', 'tenant')
  ORDER BY 
    CASE rh.resident_role 
      WHEN 'resident_landlord' THEN 1 
      WHEN 'tenant' THEN 2 
    END
  LIMIT 1;
END;
$$;

-- Function to auto-reject expired approval requests
CREATE OR REPLACE FUNCTION process_expired_approvals()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE approval_requests
  SET 
    status = 'rejected',
    reviewed_at = NOW(),
    review_notes = 'Auto-rejected: No response within 72 hours',
    updated_at = NOW()
  WHERE status = 'pending'
  AND expires_at IS NOT NULL
  AND expires_at <= NOW();
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION requires_approval_for_action TO authenticated;
GRANT EXECUTE ON FUNCTION get_primary_occupier TO authenticated;
GRANT EXECUTE ON FUNCTION process_expired_approvals TO authenticated;

COMMENT ON FUNCTION requires_approval_for_action IS 'Check if a developer/owner action requires approval from occupier';
COMMENT ON FUNCTION get_primary_occupier IS 'Get the primary occupier (owner-occupier or tenant) for approval notifications';
COMMENT ON FUNCTION process_expired_approvals IS 'Auto-reject pending approvals that have expired (72-hour timeout)';
