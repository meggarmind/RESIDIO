-- #1068: who pays a billing profile, and the "New, never occupied" house flag.
--
-- WHAT
--   1. billing_profiles.payer ('occupant' | 'landlord'), NOT NULL. Backfill: is_one_time or
--      is_development_levy -> 'landlord'; every other profile -> 'occupant'.
--   2. houses.is_new_never_occupied boolean NOT NULL DEFAULT false.
--   3. Trigger on resident_houses: an active tenant or resident_landlord row clears the flag on
--      its house and writes one audit_logs row (action UPDATE, entity_type 'houses').
--
-- WHY
--   Payer was guessed from target_type, is_one_time and enum order. Owner decisions Q39-Q42, Q50
--   (2026-10-22): security dues go to the occupant (a vacant house bills the non-resident
--   landlord unless it is new and never occupied); estate levies go to a landlord, never a tenant.
--   The application reads both columns through one function (src/lib/billing/payer.ts).
--   target_type is left alone: dropping it needs an owner decision.
--
-- NO EXISTING INVOICE IS TOUCHED. Only the two new columns and the trigger are added.
--
-- The trigger function is SECURITY DEFINER with an empty search_path: it updates houses and
-- writes audit_logs on behalf of whoever assigned the resident, including service_role callers.
-- EXECUTE is revoked from the API roles (a trigger function cannot be called directly anyway).
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS resident_houses_clear_new_house_flag ON public.resident_houses;
--   DROP FUNCTION IF EXISTS public.clear_new_house_flag();
--   ALTER TABLE public.houses DROP COLUMN IF EXISTS is_new_never_occupied;
--   ALTER TABLE public.billing_profiles DROP COLUMN IF EXISTS payer;
--   (Cleared flags are not restored; the old value is in audit_logs.old_values.)
--
-- VERIFY (read-only, after applying):
--   SELECT payer, is_one_time, is_development_levy, count(*) FROM public.billing_profiles GROUP BY 1,2,3;
--   SELECT count(*) FROM public.houses WHERE is_new_never_occupied;   -- 0 until an admin sets it

BEGIN;

ALTER TABLE public.billing_profiles
  ADD COLUMN IF NOT EXISTS payer text;

UPDATE public.billing_profiles
SET payer = CASE WHEN is_one_time OR is_development_levy THEN 'landlord' ELSE 'occupant' END
WHERE payer IS NULL;

ALTER TABLE public.billing_profiles
  ALTER COLUMN payer SET DEFAULT 'occupant',
  ALTER COLUMN payer SET NOT NULL;

ALTER TABLE public.billing_profiles
  DROP CONSTRAINT IF EXISTS billing_profiles_payer_check;
ALTER TABLE public.billing_profiles
  ADD CONSTRAINT billing_profiles_payer_check CHECK (payer IN ('occupant', 'landlord'));

COMMENT ON COLUMN public.billing_profiles.payer IS
'Who is billed: occupant (tenant, else resident landlord; a vacant house bills the non-resident landlord unless houses.is_new_never_occupied) or landlord (resident landlord, else non-resident landlord, else developer; never a tenant). Frequency is separate (#1068).';

ALTER TABLE public.houses
  ADD COLUMN IF NOT EXISTS is_new_never_occupied boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.houses.is_new_never_occupied IS
'Brand-new house that has never been occupied: no occupant dues while vacant. Cleared when the first tenant or resident landlord is assigned (#1068).';

CREATE OR REPLACE FUNCTION public.clear_new_house_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.is_active IS TRUE AND NEW.resident_role IN ('tenant', 'resident_landlord') THEN
    WITH cleared AS (
      UPDATE public.houses
      SET is_new_never_occupied = false
      WHERE id = NEW.house_id AND is_new_never_occupied
      RETURNING id, house_number
    )
    INSERT INTO public.audit_logs (action, entity_type, entity_id, entity_display, old_values, new_values, description, actor_id)
    SELECT 'UPDATE', 'houses', c.id, c.house_number,
           jsonb_build_object('is_new_never_occupied', true),
           jsonb_build_object('is_new_never_occupied', false),
           'Cleared "New, never occupied": first ' || NEW.resident_role || ' assigned',
           auth.uid()
    FROM cleared c;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.clear_new_house_flag() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS resident_houses_clear_new_house_flag ON public.resident_houses;
CREATE TRIGGER resident_houses_clear_new_house_flag
  AFTER INSERT OR UPDATE OF is_active, resident_role ON public.resident_houses
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_new_house_flag();

COMMIT;
