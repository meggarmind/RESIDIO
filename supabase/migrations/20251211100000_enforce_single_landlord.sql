-- Migration: Enforce single landlord per house constraint
-- Only ONE landlord of any type per house (resident_landlord OR non_resident_landlord)
--
-- This fixes a gap in the previous validate_unit_occupancy_state() function
-- which did not prevent multiple landlords or mixed landlord types on the same house.

CREATE OR REPLACE FUNCTION public.validate_unit_occupancy_state()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  landlord_count INT;
  resident_landlord_count INT;
  tenant_count INT;
BEGIN
  -- Only validate when adding primary roles
  IF NEW.resident_role NOT IN ('non_resident_landlord', 'resident_landlord', 'tenant', 'developer') OR NEW.is_active = false THEN
    RETURN NEW;
  END IF;

  -- Count existing primary roles for this house (excluding current record if updating)
  SELECT
    COUNT(*) FILTER (WHERE resident_role IN ('resident_landlord', 'non_resident_landlord')),
    COUNT(*) FILTER (WHERE resident_role = 'resident_landlord'),
    COUNT(*) FILTER (WHERE resident_role = 'tenant')
  INTO landlord_count, resident_landlord_count, tenant_count
  FROM public.resident_houses
  WHERE house_id = NEW.house_id
  AND is_active = true
  AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Rule: Only ONE landlord of any type per house
  IF NEW.resident_role = 'resident_landlord' AND landlord_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: This house already has a landlord. Only one landlord (Resident or Non-Resident) is allowed per house.';
  END IF;

  IF NEW.resident_role = 'non_resident_landlord' AND landlord_count > 0 THEN
    RAISE EXCEPTION 'Invalid occupancy state: This house already has a landlord. Only one landlord (Resident or Non-Resident) is allowed per house.';
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
$function$;
