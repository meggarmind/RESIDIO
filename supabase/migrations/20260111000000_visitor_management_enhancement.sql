-- Migration: Visitor Management Enhancement
-- Adds support for recurring visitors, visitor photo capture, vehicle registration,
-- visit duration tracking, and visitor history analytics

-- ============================================================
-- 1. CREATE ENUMS
-- ============================================================

-- Recurrence pattern for recurring visitors
DO $$ BEGIN
  CREATE TYPE visitor_recurrence_pattern AS ENUM (
    'daily',
    'weekly',
    'biweekly',
    'monthly',
    'custom'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Day of week for scheduling
DO $$ BEGIN
  CREATE TYPE day_of_week AS ENUM (
    'monday',
    'tuesday',
    'wednesday',
    'thursday',
    'friday',
    'saturday',
    'sunday'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Vehicle type enum
DO $$ BEGIN
  CREATE TYPE vehicle_type AS ENUM (
    'car',
    'motorcycle',
    'bicycle',
    'truck',
    'van',
    'bus',
    'other'
  );
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- 2. ADD RECURRING VISITOR FIELDS TO SECURITY_CONTACTS
-- ============================================================

-- Add recurring visitor fields
ALTER TABLE security_contacts
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_pattern visitor_recurrence_pattern,
  ADD COLUMN IF NOT EXISTS recurrence_days day_of_week[],
  ADD COLUMN IF NOT EXISTS recurrence_start_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS expected_arrival_time TIME,
  ADD COLUMN IF NOT EXISTS expected_departure_time TIME,
  ADD COLUMN IF NOT EXISTS purpose TEXT,
  ADD COLUMN IF NOT EXISTS visit_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_visit_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_frequent_visitor BOOLEAN NOT NULL DEFAULT false;

-- Add comments for new columns
COMMENT ON COLUMN security_contacts.is_recurring IS 'Whether this is a recurring visitor with a schedule';
COMMENT ON COLUMN security_contacts.recurrence_pattern IS 'Pattern for recurring visits (daily, weekly, etc.)';
COMMENT ON COLUMN security_contacts.recurrence_days IS 'Days of week for recurring visits (for weekly/biweekly patterns)';
COMMENT ON COLUMN security_contacts.recurrence_start_date IS 'Start date for recurring visit schedule';
COMMENT ON COLUMN security_contacts.recurrence_end_date IS 'End date for recurring visit schedule';
COMMENT ON COLUMN security_contacts.expected_arrival_time IS 'Expected time of arrival for recurring visitors';
COMMENT ON COLUMN security_contacts.expected_departure_time IS 'Expected time of departure for recurring visitors';
COMMENT ON COLUMN security_contacts.purpose IS 'Purpose of visits (e.g., cleaning, tutoring, delivery)';
COMMENT ON COLUMN security_contacts.visit_count IS 'Total number of visits recorded';
COMMENT ON COLUMN security_contacts.last_visit_at IS 'Timestamp of most recent visit';
COMMENT ON COLUMN security_contacts.is_frequent_visitor IS 'Flag for frequently visiting contacts (auto-calculated)';

-- ============================================================
-- 3. CREATE VISITOR_VEHICLES TABLE
-- ============================================================

CREATE TABLE IF NOT EXISTS visitor_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES security_contacts(id) ON DELETE CASCADE,
  vehicle_type vehicle_type NOT NULL DEFAULT 'car',
  plate_number TEXT NOT NULL,
  make TEXT,
  model TEXT,
  color TEXT,
  year INTEGER,
  photo_url TEXT,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

-- Add comments
COMMENT ON TABLE visitor_vehicles IS 'Vehicles registered for security contacts/visitors';
COMMENT ON COLUMN visitor_vehicles.contact_id IS 'The security contact who owns this vehicle';
COMMENT ON COLUMN visitor_vehicles.vehicle_type IS 'Type of vehicle (car, motorcycle, etc.)';
COMMENT ON COLUMN visitor_vehicles.plate_number IS 'Vehicle license plate number';
COMMENT ON COLUMN visitor_vehicles.make IS 'Vehicle manufacturer (e.g., Toyota, Honda)';
COMMENT ON COLUMN visitor_vehicles.model IS 'Vehicle model (e.g., Camry, Civic)';
COMMENT ON COLUMN visitor_vehicles.color IS 'Vehicle color';
COMMENT ON COLUMN visitor_vehicles.year IS 'Vehicle manufacturing year';
COMMENT ON COLUMN visitor_vehicles.photo_url IS 'URL to vehicle photo';
COMMENT ON COLUMN visitor_vehicles.is_primary IS 'Whether this is the primary vehicle for the contact';
COMMENT ON COLUMN visitor_vehicles.is_active IS 'Whether this vehicle registration is active';

-- Enable RLS
ALTER TABLE visitor_vehicles ENABLE ROW LEVEL SECURITY;

-- RLS Policies for visitor_vehicles
CREATE POLICY "visitor_vehicles_select_policy" ON visitor_vehicles
  FOR SELECT TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary', 'security_officer')
  );

CREATE POLICY "visitor_vehicles_insert_policy" ON visitor_vehicles
  FOR INSERT TO authenticated
  WITH CHECK (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary')
  );

CREATE POLICY "visitor_vehicles_update_policy" ON visitor_vehicles
  FOR UPDATE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman', 'financial_secretary')
  );

