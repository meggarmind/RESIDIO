-- Migration: Update resident_role enum and add emergency contact FK

-- 1. Update resident_role enum
-- We can't directly rename enum values in Postgres easily without recreating the type or hacky updates.
-- Since this is early dev, we'll append the new value 'family_member'. 
-- NOTE: We are keeping 'occupier' to avoid breaking existing data/code until a data migration script is run, 
-- but we will update the UI to use 'family_member'. 
-- Alternatively, if we are sure no 'occupier' data exists or we don't care, we can rename.
-- Given Phase 3 is "fresh", let's attempt to ADD the new value.
ALTER TYPE public.resident_role ADD VALUE IF NOT EXISTS 'family_member';

-- 2. Add emergency_contact_resident_id to residents table
ALTER TABLE public.residents 
ADD COLUMN IF NOT EXISTS emergency_contact_resident_id UUID REFERENCES public.residents(id);

-- 3. Add constraint to prevent self-reference
ALTER TABLE public.residents
ADD CONSTRAINT residents_emergency_contact_check 
CHECK (emergency_contact_resident_id != id);

-- 4. Create index for the new FK
CREATE INDEX IF NOT EXISTS idx_residents_emergency_contact ON public.residents(emergency_contact_resident_id);
