-- Migration: Add System Settings Table
-- Stores configurable application settings (billing behavior, feature flags, etc.)

-- 1. Create system_settings table
CREATE TABLE IF NOT EXISTS system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  description TEXT,
  category TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Add comments
COMMENT ON TABLE system_settings IS 'Application-wide configuration settings';
COMMENT ON COLUMN system_settings.key IS 'Unique setting identifier (e.g., bill_vacant_houses)';
COMMENT ON COLUMN system_settings.value IS 'Setting value stored as JSONB for flexibility';
COMMENT ON COLUMN system_settings.category IS 'Setting category for grouping (billing, security, general)';

-- 3. Enable RLS
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- 4. RLS Policies - Only admin and chairman can modify settings
CREATE POLICY "system_settings_select_policy" ON system_settings
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "system_settings_insert_policy" ON system_settings
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "system_settings_update_policy" ON system_settings
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman'));

CREATE POLICY "system_settings_delete_policy" ON system_settings
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');

-- 5. Insert default billing settings
INSERT INTO system_settings (key, value, description, category) VALUES
  ('bill_vacant_houses', 'false', 'Bill non-resident landlords for vacant properties', 'billing'),
  ('auto_generate_levies', 'true', 'Automatically generate one-time levies when house is created', 'billing'),
  ('pro_rata_first_month', 'true', 'Apply pro-rata calculation for the first billing month', 'billing'),
  ('invoice_due_day', '7', 'Day of the month when invoices are due', 'billing')
ON CONFLICT (key) DO NOTHING;

-- 6. Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_system_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS system_settings_updated_at ON system_settings;
CREATE TRIGGER system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_system_settings_updated_at();
