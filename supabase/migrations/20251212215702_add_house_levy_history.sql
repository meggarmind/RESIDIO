-- Migration: Add House Levy History Table
-- Tracks which one-time billing profiles (levies) have been applied to each house

-- 1. Create house_levy_history table
CREATE TABLE IF NOT EXISTS house_levy_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  house_id UUID NOT NULL REFERENCES houses(id) ON DELETE CASCADE,
  billing_profile_id UUID NOT NULL REFERENCES billing_profiles(id),
  resident_id UUID NOT NULL REFERENCES residents(id),
  invoice_id UUID REFERENCES invoices(id),
  applied_at TIMESTAMPTZ DEFAULT now(),
  applied_by UUID REFERENCES profiles(id),
  notes TEXT,
  UNIQUE(house_id, billing_profile_id)
);

-- 2. Add comments
COMMENT ON TABLE house_levy_history IS 'Tracks one-time levy applications to prevent duplicate charges';
COMMENT ON COLUMN house_levy_history.house_id IS 'The house the levy was applied to';
COMMENT ON COLUMN house_levy_history.billing_profile_id IS 'The one-time billing profile (levy) that was applied';
COMMENT ON COLUMN house_levy_history.resident_id IS 'The resident who was charged for this levy';
COMMENT ON COLUMN house_levy_history.invoice_id IS 'The invoice generated for this levy';
COMMENT ON COLUMN house_levy_history.applied_at IS 'When the levy was applied';
COMMENT ON COLUMN house_levy_history.applied_by IS 'Admin user who applied the levy (NULL for auto-generated)';

-- 3. Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_house_levy_history_house_id ON house_levy_history(house_id);
CREATE INDEX IF NOT EXISTS idx_house_levy_history_billing_profile_id ON house_levy_history(billing_profile_id);
CREATE INDEX IF NOT EXISTS idx_house_levy_history_resident_id ON house_levy_history(resident_id);

-- 4. Enable RLS
ALTER TABLE house_levy_history ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
CREATE POLICY "house_levy_history_select_policy" ON house_levy_history
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "house_levy_history_insert_policy" ON house_levy_history
  FOR INSERT TO authenticated
  WITH CHECK (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "house_levy_history_update_policy" ON house_levy_history
  FOR UPDATE TO authenticated
  USING (get_my_role() IN ('admin', 'chairman', 'financial_secretary'));

CREATE POLICY "house_levy_history_delete_policy" ON house_levy_history
  FOR DELETE TO authenticated
  USING (get_my_role() = 'admin');
