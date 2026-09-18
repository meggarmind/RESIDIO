-- ============================================
-- Hierarchical Settings System
-- Three-level cascade: estate -> house -> resident
-- ============================================

-- Create enum for setting levels
CREATE TYPE setting_level AS ENUM ('estate', 'house', 'resident');

-- Create hierarchical settings table
CREATE TABLE hierarchical_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Setting identification
  setting_key TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  
  -- Hierarchy level (estate/house/resident)
  level setting_level NOT NULL,
  
  -- Reference IDs (null means estate-level)
  house_id UUID REFERENCES houses(id) ON DELETE CASCADE,
  resident_id UUID REFERENCES residents(id) ON DELETE CASCADE,
  
  -- Value storage (JSONB for flexibility)
  value JSONB NOT NULL,
  
  -- Metadata
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  
  -- Constraints
  CONSTRAINT valid_level_references CHECK (
    (level = 'estate' AND house_id IS NULL AND resident_id IS NULL) OR
    (level = 'house' AND house_id IS NOT NULL AND resident_id IS NULL) OR
    (level = 'resident' AND resident_id IS NOT NULL)
  ),
  
  -- Unique constraint per level
  CONSTRAINT unique_setting_per_level UNIQUE (setting_key, level, house_id, resident_id)
);

-- Index for fast lookups
CREATE INDEX idx_hierarchical_settings_key ON hierarchical_settings(setting_key);
CREATE INDEX idx_hierarchical_settings_house ON hierarchical_settings(house_id) WHERE house_id IS NOT NULL;
CREATE INDEX idx_hierarchical_settings_resident ON hierarchical_settings(resident_id) WHERE resident_id IS NOT NULL;
CREATE INDEX idx_hierarchical_settings_category ON hierarchical_settings(category);

-- Updated_at trigger
CREATE TRIGGER update_hierarchical_settings_updated_at
  BEFORE UPDATE ON hierarchical_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- RLS Policies
ALTER TABLE hierarchical_settings ENABLE ROW LEVEL SECURITY;

-- Estate-level settings: All authenticated users can read
CREATE POLICY "hierarchical_settings_read_estate"
  ON hierarchical_settings
  FOR SELECT
  TO authenticated
  USING (level = 'estate');

-- House-level settings: Authenticated users can read
CREATE POLICY "hierarchical_settings_read_house"
  ON hierarchical_settings
  FOR SELECT
  TO authenticated
  USING (level = 'house');

-- Resident-level settings: Residents can read their own (via profile_id link)
CREATE POLICY "hierarchical_settings_read_own_resident"
  ON hierarchical_settings
  FOR SELECT
  TO authenticated
  USING (
    level = 'resident' AND
    resident_id IN (
      SELECT id FROM residents WHERE profile_id = auth.uid()
    )
  );

-- Admin and chairman can manage all settings
CREATE POLICY "hierarchical_settings_admin_all"
  ON hierarchical_settings
  FOR ALL
  TO authenticated
  USING (
    public.get_my_role() IN ('admin', 'chairman')
  );

-- Insert default estate-level settings for common use cases
INSERT INTO hierarchical_settings (setting_key, category, level, value, description) VALUES
  -- Occupancy counting settings
  ('max_occupants_per_unit', 'occupancy', 'estate', '"10"', 'Maximum number of occupants allowed per residential unit'),
  ('count_children_in_occupancy', 'occupancy', 'estate', 'true', 'Whether to count children (household_member) in occupancy limits'),
  ('count_staff_in_occupancy', 'occupancy', 'estate', 'false', 'Whether to count domestic staff in occupancy limits'),
  
  -- Access code defaults
  ('default_access_code_validity_days', 'security', 'estate', '30', 'Default number of days an access code is valid'),
  ('access_code_renewal_reminder_days', 'security', 'estate', '7', 'Days before expiry to send renewal reminder'),
  ('max_active_codes_per_resident', 'security', 'estate', '5', 'Maximum number of active access codes per resident'),
  
  -- Approval timeouts
  ('approval_auto_reject_hours', 'approvals', 'estate', '72', 'Hours before pending approvals are auto-rejected'),
  ('approval_reminder_hours', 'approvals', 'estate', '24', 'Hours before sending approval reminder'),
  
  -- Reporting settings
  ('default_report_format', 'reports', 'estate', '"pdf"', 'Default format for generated reports'),
  ('report_retention_days', 'reports', 'estate', '90', 'Number of days to retain generated reports'),
  
  -- Portal settings
  ('portal_session_timeout_minutes', 'portal', 'estate', '30', 'Portal session timeout in minutes'),
  ('portal_show_payment_history', 'portal', 'estate', 'true', 'Whether to show payment history in portal');

