-- #1067: every active co-resident is sponsored by the resident of the same house.
--
-- An active co_resident row must carry sponsor_resident_id, and that sponsor must hold an active
-- resident_landlord or tenant row on the same house. A non_resident_landlord is not a valid sponsor
-- for a co-resident. The domestic_staff and caretaker rule is unchanged.
--
-- The update trigger now also fires when is_active changes, so reactivating a co-resident row is
-- checked. The domestic_staff/caretaker branch still runs only on insert or when the role or sponsor
-- changes, as before, so deactivating staff whose sponsor already left keeps working.
--
-- Live data: Residio_Stage and Residio_Prod had 0 co_resident rows on 2026-10-22. Re-check before applying:
--   SELECT count(*) FROM public.resident_houses rh
--   WHERE rh.resident_role = 'co_resident' AND rh.is_active
--     AND NOT EXISTS (SELECT 1 FROM public.resident_houses s
--                     WHERE s.resident_id = rh.sponsor_resident_id AND s.house_id = rh.house_id
--                       AND s.is_active AND s.resident_role IN ('resident_landlord', 'tenant'));
-- It must be 0. The rule only fires on insert or update, so existing rows are not rejected, but
-- any such row would fail its next edit.
--
-- Rollback: re-run the function body from 20251211000000_phase2_role_enhancements.sql (PART 2,
-- validate_sponsor_requirement), then
--   ALTER FUNCTION public.validate_sponsor_requirement() SET search_path = public, auth, extensions, pg_temp;
--   DROP TRIGGER IF EXISTS validate_sponsor_on_update ON public.resident_houses;
--   CREATE TRIGGER validate_sponsor_on_update BEFORE UPDATE ON public.resident_houses FOR EACH ROW
--     WHEN (OLD.resident_role IS DISTINCT FROM NEW.resident_role OR OLD.sponsor_resident_id IS DISTINCT FROM NEW.sponsor_resident_id)
--     EXECUTE FUNCTION public.validate_sponsor_requirement();

CREATE OR REPLACE FUNCTION public.validate_sponsor_requirement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, auth, extensions, pg_temp
AS $$
BEGIN
  -- co_resident: sponsored by the active Resident Landlord or Tenant of the same house
  IF NEW.resident_role = 'co_resident' AND NEW.is_active THEN
    IF NEW.sponsor_resident_id IS NULL THEN
      RAISE EXCEPTION 'Co-residents must have a sponsor_resident_id';
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.resident_houses
      WHERE resident_id = NEW.sponsor_resident_id
      AND house_id = NEW.house_id
      AND is_active = true
      AND resident_role IN ('resident_landlord', 'tenant')
    ) THEN
      RAISE EXCEPTION 'A co-resident''s sponsor must be the Resident Landlord or Tenant of the same house';
    END IF;
  END IF;

  -- domestic_staff and caretaker require a sponsor (checked on insert or a role/sponsor change only)
  IF NEW.resident_role IN ('domestic_staff', 'caretaker')
     AND (TG_OP = 'INSERT'
          OR OLD.resident_role IS DISTINCT FROM NEW.resident_role
          OR OLD.sponsor_resident_id IS DISTINCT FROM NEW.sponsor_resident_id) THEN
    IF NEW.sponsor_resident_id IS NULL THEN
      RAISE EXCEPTION 'Domestic staff and caretakers must have a sponsor_resident_id';
    END IF;

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
$$;

DROP TRIGGER IF EXISTS validate_sponsor_on_update ON public.resident_houses;
CREATE TRIGGER validate_sponsor_on_update
  BEFORE UPDATE ON public.resident_houses
  FOR EACH ROW
  WHEN (OLD.resident_role IS DISTINCT FROM NEW.resident_role
        OR OLD.sponsor_resident_id IS DISTINCT FROM NEW.sponsor_resident_id
        OR OLD.is_active IS DISTINCT FROM NEW.is_active)
  EXECUTE FUNCTION public.validate_sponsor_requirement();
