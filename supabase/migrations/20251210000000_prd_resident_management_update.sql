-- Migration: PRD Resident Management Update (Part 1 - Schema Changes)
-- This migration implements the new resident management PRD requirements:
-- 1. Update resident_role enum with new role names
-- 2. Add entity_type support for Individual/Corporate/Developer
-- 3. Add sponsor fields for secondary residents
--
-- NOTE: Data migration is in a separate file (Part 2) because PostgreSQL
-- requires a COMMIT before using newly added enum values

-- =====================================================
-- PART 1: Update resident_role enum
-- =====================================================

-- Note: PostgreSQL doesn't support renaming enum values directly in older versions
-- We need to handle this carefully. Using ALTER TYPE ... RENAME VALUE (PG 10+)

-- Rename existing roles to match PRD terminology
ALTER TYPE public.resident_role RENAME VALUE 'owner' TO 'landlord';
ALTER TYPE public.resident_role RENAME VALUE 'occupier' TO 'co_resident';
ALTER TYPE public.resident_role RENAME VALUE 'family_member' TO 'household_member';

-- Add new roles
ALTER TYPE public.resident_role ADD VALUE IF NOT EXISTS 'owner_occupier';
ALTER TYPE public.resident_role ADD VALUE IF NOT EXISTS 'caretaker';

-- Update comment
COMMENT ON TYPE public.resident_role IS
'Resident roles per PRD:
- landlord: Non-resident owner (owns but does not live there)
- owner_occupier: Owner who resides in the unit
- tenant: Leaseholder who resides in the unit
- co_resident: Adult residing in unit not on title/lease
- household_member: Family dependents (spouse, children)
- domestic_staff: Employees working/living at the unit
- caretaker: Assigned to maintain a vacant unit';

-- =====================================================
-- PART 2: Add entity_type to residents
-- =====================================================

-- Create entity_type enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'entity_type') THEN
    CREATE TYPE public.entity_type AS ENUM ('individual', 'corporate', 'developer');
  END IF;
END$$;

-- Grant usage to authenticated users
GRANT USAGE ON TYPE public.entity_type TO authenticated;

-- Add entity type and corporate fields to residents table
ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS entity_type public.entity_type NOT NULL DEFAULT 'individual',
  ADD COLUMN IF NOT EXISTS company_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rc_number VARCHAR(50),
  ADD COLUMN IF NOT EXISTS liaison_contact_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS liaison_contact_phone VARCHAR(20);

-- Add constraint: corporate entities must have company_name
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'corporate_fields_required'
  ) THEN
    ALTER TABLE public.residents
      ADD CONSTRAINT corporate_fields_required CHECK (
        entity_type != 'corporate' OR company_name IS NOT NULL
      );
  END IF;
END$$;

-- Add index for entity_type
CREATE INDEX IF NOT EXISTS residents_entity_type_idx ON public.residents(entity_type);

-- =====================================================
-- PART 3: Add sponsor fields to resident_houses
-- =====================================================

-- Add sponsor_resident_id for secondary roles (domestic_staff, caretaker)
-- This links dependent residents to their sponsoring primary resident
ALTER TABLE public.resident_houses
  ADD COLUMN IF NOT EXISTS sponsor_resident_id UUID REFERENCES public.residents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS is_billing_responsible BOOLEAN NOT NULL DEFAULT false;

-- Add index for sponsor lookups
CREATE INDEX IF NOT EXISTS resident_houses_sponsor_idx ON public.resident_houses(sponsor_resident_id) WHERE sponsor_resident_id IS NOT NULL;

-- =====================================================
-- Note: Functions, triggers, and data migration are in Part 2
-- because they reference the new enum values which require
-- a committed transaction to be usable
-- =====================================================
