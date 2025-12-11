-- Migration: PRD Resident Management Update (Part 2 - Functions, Triggers & Data Migration)
-- This is a separate migration file because PostgreSQL requires a COMMIT
-- before newly added enum values can be used in functions and DML statements

-- =====================================================
-- PART 1: Sponsor Validation Function & Triggers
-- =====================================================

-- Create function to validate sponsor requirement
CREATE OR REPLACE FUNCTION public.validate_sponsor_requirement()
RETURNS TRIGGER AS $$
BEGIN
  -- domestic_staff and caretaker require a sponsor
  IF NEW.resident_role IN ('domestic_staff', 'caretaker') THEN
    IF NEW.sponsor_resident_id IS NULL THEN
      RAISE EXCEPTION 'Domestic staff and caretakers must have a sponsor_resident_id';
    END IF;

    -- Verify sponsor is associated with the same house
    IF NOT EXISTS (
      SELECT 1 FROM public.resident_houses
      WHERE resident_id = NEW.sponsor_resident_id
      AND house_id = NEW.house_id
      AND is_active = true
      AND resident_role IN ('landlord', 'owner_occupier', 'tenant')
    ) THEN
      RAISE EXCEPTION 'Sponsor must be a landlord, owner-occupier, or tenant of the same house';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for sponsor validation
DROP TRIGGER IF EXISTS validate_sponsor_on_insert ON public.resident_houses;
CREATE TRIGGER validate_sponsor_on_insert
  BEFORE INSERT ON public.resident_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_sponsor_requirement();

DROP TRIGGER IF EXISTS validate_sponsor_on_update ON public.resident_houses;
CREATE TRIGGER validate_sponsor_on_update
  BEFORE UPDATE ON public.resident_houses
  FOR EACH ROW
  WHEN (OLD.resident_role IS DISTINCT FROM NEW.resident_role OR OLD.sponsor_resident_id IS DISTINCT FROM NEW.sponsor_resident_id)
  EXECUTE FUNCTION public.validate_sponsor_requirement();

-- =====================================================
-- PART 2: Residency Exclusivity Constraint
-- =====================================================

-- An entity can only be owner_occupier, tenant, or co_resident in ONE active house
-- This implements the "One Home" policy from the PRD

CREATE OR REPLACE FUNCTION public.validate_residency_exclusivity()
RETURNS TRIGGER AS $$
DECLARE
  existing_record RECORD;
BEGIN
  -- Only check for residency roles (roles that mean "physically lives here")
  IF NEW.resident_role IN ('owner_occupier', 'tenant', 'co_resident') AND NEW.is_active = true THEN
    -- Check if this resident already has another active residency
    SELECT rh.id, rh.house_id, rh.resident_role, h.house_number
    INTO existing_record
    FROM public.resident_houses rh
    JOIN public.houses h ON h.id = rh.house_id
    WHERE rh.resident_id = NEW.resident_id
    AND rh.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
    AND rh.is_active = true
    AND rh.resident_role IN ('owner_occupier', 'tenant', 'co_resident')
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION 'Residency exclusivity violation: This person already resides at house % as %. A person can only physically reside in one unit at a time.',
        existing_record.house_number, existing_record.resident_role;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_residency_exclusivity_insert ON public.resident_houses;
CREATE TRIGGER validate_residency_exclusivity_insert
  BEFORE INSERT ON public.resident_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_residency_exclusivity();

DROP TRIGGER IF EXISTS validate_residency_exclusivity_update ON public.resident_houses;
CREATE TRIGGER validate_residency_exclusivity_update
  BEFORE UPDATE ON public.resident_houses
  FOR EACH ROW
  WHEN (OLD.resident_role IS DISTINCT FROM NEW.resident_role OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.validate_residency_exclusivity();

-- =====================================================
-- PART 3: Unit Occupancy State Validation
-- =====================================================

-- Enforce valid unit occupancy combinations:
-- - Cannot have owner_occupier + tenant (invalid)
-- - Cannot have two owner_occupiers (invalid)
-- - Cannot have two tenants (invalid)
-- - owner_occupier alone = Owner Occupied state
-- - landlord + tenant = Tenanted state
-- - landlord alone = Vacant (Sold) state

CREATE OR REPLACE FUNCTION public.validate_unit_occupancy_state()
RETURNS TRIGGER AS $$
DECLARE
  has_owner_occupier BOOLEAN;
  has_tenant BOOLEAN;
  owner_occupier_count INT;
  tenant_count INT;
BEGIN
  -- Only validate when adding primary roles
  IF NEW.resident_role NOT IN ('landlord', 'owner_occupier', 'tenant') OR NEW.is_active = false THEN
    RETURN NEW;
  END IF;

  -- Count existing primary roles for this house (excluding current record if updating)
  SELECT
    COUNT(*) FILTER (WHERE resident_role = 'owner_occupier'),
    COUNT(*) FILTER (WHERE resident_role = 'tenant')
  INTO owner_occupier_count, tenant_count
  FROM public.resident_houses
  WHERE house_id = NEW.house_id
  AND is_active = true
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Check for invalid combinations

  -- Rule: Only one owner_occupier per house
  IF NEW.resident_role = 'owner_occupier' AND owner_occupier_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: This house already has an owner-occupier';
  END IF;

  -- Rule: Only one tenant per house
  IF NEW.resident_role = 'tenant' AND tenant_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: This house already has a tenant';
  END IF;

  -- Rule: Cannot have owner_occupier and tenant in same house
  IF NEW.resident_role = 'owner_occupier' AND tenant_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: Cannot have owner-occupier and tenant in the same unit';
  END IF;

  IF NEW.resident_role = 'tenant' AND owner_occupier_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: Cannot have tenant and owner-occupier in the same unit';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_unit_occupancy_insert ON public.resident_houses;
CREATE TRIGGER validate_unit_occupancy_insert
  BEFORE INSERT ON public.resident_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_unit_occupancy_state();

DROP TRIGGER IF EXISTS validate_unit_occupancy_update ON public.resident_houses;
CREATE TRIGGER validate_unit_occupancy_update
  BEFORE UPDATE ON public.resident_houses
  FOR EACH ROW
  WHEN (OLD.resident_role IS DISTINCT FROM NEW.resident_role OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.validate_unit_occupancy_state();

-- =====================================================
-- PART 4: Migrate Existing Data
-- =====================================================

-- Convert existing 'landlord' (formerly 'owner') records to appropriate new roles
-- If is_primary = true, they likely live there, so make them owner_occupier
-- If is_primary = false, they don't live there, so keep as landlord

UPDATE public.resident_houses
SET resident_role = 'owner_occupier'
WHERE resident_role = 'landlord'
AND is_primary = true
AND is_active = true;

-- Note: 'co_resident' (formerly 'occupier') and 'household_member' (formerly 'family_member')
-- are already renamed by the ALTER TYPE statements in Part 1 migration
