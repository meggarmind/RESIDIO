-- Migration: Store resident names in capital letters (#1414)
-- Purpose: owner decision 1 Nov 2026 (#1414): all resident names are stored in capitals.
--   A BEFORE trigger on public.residents is the guard for every write path: the admin form,
--   the import, the WhatsApp bot and the seed scripts. No caller has to remember to uppercase.
--   upper(NULL) is NULL, so empty company_name and last_name values stay NULL.
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS, and the backfill only touches rows that differ.
--
-- Backfill is one-way: the original casing is not kept. A rollback drops the trigger and function
-- only; it cannot restore the previous casing of existing rows.

CREATE OR REPLACE FUNCTION public.uppercase_resident_names()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.first_name := upper(NEW.first_name);
  NEW.last_name := upper(NEW.last_name);
  NEW.company_name := upper(NEW.company_name);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS residents_uppercase_names ON public.residents;
CREATE TRIGGER residents_uppercase_names
  BEFORE INSERT OR UPDATE OF first_name, last_name, company_name ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.uppercase_resident_names();

UPDATE public.residents
SET first_name = upper(first_name),
    last_name = upper(last_name),
    company_name = upper(company_name)
WHERE first_name IS DISTINCT FROM upper(first_name)
   OR last_name IS DISTINCT FROM upper(last_name)
   OR company_name IS DISTINCT FROM upper(company_name);

-- ROLLBACK (drops the guard only; the original casing of backfilled rows is not recoverable):
-- DROP TRIGGER IF EXISTS residents_uppercase_names ON public.residents;
-- DROP FUNCTION IF EXISTS public.uppercase_resident_names();
