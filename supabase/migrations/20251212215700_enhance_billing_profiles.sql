-- Migration: Enhance Billing Profiles for Role-Based and One-Time Billing
-- This migration adds target type, applicable roles, and one-time flag to billing profiles
-- Also adds billing profile override to houses and removes is_billing_responsible from resident_houses

-- 1. Create enum for billing target type
DO $$ BEGIN
  CREATE TYPE billing_target_type AS ENUM ('house', 'resident');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. Add new columns to billing_profiles
ALTER TABLE billing_profiles
  ADD COLUMN IF NOT EXISTS target_type billing_target_type NOT NULL DEFAULT 'house',
  ADD COLUMN IF NOT EXISTS applicable_roles TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_one_time BOOLEAN NOT NULL DEFAULT FALSE;

-- 3. Add comment for clarity
COMMENT ON COLUMN billing_profiles.target_type IS 'house = property-level billing, resident = role-based billing';
COMMENT ON COLUMN billing_profiles.applicable_roles IS 'Array of resident roles this profile applies to (only for target_type=resident)';
COMMENT ON COLUMN billing_profiles.is_one_time IS 'One-time levies (development levy, connection fee) vs recurring (monthly service charge)';

-- 4. Add billing_profile_id override to houses table
ALTER TABLE houses
  ADD COLUMN IF NOT EXISTS billing_profile_id UUID REFERENCES billing_profiles(id);

COMMENT ON COLUMN houses.billing_profile_id IS 'Optional override for the house type default billing profile';

-- 5. Remove is_billing_responsible from resident_houses (no longer needed)
ALTER TABLE resident_houses
  DROP COLUMN IF EXISTS is_billing_responsible;

-- 6. Add constraint to ensure applicable_roles is set when target_type is 'resident'
-- Note: We use a check constraint that allows NULL for 'house' type
ALTER TABLE billing_profiles
  DROP CONSTRAINT IF EXISTS billing_profiles_applicable_roles_check;

ALTER TABLE billing_profiles
  ADD CONSTRAINT billing_profiles_applicable_roles_check
  CHECK (
    (target_type = 'house') OR
    (target_type = 'resident' AND applicable_roles IS NOT NULL AND array_length(applicable_roles, 1) > 0)
  );
