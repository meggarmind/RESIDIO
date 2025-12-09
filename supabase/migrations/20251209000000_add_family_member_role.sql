-- Migration: Add family_member to resident_role enum
-- This role was referenced in the UI but missing from the database enum

-- Add the family_member value to the resident_role enum
ALTER TYPE public.resident_role ADD VALUE IF NOT EXISTS 'family_member';

-- Comment explaining the role
COMMENT ON TYPE public.resident_role IS 'Defines the relationship between a resident and a house: owner (property owner), tenant (renting), occupier (residing without ownership/rental), family_member (household member), domestic_staff (working in the household)';