CREATE POLICY "visitor_vehicles_delete_policy" ON visitor_vehicles
  FOR DELETE TO authenticated
  USING (
    get_my_role() IN ('admin', 'chairman')
  );

-- Indexes for visitor_vehicles
CREATE INDEX IF NOT EXISTS idx_visitor_vehicles_contact_id ON visitor_vehicles(contact_id);
CREATE INDEX IF NOT EXISTS idx_visitor_vehicles_plate_number ON visitor_vehicles(plate_number);
CREATE INDEX IF NOT EXISTS idx_visitor_vehicles_is_active ON visitor_vehicles(is_active) WHERE is_active = true;

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_visitor_vehicles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER visitor_vehicles_updated_at
  BEFORE UPDATE ON visitor_vehicles
  FOR EACH ROW
  EXECUTE FUNCTION update_visitor_vehicles_updated_at();

-- ============================================================
-- 4. ADD VISIT DURATION FIELDS TO ACCESS_LOGS
-- ============================================================

ALTER TABLE access_logs
  ADD COLUMN IF NOT EXISTS expected_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS actual_duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS vehicle_id UUID REFERENCES visitor_vehicles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS entry_method TEXT,
  ADD COLUMN IF NOT EXISTS photo_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS photo_url TEXT;

-- Add comments
COMMENT ON COLUMN access_logs.expected_duration_minutes IS 'Expected visit duration in minutes';
COMMENT ON COLUMN access_logs.actual_duration_minutes IS 'Actual visit duration calculated from check-in/out';
COMMENT ON COLUMN access_logs.vehicle_id IS 'Vehicle used for this visit (if any)';
COMMENT ON COLUMN access_logs.entry_method IS 'Method of entry verification (code, photo, manual)';
COMMENT ON COLUMN access_logs.photo_captured_at IS 'Timestamp when visitor photo was captured at gate';
COMMENT ON COLUMN access_logs.photo_url IS 'URL to photo captured at gate entry';

-- Index for vehicle lookups
CREATE INDEX IF NOT EXISTS idx_access_logs_vehicle_id ON access_logs(vehicle_id) WHERE vehicle_id IS NOT NULL;

-- ============================================================
-- 5. CREATE VISITOR_ANALYTICS VIEW
-- ============================================================

CREATE OR REPLACE VIEW visitor_analytics AS
SELECT
  sc.id AS contact_id,
  sc.full_name,
  sc.resident_id,
  sc.category_id,
  sc.is_recurring,
  sc.is_frequent_visitor,
  sc.visit_count,
  sc.last_visit_at,
  sc.status,
  cat.name AS category_name,
  r.first_name AS resident_first_name,
  r.last_name AS resident_last_name,
  r.resident_code,
  -- Visit statistics
  (
    SELECT COUNT(*)
    FROM access_logs al
    WHERE al.contact_id = sc.id
    AND al.check_in_time >= NOW() - INTERVAL '30 days'
  ) AS visits_last_30_days,
  (
    SELECT COUNT(*)
    FROM access_logs al
    WHERE al.contact_id = sc.id
    AND al.check_in_time >= NOW() - INTERVAL '7 days'
  ) AS visits_last_7_days,
  (
    SELECT AVG(EXTRACT(EPOCH FROM (al.check_out_time - al.check_in_time)) / 60)::INTEGER
    FROM access_logs al
    WHERE al.contact_id = sc.id
    AND al.check_out_time IS NOT NULL
  ) AS avg_visit_duration_minutes,
  -- Vehicle count
  (
    SELECT COUNT(*)
    FROM visitor_vehicles vv
    WHERE vv.contact_id = sc.id
    AND vv.is_active = true
  ) AS vehicle_count
FROM security_contacts sc
LEFT JOIN security_contact_categories cat ON cat.id = sc.category_id
LEFT JOIN residents r ON r.id = sc.resident_id
WHERE sc.status = 'active';

COMMENT ON VIEW visitor_analytics IS 'Analytics view for visitor patterns and statistics';

-- ============================================================
-- 6. CREATE FUNCTION TO UPDATE VISIT STATISTICS
-- ============================================================

CREATE OR REPLACE FUNCTION update_visitor_statistics()
RETURNS TRIGGER AS $$
BEGIN
  -- Update visit count and last visit timestamp
  UPDATE security_contacts
  SET
    visit_count = visit_count + 1,
    last_visit_at = NEW.check_in_time,
    -- Mark as frequent visitor if 5+ visits in last 30 days
    is_frequent_visitor = (
      SELECT COUNT(*) >= 5
      FROM access_logs
      WHERE contact_id = NEW.contact_id
      AND check_in_time >= NOW() - INTERVAL '30 days'
    )
  WHERE id = NEW.contact_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update statistics on check-in
DROP TRIGGER IF EXISTS access_logs_update_visitor_stats ON access_logs;
CREATE TRIGGER access_logs_update_visitor_stats
  AFTER INSERT ON access_logs
  FOR EACH ROW
  EXECUTE FUNCTION update_visitor_statistics();

