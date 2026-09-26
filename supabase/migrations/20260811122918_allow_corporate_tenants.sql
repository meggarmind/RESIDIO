-- Allow a corporate entity to be the active, billable tenant/occupant.
-- Individual owner-occupier rules and the one-active-tenant-per-house rule remain unchanged.

CREATE OR REPLACE FUNCTION public.validate_corporate_role()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  resident_entity_type TEXT;
BEGIN
  SELECT entity_type INTO resident_entity_type
  FROM public.residents
  WHERE id = NEW.resident_id;

  IF resident_entity_type = 'corporate'
    AND NEW.resident_role NOT IN ('non_resident_landlord', 'tenant', 'developer') THEN
    RAISE EXCEPTION 'Corporate entities can only be Property Owner, Corporate Tenant, or Developer';
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.validate_corporate_role() IS
  'Corporate entities may own, develop, or be the active billable tenant of a house.';
