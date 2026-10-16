-- #302: visitor_vehicles invariants.
--   * a plate is unique among ACTIVE vehicles estate-wide, compared after
--     normalisation (upper-case alphanumerics only);
--   * a contact has at most one ACTIVE primary vehicle;
--   * changing the primary vehicle is one atomic function call.
-- Owner decision recorded on #302 (2026-10-16).
--
-- This migration never deletes or rewrites rows. If existing data already
-- violates an invariant the pre-check below aborts the whole migration with the
-- offending counts, so the owner can resolve the data deliberately.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.set_primary_vehicle(uuid);
--   DROP INDEX IF EXISTS public.uq_visitor_vehicles_one_active_primary;
--   DROP INDEX IF EXISTS public.uq_visitor_vehicles_active_plate;

-- 1. Pre-check: refuse to proceed over conflicting data.
DO $$
DECLARE
    v_dup_plates integer;
    v_multi_primary integer;
BEGIN
    SELECT COUNT(*) INTO v_dup_plates
    FROM (
        SELECT upper(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g'))
        FROM public.visitor_vehicles
        WHERE is_active
        GROUP BY 1
        HAVING COUNT(*) > 1
    ) d;

    SELECT COUNT(*) INTO v_multi_primary
    FROM (
        SELECT contact_id
        FROM public.visitor_vehicles
        WHERE is_primary AND is_active
        GROUP BY contact_id
        HAVING COUNT(*) > 1
    ) m;

    IF v_dup_plates > 0 OR v_multi_primary > 0 THEN
        RAISE EXCEPTION
            'visitor_vehicles invariants (#302) cannot be applied: % normalised plate(s) are shared by several active vehicles and % contact(s) have more than one active primary vehicle. Resolve these rows manually, then re-run.',
            v_dup_plates, v_multi_primary;
    END IF;
END
$$;

-- 2. A plate is unique among active vehicles, after normalisation.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_vehicles_active_plate
    ON public.visitor_vehicles ((upper(regexp_replace(plate_number, '[^A-Za-z0-9]', '', 'g'))))
    WHERE is_active;

-- 3. At most one active primary vehicle per contact.
CREATE UNIQUE INDEX IF NOT EXISTS uq_visitor_vehicles_one_active_primary
    ON public.visitor_vehicles (contact_id)
    WHERE is_primary AND is_active;

-- 4. Atomic set-primary. SECURITY INVOKER: the caller's RLS still applies.
-- Rows are locked in id order so two concurrent calls for the same contact
-- serialise instead of deadlocking.
CREATE OR REPLACE FUNCTION public.set_primary_vehicle(p_vehicle_id uuid)
RETURNS public.visitor_vehicles
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_contact_id uuid;
    v_vehicle public.visitor_vehicles;
BEGIN
    SELECT contact_id INTO v_contact_id
    FROM public.visitor_vehicles
    WHERE id = p_vehicle_id;

    IF v_contact_id IS NULL THEN
        RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id USING ERRCODE = 'P0002';
    END IF;

    PERFORM 1
    FROM public.visitor_vehicles
    WHERE contact_id = v_contact_id AND is_active
    ORDER BY id
    FOR UPDATE;

    PERFORM 1
    FROM public.visitor_vehicles
    WHERE id = p_vehicle_id AND is_active;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Vehicle % is not active', p_vehicle_id USING ERRCODE = 'P0002';
    END IF;

    UPDATE public.visitor_vehicles
    SET is_primary = false, updated_at = now()
    WHERE contact_id = v_contact_id AND is_active AND is_primary AND id <> p_vehicle_id;

    UPDATE public.visitor_vehicles
    SET is_primary = true, updated_at = now()
    WHERE id = p_vehicle_id
    RETURNING * INTO v_vehicle;

    RETURN v_vehicle;
END;
$$;

REVOKE ALL ON FUNCTION public.set_primary_vehicle(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_primary_vehicle(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_primary_vehicle(uuid) TO authenticated;