-- ============================================================
-- 7. CREATE FUNCTION TO CALCULATE ACTUAL DURATION
-- ============================================================

CREATE OR REPLACE FUNCTION calculate_visit_duration()
RETURNS TRIGGER AS $$
BEGIN
  -- Calculate actual duration when check-out time is recorded
  IF NEW.check_out_time IS NOT NULL AND OLD.check_out_time IS NULL THEN
    NEW.actual_duration_minutes := EXTRACT(EPOCH FROM (NEW.check_out_time - NEW.check_in_time)) / 60;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to calculate duration on check-out
DROP TRIGGER IF EXISTS access_logs_calc_duration ON access_logs;
CREATE TRIGGER access_logs_calc_duration
  BEFORE UPDATE ON access_logs
  FOR EACH ROW
  EXECUTE FUNCTION calculate_visit_duration();

-- ============================================================
-- 8. CREATE FREQUENT VISITORS FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION get_frequent_visitors(
  p_min_visits INTEGER DEFAULT 5,
  p_days INTEGER DEFAULT 30,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
  contact_id UUID,
  full_name TEXT,
  phone_primary TEXT,
  photo_url TEXT,
  category_name TEXT,
  resident_name TEXT,
  resident_code TEXT,
  visit_count BIGINT,
  last_visit_at TIMESTAMPTZ,
  avg_duration_minutes INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sc.id AS contact_id,
    sc.full_name,
    sc.phone_primary,
    sc.photo_url,
    cat.name AS category_name,
    (r.first_name || ' ' || r.last_name) AS resident_name,
    r.resident_code,
    COUNT(al.id) AS visit_count,
    MAX(al.check_in_time) AS last_visit_at,
    AVG(
      CASE WHEN al.check_out_time IS NOT NULL
        THEN EXTRACT(EPOCH FROM (al.check_out_time - al.check_in_time)) / 60
        ELSE NULL
      END
    )::INTEGER AS avg_duration_minutes
  FROM security_contacts sc
  JOIN access_logs al ON al.contact_id = sc.id
  LEFT JOIN security_contact_categories cat ON cat.id = sc.category_id
  LEFT JOIN residents r ON r.id = sc.resident_id
  WHERE
    sc.status = 'active'
    AND al.check_in_time >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY sc.id, sc.full_name, sc.phone_primary, sc.photo_url, cat.name, r.first_name, r.last_name, r.resident_code
  HAVING COUNT(al.id) >= p_min_visits
  ORDER BY visit_count DESC, last_visit_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 9. CREATE VISITOR HISTORY SUMMARY FUNCTION
-- ============================================================

CREATE OR REPLACE FUNCTION get_visitor_history_summary(
  p_contact_id UUID,
  p_days INTEGER DEFAULT 90
)
RETURNS TABLE (
  total_visits BIGINT,
  first_visit TIMESTAMPTZ,
  last_visit TIMESTAMPTZ,
  avg_duration_minutes INTEGER,
  total_duration_hours NUMERIC,
  most_common_gate TEXT,
  flagged_visits BIGINT,
  vehicles_used BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(al.id) AS total_visits,
    MIN(al.check_in_time) AS first_visit,
    MAX(al.check_in_time) AS last_visit,
    AVG(al.actual_duration_minutes)::INTEGER AS avg_duration_minutes,
    ROUND(SUM(COALESCE(al.actual_duration_minutes, 0)) / 60.0, 2) AS total_duration_hours,
    (
      SELECT al2.gate_location
      FROM access_logs al2
      WHERE al2.contact_id = p_contact_id
      AND al2.gate_location IS NOT NULL
      GROUP BY al2.gate_location
      ORDER BY COUNT(*) DESC
      LIMIT 1
    ) AS most_common_gate,
    SUM(CASE WHEN al.flagged THEN 1 ELSE 0 END) AS flagged_visits,
    COUNT(DISTINCT al.vehicle_id) AS vehicles_used
  FROM access_logs al
  WHERE
    al.contact_id = p_contact_id
    AND al.check_in_time >= NOW() - (p_days || ' days')::INTERVAL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 10. ADD INDEXES FOR NEW COLUMNS
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_security_contacts_is_recurring ON security_contacts(is_recurring) WHERE is_recurring = true;
CREATE INDEX IF NOT EXISTS idx_security_contacts_is_frequent ON security_contacts(is_frequent_visitor) WHERE is_frequent_visitor = true;
CREATE INDEX IF NOT EXISTS idx_security_contacts_visit_count ON security_contacts(visit_count DESC);
CREATE INDEX IF NOT EXISTS idx_security_contacts_last_visit ON security_contacts(last_visit_at DESC NULLS LAST);

-- ============================================================
-- 11. GRANT PERMISSIONS
-- ============================================================

GRANT EXECUTE ON FUNCTION get_frequent_visitors TO authenticated;
GRANT EXECUTE ON FUNCTION get_visitor_history_summary TO authenticated;
GRANT SELECT ON visitor_analytics TO authenticated;
