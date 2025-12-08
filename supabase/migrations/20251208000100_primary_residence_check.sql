-- Migration: Secure Primary Residence Uniqueness
-- Ensures a resident can only have one 'is_primary=true' record in resident_houses.
-- This prevents data inconsistencies where a user accidentally has two primary homes.

-- 1. Create a unique partial index
-- This will fail if bad data already exists, which is good (we want to know).
CREATE UNIQUE INDEX IF NOT EXISTS unique_primary_residence 
ON public.resident_houses (resident_id) 
WHERE is_primary = true AND is_active = true;

-- Note: We include `AND is_active = true` because historical/inactive records shouldn't block a current primary residence.
