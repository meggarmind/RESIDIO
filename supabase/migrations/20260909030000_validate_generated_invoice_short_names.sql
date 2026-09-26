BEGIN;

-- Issue #345: invoice numbers are permanent, so a label-derived segment must
-- never be silently normalised. The canonical form is upper(btrim(short_name))
-- and, when present, it is limited to URL/filename-safe ASCII letters,
-- digits, dots and hyphens. Missing/blank names retain the existing UUID
-- fallback; every non-empty unsafe or non-unique label blocks the whole run.
WITH normalised_houses AS (
  SELECT
    id,
    upper(btrim(short_name)) AS canonical_short_name
  FROM public.houses
),
duplicate_names AS (
  SELECT canonical_short_name
  FROM normalised_houses
  WHERE canonical_short_name <> ''
    AND canonical_short_name ~ '^[A-Z0-9][A-Z0-9.-]*$'
  GROUP BY canonical_short_name
  HAVING count(*) > 1
),
offending_houses AS (
  SELECT id
  FROM normalised_houses
  WHERE canonical_short_name <> ''
    AND canonical_short_name !~ '^[A-Z0-9][A-Z0-9.-]*$'
  UNION
  SELECT h.id
  FROM normalised_houses h
  JOIN duplicate_names d ON d.canonical_short_name = h.canonical_short_name
)
UPDATE public.houses h
SET
  identifier_unverified = true,
  identifier_note = COALESCE(
    h.identifier_note,
    'Invoice generation blocked: short_name is unsafe or non-unique under the invoice-number character policy. Confirm the recorded identifier before generating invoices.'
  )
WHERE h.id IN (SELECT id FROM offending_houses);

CREATE OR REPLACE FUNCTION public.validate_invoice_generation_run_short_names(p_run_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_offending_houses text[];
BEGIN
  WITH normalised_houses AS (
    SELECT
      h.id,
      h.short_name,
      h.house_number,
      upper(btrim(h.short_name)) AS canonical_short_name
    FROM public.houses h
  ),
  duplicate_names AS (
    SELECT canonical_short_name
    FROM normalised_houses
    WHERE canonical_short_name <> ''
      AND canonical_short_name ~ '^[A-Z0-9][A-Z0-9.-]*$'
    GROUP BY canonical_short_name
    HAVING count(*) > 1
  ),
  offending_houses AS (
    SELECT h.id, h.short_name, h.house_number
    FROM normalised_houses h
    JOIN public.invoice_generation_candidates c ON c.house_id = h.id
    WHERE c.run_id = p_run_id
      AND c.status IN ('pending', 'processing')
      AND h.canonical_short_name <> ''
      AND (
        h.canonical_short_name !~ '^[A-Z0-9][A-Z0-9.-]*$'
        OR EXISTS (
          SELECT 1
          FROM duplicate_names d
          WHERE d.canonical_short_name = h.canonical_short_name
        )
      )
  )
  SELECT array_agg(
    format('%s [%s]', COALESCE(short_name, house_number, id::text), id::text)
    ORDER BY COALESCE(short_name, house_number, id::text)
  )
  INTO v_offending_houses
  FROM offending_houses;

  IF v_offending_houses IS NOT NULL THEN
    RAISE EXCEPTION 'Invoice generation blocked: unsafe or non-unique house short_name values: %',
      array_to_string(v_offending_houses, ', ');
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.validate_invoice_generation_run_short_names(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.validate_invoice_generation_run_short_names(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.validate_invoice_generation_run_short_names(uuid) TO authenticated, service_role;

COMMIT;
