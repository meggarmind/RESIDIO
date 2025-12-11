-- Migration: Remove is_primary flag from resident_houses
-- The is_primary flag is now redundant because:
-- 1. Residency exclusivity is enforced by validate_residency_exclusivity() trigger
-- 2. Billing responsibility is determined by role (tenant > resident_landlord > non_resident_landlord)
-- 3. Date ranges (move_in_date, move_out_date) track when each party was responsible

-- Drop indexes that reference is_primary
DROP INDEX IF EXISTS resident_houses_primary_idx;
DROP INDEX IF EXISTS unique_primary_residence;

-- Remove the is_primary column
ALTER TABLE public.resident_houses DROP COLUMN IF EXISTS is_primary;
