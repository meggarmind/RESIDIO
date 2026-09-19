-- Development Levy Feature Enhancement
-- Adds explicit profile classification and current tracking

-- 1. Add is_development_levy flag to billing_profiles
ALTER TABLE billing_profiles
ADD COLUMN IF NOT EXISTS is_development_levy BOOLEAN DEFAULT false;

-- 2. Migrate existing Development Levy profiles (by name pattern)
UPDATE billing_profiles
SET is_development_levy = true
WHERE name ILIKE '%development%' AND is_one_time = true;

-- 3. Add system setting for current Development Levy profile
INSERT INTO system_settings (key, value, description, category)
VALUES (
  'current_development_levy_profile_id',
  'null',
  'UUID of the active Development Levy profile for new houses. Set to null to disable auto-application.',
  'billing'
) ON CONFLICT (key) DO NOTHING;

-- 4. If there's exactly one Development Levy profile, set it as current
DO $$
DECLARE
  dev_levy_id UUID;
  profile_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO profile_count
  FROM billing_profiles
  WHERE is_development_levy = true AND is_active = true;

  IF profile_count = 1 THEN
    SELECT id INTO dev_levy_id
    FROM billing_profiles
    WHERE is_development_levy = true AND is_active = true
    LIMIT 1;
    
    IF dev_levy_id IS NOT NULL THEN
      UPDATE system_settings
      SET value = to_jsonb(dev_levy_id::text)
      WHERE key = 'current_development_levy_profile_id';
    END IF;
  END IF;
END $$;

-- 5. Index for querying Development Levy profiles
CREATE INDEX IF NOT EXISTS idx_billing_profiles_development_levy
ON billing_profiles(is_development_levy) WHERE is_development_levy = true;

-- 6. Add comment for documentation
COMMENT ON COLUMN billing_profiles.is_development_levy IS 'True if this is a Development Levy profile. Development Levies are flat fees per house applied at creation.';
