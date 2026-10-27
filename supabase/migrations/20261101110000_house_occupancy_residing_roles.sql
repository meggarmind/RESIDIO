-- House occupancy counts residing roles only (owner decision 2026-10-24, #1148).
-- A house is occupied (houses.is_occupied = true) only when it has an active resident_houses link
-- whose resident_role is 'tenant' or 'resident_landlord'. Non-resident landlords, developers,
-- co-residents and staff no longer make a house occupied. property_status is not touched.
-- Idempotent: CREATE OR REPLACE plus a recompute that only writes rows that differ.

CREATE OR REPLACE FUNCTION public.update_house_occupancy()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
DECLARE
    target_house_id UUID;
BEGIN
    IF TG_OP = 'DELETE' THEN
        target_house_id := OLD.house_id;
    ELSE
        target_house_id := NEW.house_id;
    END IF;

    UPDATE public.houses
    SET is_occupied = EXISTS(
        SELECT 1 FROM public.resident_houses rh
        WHERE rh.house_id = target_house_id
        AND rh.is_active = true
        AND rh.resident_role::text IN ('tenant', 'resident_landlord')
    ),
    updated_at = NOW()
    WHERE id = target_house_id;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Recompute every house under the new rule.
UPDATE public.houses h
SET is_occupied = EXISTS(
    SELECT 1 FROM public.resident_houses rh
    WHERE rh.house_id = h.id
    AND rh.is_active = true
    AND rh.resident_role::text IN ('tenant', 'resident_landlord')
)
WHERE h.is_occupied IS DISTINCT FROM EXISTS(
    SELECT 1 FROM public.resident_houses rh
    WHERE rh.house_id = h.id
    AND rh.is_active = true
    AND rh.resident_role::text IN ('tenant', 'resident_landlord')
);

-- ROLLBACK: restore the previous function body, then recompute occupancy from any active link.
--   CREATE OR REPLACE FUNCTION public.update_house_occupancy() RETURNS TRIGGER AS $f$
--   DECLARE target_house_id UUID;
--   BEGIN
--       IF TG_OP = 'DELETE' THEN target_house_id := OLD.house_id; ELSE target_house_id := NEW.house_id; END IF;
--       UPDATE public.houses
--       SET is_occupied = EXISTS(SELECT 1 FROM public.resident_houses
--           WHERE house_id = target_house_id AND is_active = true), updated_at = NOW()
--       WHERE id = target_house_id;
--       IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
--   END;
--   $f$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth', 'extensions', 'pg_temp';
--   UPDATE public.houses h SET is_occupied = EXISTS(SELECT 1 FROM public.resident_houses rh
--       WHERE rh.house_id = h.id AND rh.is_active = true);
