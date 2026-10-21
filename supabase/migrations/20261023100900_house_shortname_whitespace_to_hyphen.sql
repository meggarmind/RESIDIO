-- Issue #965: generate_house_shortname must not emit spaces.
--
-- A house_number such as '14 F1' produced 'GLB-14 F1', which
-- validate_invoice_generation_run_short_names rejects, failing the whole invoice run.
-- Each run of whitespace in house_number now becomes one hyphen ('GLB-14-F1').
-- Only affects names generated from now on; existing short_name values are not rewritten
-- (invoice numbers are permanent, #345). No CHECK is added: the '?' rows (#119) stay valid.
--
-- Rollback (idempotent; restores the previous body, keeping the hardened search_path):
--   CREATE OR REPLACE FUNCTION public.generate_house_shortname(p_street_id uuid, p_house_number text)
--   RETURNS text LANGUAGE plpgsql STABLE
--   SET search_path = public, auth, extensions, pg_temp
--   AS $fn$
--   DECLARE v_street_code text;
--   BEGIN
--     SELECT short_name INTO v_street_code FROM public.streets WHERE id = p_street_id;
--     IF v_street_code IS NULL THEN RETURN NULL; END IF;
--     RETURN UPPER(v_street_code) || '-' || UPPER(p_house_number);
--   END;
--   $fn$;

CREATE OR REPLACE FUNCTION public.generate_house_shortname(
    p_street_id uuid,
    p_house_number text
) RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_street_code text;
BEGIN
    SELECT short_name INTO v_street_code
    FROM public.streets
    WHERE id = p_street_id;

    -- Street without a short_name: the house short name stays optional.
    IF v_street_code IS NULL THEN
        RETURN NULL;
    END IF;

    RETURN UPPER(v_street_code) || '-' || UPPER(regexp_replace(btrim(p_house_number), '\s+', '-', 'g'));
END;
$$;
