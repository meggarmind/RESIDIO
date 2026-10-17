-- Migration: Per-resident communications override flag (#713, #716)
-- Purpose: let an admin opt one resident in or out of the send-time redirect.
--   NULL  = follow the environment default (non-production: redirect; production: send real)
--   true  = always redirect this resident's messages (while the global switch applies)
--   false = send to the real recipient (Debug Mode still redirects)
-- Nullable, no default, no backfill: every existing row stays NULL and follows the environment default.
-- Idempotent: IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS, so re-applying changes nothing.
--
-- Guard: the table-level UPDATE grant plus the "Residents can update own contact info" policy would let a
-- signed-in resident PATCH their own row, including this column, straight through PostgREST. The trigger
-- below makes the column writable only by authorised callers. It does not touch any other column.

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS use_override_comms boolean;

COMMENT ON COLUMN public.residents.use_override_comms IS
  'Communications override flag (#713). NULL = follow the environment default (non-production: redirect outbound email/SMS/WhatsApp to the override contacts; production: send to the real recipient). true = redirect, false = send to the real recipient. Only users with settings.manage_general may change it. Debug Mode redirects regardless.';

CREATE OR REPLACE FUNCTION public.guard_residents_use_override_comms()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF (TG_OP = 'UPDATE' AND NEW.use_override_comms IS DISTINCT FROM OLD.use_override_comms)
     OR (TG_OP = 'INSERT' AND NEW.use_override_comms IS NOT NULL) THEN
    IF auth.role() = 'service_role'
       OR auth.uid() IS NULL
       OR public.has_permission('settings.manage_general') THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'use_override_comms may only be changed by a settings manager'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS residents_guard_use_override_comms ON public.residents;
CREATE TRIGGER residents_guard_use_override_comms
  BEFORE INSERT OR UPDATE ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.guard_residents_use_override_comms();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS residents_guard_use_override_comms ON public.residents;
-- DROP FUNCTION IF EXISTS public.guard_residents_use_override_comms();
-- ALTER TABLE public.residents DROP COLUMN IF EXISTS use_override_comms;
