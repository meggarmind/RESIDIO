-- Migration: Phase 2 Resident Management Enhancements
-- This migration implements:
-- 1. Role renaming: owner_occupier -> resident_landlord, landlord -> non_resident_landlord
-- 2. Add developer role (developer is a ROLE, not entity type)
-- 3. Remove developer from entity_type (it was never used, but clean up)
-- 4. Update validation triggers for new role names

-- =====================================================
-- PART 1: Update resident_role enum
-- =====================================================

-- Rename existing roles to match new terminology
ALTER TYPE public.resident_role RENAME VALUE 'owner_occupier' TO 'resident_landlord';
ALTER TYPE public.resident_role RENAME VALUE 'landlord' TO 'non_resident_landlord';

-- Add developer role
ALTER TYPE public.resident_role ADD VALUE IF NOT EXISTS 'developer';

-- Update comment
COMMENT ON TYPE public.resident_role IS
'Resident roles (Phase 2 Enhanced):
- resident_landlord: Owner who resides in the unit (was owner_occupier)
- non_resident_landlord: Non-resident owner (was landlord)
- tenant: Leaseholder who resides in the unit
- developer: Developer holding unsold inventory
- co_resident: Adult residing in unit not on title/lease
- household_member: Family dependents (spouse, children)
- domestic_staff: Employees working/living at the unit
- caretaker: Assigned to maintain a vacant unit';

-- =====================================================
-- PART 2: Update validation triggers for new role names
-- =====================================================

-- Update sponsor validation function
CREATE OR REPLACE FUNCTION public.validate_sponsor_requirement()
RETURNS TRIGGER AS $$
BEGIN
  -- domestic_staff and caretaker require a sponsor
  IF NEW.resident_role IN ('domestic_staff', 'caretaker') THEN
    IF NEW.sponsor_resident_id IS NULL THEN
      RAISE EXCEPTION 'Domestic staff and caretakers must have a sponsor_resident_id';
    END IF;

    -- Verify sponsor is associated with the same house (using new role names)
    IF NOT EXISTS (
      SELECT 1 FROM public.resident_houses
      WHERE resident_id = NEW.sponsor_resident_id
      AND house_id = NEW.house_id
      AND is_active = true
      AND resident_role IN ('non_resident_landlord', 'resident_landlord', 'tenant')
    ) THEN
      RAISE EXCEPTION 'Sponsor must be a Resident Landlord, Non-Resident Landlord, or Tenant of the same house';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update residency exclusivity function (using new role names)
CREATE OR REPLACE FUNCTION public.validate_residency_exclusivity()
RETURNS TRIGGER AS $$
DECLARE
  existing_record RECORD;
BEGIN
  -- Only check for residency roles (roles that mean "physically lives here")
  IF NEW.resident_role IN ('resident_landlord', 'tenant', 'co_resident') AND NEW.is_active = true THEN
    -- Check if this resident already has another active residency
    SELECT rh.id, rh.house_id, rh.resident_role, h.house_number
    INTO existing_record
    FROM public.resident_houses rh
    JOIN public.houses h ON h.id = rh.house_id
    WHERE rh.resident_id = NEW.resident_id
    AND rh.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND rh.is_active = true
    AND rh.resident_role IN ('resident_landlord', 'tenant', 'co_resident')
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Residency exclusivity violation: This person already resides at house % as %. A person can only physically reside in one unit at a time.',
        existing_record.house_number, existing_record.resident_role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Update unit occupancy state validation (using new role names)
CREATE OR REPLACE FUNCTION public.validate_unit_occupancy_state()
RETURNS TRIGGER AS $$
DECLARE
  has_resident_landlord BOOLEAN;
  has_tenant BOOLEAN;
  resident_landlord_count INT;
  tenant_count INT;
BEGIN
  -- Only validate when adding primary roles
  IF NEW.resident_role NOT IN ('non_resident_landlord', 'resident_landlord', 'tenant', 'developer') OR NEW.is_active = false THEN
    RETURN NEW;
  END IF;

  -- Count existing primary roles for this house (excluding current record if updating)
  SELECT
    COUNT(*) FILTER (WHERE resident_role = 'resident_landlord'),
    COUNT(*) FILTER (WHERE resident_role = 'tenant')
  INTO resident_landlord_count, tenant_count
  FROM public.resident_houses
  WHERE house_id = NEW.house_id
  AND is_active = true
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Check for invalid combinations

  -- Rule: Only one resident_landlord per house
  IF NEW.resident_role = 'resident_landlord' AND resident_landlord_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: This house already has a Resident Landlord';
  END IF;

  -- Rule: Only one tenant per house
  IF NEW.resident_role = 'tenant' AND tenant_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: This house already has a Tenant';
  END IF;

  -- Rule: Cannot have resident_landlord and tenant in same house
  IF NEW.resident_role = 'resident_landlord' AND tenant_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: Cannot have Resident Landlord and Tenant in the same unit';
  END IF;

  IF NEW.resident_role = 'tenant' AND resident_landlord_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: Cannot have Tenant and Resident Landlord in the same unit';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- PART 3: Add corporate role restriction trigger
-- =====================================================

-- Corporate entities can only be non_resident_landlord or developer
CREATE OR REPLACE FUNCTION public.validate_corporate_role()
RETURNS TRIGGER AS $$
DECLARE
  resident_entity_type TEXT;
BEGIN
  -- Get the entity_type of the resident
  SELECT entity_type INTO resident_entity_type
  FROM public.residents
  WHERE id = NEW.resident_id;

  -- If corporate, only allow non_resident_landlord or developer
  IF resident_entity_type = 'corporate' THEN
    IF NEW.resident_role NOT IN ('non_resident_landlord', 'developer') THEN
      RAISE EXCEPTION 'Corporate entities can only be Non-Resident Landlord or Developer';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_corporate_role_insert ON public.resident_houses;
CREATE TRIGGER validate_corporate_role_insert
  BEFORE INSERT ON public.resident_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_corporate_role();

DROP TRIGGER IF EXISTS validate_corporate_role_update ON public.resident_houses;
CREATE TRIGGER validate_corporate_role_update
  BEFORE UPDATE ON public.resident_houses
  FOR EACH ROW
  WHEN (OLD.resident_role IS DISTINCT FROM NEW.resident_role)
  EXECUTE FUNCTION public.validate_corporate_role();

-- =====================================================
-- PART 4: Clean up any developer entity_type records
-- =====================================================

-- Note: PostgreSQL doesn't support removing enum values directly
-- But we can update any existing records that use 'developer' entity_type to 'individual'
-- (This shouldn't be needed if developer was never used, but just in case)

UPDATE public.residents
SET entity_type = 'individual'
WHERE entity_type = 'developer';

-- =====================================================
-- PART 5: Add comments for clarity
-- =====================================================

COMMENT ON COLUMN public.residents.entity_type IS 'Entity type: individual (person) or corporate (company). Developer is now a ROLE, not an entity type.';
COMMENT ON COLUMN public.resident_houses.resident_role IS 'Role in the house: resident_landlord (owner who lives there), non_resident_landlord (owner who does not live there), tenant, developer (holding unsold inventory), co_resident, household_member, domestic_staff, caretaker';