-- Function to get effective setting value with cascade resolution
CREATE OR REPLACE FUNCTION get_effective_setting(
  p_setting_key TEXT,
  p_house_id UUID DEFAULT NULL,
  p_resident_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_actual_house_id UUID;
BEGIN
  -- If resident_id provided but no house_id, look up the house
  IF p_resident_id IS NOT NULL AND p_house_id IS NULL THEN
    SELECT rh.house_id INTO v_actual_house_id
    FROM resident_houses rh
    WHERE rh.resident_id = p_resident_id
    AND rh.is_active = true
    LIMIT 1;
  ELSE
    v_actual_house_id := p_house_id;
  END IF;

  -- Try resident level first (if resident_id provided)
  IF p_resident_id IS NOT NULL THEN
    SELECT value INTO v_result
    FROM hierarchical_settings
    WHERE setting_key = p_setting_key
    AND level = 'resident'
    AND resident_id = p_resident_id;
    
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;
  
  -- Try house level (if house_id provided or derived from resident)
  IF v_actual_house_id IS NOT NULL THEN
    SELECT value INTO v_result
    FROM hierarchical_settings
    WHERE setting_key = p_setting_key
    AND level = 'house'
    AND house_id = v_actual_house_id;
    
    IF v_result IS NOT NULL THEN
      RETURN v_result;
    END IF;
  END IF;
  
  -- Fall back to estate level
  SELECT value INTO v_result
  FROM hierarchical_settings
  WHERE setting_key = p_setting_key
  AND level = 'estate';
  
  RETURN v_result;
END;
$$;

-- Function to get all overrides for a setting
CREATE OR REPLACE FUNCTION get_setting_overrides(p_setting_key TEXT)
RETURNS TABLE (
  level setting_level,
  house_id UUID,
  resident_id UUID,
  value JSONB,
  reference_name TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    hs.level,
    hs.house_id,
    hs.resident_id,
    hs.value,
    CASE 
      WHEN hs.level = 'estate' THEN 'Estate Default'
      WHEN hs.level = 'house' THEN h.house_number || ' ' || COALESCE(s.name, '')
      WHEN hs.level = 'resident' THEN r.first_name || ' ' || r.last_name
    END as reference_name
  FROM hierarchical_settings hs
  LEFT JOIN houses h ON hs.house_id = h.id
  LEFT JOIN streets s ON h.street_id = s.id
  LEFT JOIN residents r ON hs.resident_id = r.id
  WHERE hs.setting_key = p_setting_key
  ORDER BY 
    CASE hs.level
      WHEN 'estate' THEN 1
      WHEN 'house' THEN 2
      WHEN 'resident' THEN 3
    END,
    reference_name;
END;
$$;

-- Grant execute on functions
GRANT EXECUTE ON FUNCTION get_effective_setting TO authenticated;
GRANT EXECUTE ON FUNCTION get_setting_overrides TO authenticated;

-- Grant table access
GRANT ALL ON hierarchical_settings TO authenticated;

COMMENT ON TABLE hierarchical_settings IS 'Three-level hierarchical settings (estate -> house -> resident) for flexible configuration';
COMMENT ON FUNCTION get_effective_setting IS 'Resolves setting value using cascade: resident -> house -> estate';
COMMENT ON FUNCTION get_setting_overrides IS 'Returns all configured values for a setting across all levels';
