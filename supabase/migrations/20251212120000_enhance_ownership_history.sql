-- Migration: Enhance ownership history with house_added event and backfill existing data
-- This adds tracking for when houses are added to the portal and backfills history for existing records

-- 1. Make resident_id nullable (for house_added events which don't have a resident)
ALTER TABLE house_ownership_history
  ALTER COLUMN resident_id DROP NOT NULL;

-- 2. Make resident_role nullable (for house_added events)
ALTER TABLE house_ownership_history
  ALTER COLUMN resident_role DROP NOT NULL;

-- 3. Drop old CHECK constraint and add new one with house_added
ALTER TABLE house_ownership_history
  DROP CONSTRAINT IF EXISTS house_ownership_history_event_type_check;

ALTER TABLE house_ownership_history
  ADD CONSTRAINT house_ownership_history_event_type_check
  CHECK (event_type IN (
    'house_added',         -- House added to Residio portal
    'ownership_start',     -- Initial ownership assignment
    'ownership_transfer',  -- Ownership transferred to this resident
    'ownership_end',       -- Ownership transferred away from this resident
    'move_in',             -- Resident moved into the property
    'move_out',            -- Resident moved out of the property
    'role_change'          -- Role changed (e.g., resident_landlord -> non_resident_landlord)
  ));

-- 4. Backfill house_added for existing houses
-- Uses the house's created_at date as the event_date
INSERT INTO house_ownership_history (house_id, event_type, event_date, notes, created_at, created_by)
SELECT
  id,
  'house_added',
  COALESCE(created_at::date, CURRENT_DATE),
  'House added to Residio portal (backfilled)',
  created_at,
  created_by
FROM houses
WHERE id NOT IN (
  SELECT DISTINCT house_id FROM house_ownership_history WHERE event_type = 'house_added'
);

-- 5. Backfill ownership_start for existing ownership roles (resident_landlord, non_resident_landlord, developer)
-- Uses the move_in_date as the event_date
INSERT INTO house_ownership_history (house_id, resident_id, resident_role, event_type, event_date, is_current, notes, created_by)
SELECT
  house_id,
  resident_id,
  resident_role,
  'ownership_start',
  move_in_date,
  is_active,
  'Initial ownership assignment (backfilled)',
  created_by
FROM resident_houses
WHERE resident_role IN ('resident_landlord', 'non_resident_landlord', 'developer')
  AND NOT EXISTS (
    SELECT 1 FROM house_ownership_history h
    WHERE h.house_id = resident_houses.house_id
      AND h.resident_id = resident_houses.resident_id
      AND h.event_type = 'ownership_start'
  );

-- 6. Backfill move_in for existing tenants
-- Uses the move_in_date as the event_date
INSERT INTO house_ownership_history (house_id, resident_id, resident_role, event_type, event_date, is_current, notes, created_by)
SELECT
  house_id,
  resident_id,
  resident_role,
  'move_in',
  move_in_date,
  is_active,
  'Tenant move-in (backfilled)',
  created_by
FROM resident_houses
WHERE resident_role = 'tenant'
  AND NOT EXISTS (
    SELECT 1 FROM house_ownership_history h
    WHERE h.house_id = resident_houses.house_id
      AND h.resident_id = resident_houses.resident_id
      AND h.event_type = 'move_in'
  );

-- Update the record_ownership_history function to handle house_added events
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

-- Add comment for the house_added event
COMMENT ON COLUMN house_ownership_history.event_type IS 'Type of history event: house_added, ownership_start, ownership_transfer, ownership_end, move_in, move_out, role_change';
