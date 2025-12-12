-- Migration: Create house_ownership_history table for tracking ownership and occupancy changes
-- This table provides a full audit trail of property ownership transfers and occupancy changes

-- Create the house_ownership_history table
CREATE TABLE IF NOT EXISTS house_ownership_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  resident_id UUID NOT NULL REFERENCES residents(id) ON DELETE CASCADE,
  resident_role resident_role NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'ownership_start',      -- Initial ownership assignment
    'ownership_transfer',   -- Ownership transferred to this resident
    'ownership_end',        -- Ownership transferred away from this resident
    'move_in',              -- Resident moved into the property
    'move_out',             -- Resident moved out of the property
    'role_change'           -- Role changed (e.g., resident_landlord -> non_resident_landlord)
  )),
  previous_role resident_role,        -- For role_change events
  event_date DATE NOT NULL DEFAULT CURRENT_DATE,
  notes TEXT,
  is_current BOOLEAN DEFAULT false,   -- Only true for current owner/occupant records
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

-- Comment on the table
COMMENT ON TABLE house_ownership_history IS 'Tracks ownership and occupancy history for each house, providing a full audit trail';

-- Comments on columns
COMMENT ON COLUMN house_ownership_history.resident_id IS 'The resident involved in this history event';
COMMENT ON COLUMN house_ownership_history.resident_role IS 'The role at the time of this event';
COMMENT ON COLUMN house_ownership_history.event_type IS 'Type of history event: ownership_start, ownership_transfer, ownership_end, move_in, move_out, role_change';
COMMENT ON COLUMN house_ownership_history.previous_role IS 'Previous role before change (only for role_change events)';
COMMENT ON COLUMN house_ownership_history.event_date IS 'Date when the event occurred';
COMMENT ON COLUMN house_ownership_history.notes IS 'Optional notes about this event (e.g., sale reference number)';
COMMENT ON COLUMN house_ownership_history.is_current IS 'True if this represents the current owner or current primary occupant';

-- Index for efficient lookup of current owner/occupant
CREATE INDEX idx_ownership_history_current ON house_ownership_history(house_id, is_current) WHERE is_current = true;

-- Index for house history timeline queries
CREATE INDEX idx_ownership_history_house_date ON house_ownership_history(house_id, event_date DESC);

-- Index for resident history queries
CREATE INDEX idx_ownership_history_resident ON house_ownership_history(resident_id, event_date DESC);

-- Enable RLS
ALTER TABLE house_ownership_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Allow authenticated users to read ownership history
CREATE POLICY "Authenticated users can view ownership history"
  ON house_ownership_history
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins, chairmen, and financial secretaries can insert history records
CREATE POLICY "Authorized users can insert ownership history"
  ON house_ownership_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary')
  );

-- Only admins can update history records (for corrections)
CREATE POLICY "Only admins can update ownership history"
  ON house_ownership_history
  FOR UPDATE
  TO authenticated
  USING (get_my_role() = 'admin')
  WITH CHECK (get_my_role() = 'admin');

-- No one can delete history records (audit trail must be preserved)
-- If needed, admin can mark records as corrected via notes field

-- Function to record ownership history events
CREATE OR REPLACE FUNCTION record_ownership_history(
  p_house_id UUID,
  p_resident_id UUID,
  p_resident_role resident_role,
  p_event_type TEXT,
  p_previous_role resident_role DEFAULT NULL,
  p_event_date DATE DEFAULT CURRENT_DATE,
  p_notes TEXT DEFAULT NULL,
  p_is_current BOOLEAN DEFAULT false,
  p_created_by UUID DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_history_id UUID;
BEGIN
  -- If marking as current owner, clear previous current owner flags for this house
  IF p_is_current AND p_event_type IN ('ownership_start', 'ownership_transfer') THEN
    UPDATE house_ownership_history
    SET is_current = false
    WHERE house_id = p_house_id
      AND is_current = true
      AND resident_role IN ('resident_landlord', 'non_resident_landlord', 'developer');
  END IF;

  -- If marking as current occupant, clear previous current occupant flags
  IF p_is_current AND p_event_type = 'move_in' AND p_resident_role IN ('resident_landlord', 'tenant') THEN
    UPDATE house_ownership_history
    SET is_current = false
    WHERE house_id = p_house_id
      AND is_current = true
      AND resident_role IN ('resident_landlord', 'tenant');
  END IF;

  INSERT INTO house_ownership_history (
    house_id,
    resident_id,
    resident_role,
    event_type,
    previous_role,
    event_date,
    notes,
    is_current,
    created_by
  ) VALUES (
    p_house_id,
    p_resident_id,
    p_resident_role,
    p_event_type,
    p_previous_role,
    p_event_date,
    p_notes,
    p_is_current,
    p_created_by
  )
  RETURNING id INTO v_history_id;

  RETURN v_history_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION record_ownership_history TO authenticated;
