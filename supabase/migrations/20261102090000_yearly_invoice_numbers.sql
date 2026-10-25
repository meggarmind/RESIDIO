-- Issue #1169: generated monthly invoices were numbered INV-<YYYYMM>-<house8>-<resident8>-<version8>
-- (for example INV-202605-C1925EE4-8DB20966-B15A4065). The owner chose a yearly running number
-- instead: INV-<YYYY>-<6-digit counter>, for example INV-2026-000123. The counter restarts at 1 for
-- each year, and the year is the invoice's billing year (period_start).
--
-- Duplicates are still prevented by invoices_generated_business_key and
-- idx_invoices_unique_billing_period; invoices.invoice_number stays UNIQUE. Existing invoice numbers
-- are NOT renumbered here.
--
-- next_invoice_number() takes the next value with a single upsert on the year's counter row, so the
-- row lock serialises concurrent callers (never max()+1). If the value it would return is already
-- used by an invoice (legacy data), it keeps advancing until it finds an unused one.
--
-- create_generated_invoice is copied unchanged from 20261025090000_generated_invoice_skip_empty_wallet.sql
-- except for the v_invoice_number assignment.

BEGIN;

CREATE TABLE IF NOT EXISTS public.invoice_number_counters (
    year int PRIMARY KEY,
    last_value int NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.invoice_number_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.invoice_number_counters FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.next_invoice_number(p_period_start date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_year int;
    v_value int;
    v_number text;
BEGIN
    IF p_period_start IS NULL THEN
        RAISE EXCEPTION 'next_invoice_number requires a period_start';
    END IF;

    v_year := extract(year FROM p_period_start)::int;

    LOOP
        INSERT INTO public.invoice_number_counters (year, last_value)
        VALUES (v_year, 1)
        ON CONFLICT (year) DO UPDATE
            SET last_value = invoice_number_counters.last_value + 1,
                updated_at = now()
        RETURNING last_value INTO v_value;

        v_number := format('INV-%s-%s', v_year, lpad(v_value::text, 6, '0'));

        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.invoices WHERE invoice_number = v_number
        );
    END LOOP;

    RETURN v_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.next_invoice_number(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.next_invoice_number(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.next_invoice_number(date) TO authenticated, service_role;

-- Issue #359: only future generated invoices use this stable format. Existing
-- invoice_number values are permanent and intentionally remain untouched.
CREATE OR REPLACE FUNCTION public.create_generated_invoice(p_candidate_id uuid, p_actor_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_candidate public.invoice_generation_candidates%ROWTYPE;
    v_invoice_id UUID;
    v_invoice_number TEXT;
    v_wallet_result JSONB := '{}'::jsonb;
    v_wallet_allocated NUMERIC(12, 2) := 0;
    v_wallet_balance NUMERIC(12, 2);
    v_item JSONB;
    v_item_total NUMERIC(12, 2);
BEGIN
    IF auth.uid() IS NOT NULL AND (
        auth.uid() IS DISTINCT FROM p_actor_id
        OR NOT public.has_permission('billing.create_invoice')
    ) THEN
        RAISE EXCEPTION 'Not authorised to create generated invoices';
    END IF;

    SELECT * INTO v_candidate
    FROM public.invoice_generation_candidates
    WHERE id = p_candidate_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Invoice generation candidate % not found', p_candidate_id;
    END IF;
    IF v_candidate.status IN ('created', 'skipped', 'cancelled') THEN
        RETURN jsonb_build_object(
            'status', v_candidate.status,
            'invoice_id', v_candidate.invoice_id,
            'amount', v_candidate.amount_due,
            'wallet_allocated', v_candidate.wallet_allocated
        );
    END IF;
    IF v_candidate.status = 'failed' THEN
        RAISE EXCEPTION 'Invoice generation candidate % has failed and must be retried explicitly', p_candidate_id;
    END IF;

    BEGIN
        IF jsonb_typeof(v_candidate.invoice_items) <> 'array'
           OR jsonb_array_length(v_candidate.invoice_items) = 0 THEN
            RAISE EXCEPTION 'Invoice generation candidate % requires at least one invoice item', p_candidate_id;
        END IF;

        SELECT sum((item ->> 'amount')::numeric)
        INTO v_item_total
        FROM jsonb_array_elements(v_candidate.invoice_items) AS item;

        IF v_item_total IS NULL OR v_item_total <> v_candidate.amount_due THEN
            RAISE EXCEPTION 'Invoice generation candidate % item total % does not equal amount due %',
                p_candidate_id, v_item_total, v_candidate.amount_due;
        END IF;

        UPDATE public.invoice_generation_candidates
        SET status = 'processing', updated_at = now()
        WHERE id = v_candidate.id;

        v_invoice_number := public.next_invoice_number(v_candidate.period_start);

        INSERT INTO public.invoices (
            resident_id, house_id, billing_profile_id, billing_profile_version_id, invoice_number,
            amount_due, amount_paid, status, due_date, period_start, period_end, created_by,
            invoice_type, rate_snapshot
        ) VALUES (
            v_candidate.resident_id, v_candidate.house_id, v_candidate.billing_profile_id,
            v_candidate.billing_profile_version_id, v_invoice_number, v_candidate.amount_due,
            0, 'unpaid', v_candidate.due_date, v_candidate.period_start, v_candidate.period_end,
            p_actor_id, v_candidate.invoice_type, v_candidate.rate_snapshot
        )
        ON CONFLICT (resident_id, house_id, billing_profile_version_id, period_start, period_end)
            WHERE billing_profile_version_id IS NOT NULL
            DO NOTHING
        RETURNING id INTO v_invoice_id;

        IF v_invoice_id IS NULL THEN
            SELECT id INTO v_invoice_id
            FROM public.invoices
            WHERE resident_id = v_candidate.resident_id
              AND house_id IS NOT DISTINCT FROM v_candidate.house_id
              AND billing_profile_version_id = v_candidate.billing_profile_version_id
              AND period_start = v_candidate.period_start
              AND period_end = v_candidate.period_end;

            UPDATE public.invoice_generation_candidates
            SET status = 'skipped', invoice_id = v_invoice_id,
                outcome = jsonb_build_object('reason', 'invoice_already_exists'),
                processed_at = now(), updated_at = now()
            WHERE id = v_candidate.id;

            RETURN jsonb_build_object('status', 'skipped', 'invoice_id', v_invoice_id,
                'amount', v_candidate.amount_due, 'wallet_allocated', 0);
        END IF;

        FOR v_item IN SELECT value FROM jsonb_array_elements(v_candidate.invoice_items)
        LOOP
            INSERT INTO public.invoice_items (invoice_id, description, amount)
            VALUES (v_invoice_id, COALESCE(v_item ->> 'description', v_item ->> 'name'),
                (v_item ->> 'amount')::numeric);
        END LOOP;

        IF v_candidate.wallet_allocation_requested THEN
            SELECT balance INTO v_wallet_balance
            FROM public.resident_wallets
            WHERE resident_id = v_candidate.resident_id
            FOR UPDATE;
        END IF;

        IF v_candidate.wallet_allocation_requested AND COALESCE(v_wallet_balance, 0) > 0 THEN
            v_wallet_result := public.settle_wallet_invoices(
                v_candidate.resident_id, ARRAY[v_invoice_id], 'existing_wallet_settlement',
                current_date, NULL, v_candidate.house_id, 0, v_candidate.amount_due, p_actor_id
            );
            v_wallet_allocated := COALESCE((v_wallet_result ->> 'total_allocated')::numeric, 0);
        END IF;

        UPDATE public.invoice_generation_candidates
        SET status = 'created', invoice_id = v_invoice_id,
            wallet_allocated = v_wallet_allocated,
            outcome = jsonb_build_object('wallet', v_wallet_result),
            processed_at = now(), updated_at = now()
        WHERE id = v_candidate.id;

        RETURN jsonb_build_object('status', 'created', 'invoice_id', v_invoice_id,
            'amount', v_candidate.amount_due, 'wallet_allocated', v_wallet_allocated);
    EXCEPTION WHEN OTHERS THEN
        UPDATE public.invoice_generation_candidates
        SET status = 'failed', error_message = SQLERRM, processed_at = now(), updated_at = now()
        WHERE id = p_candidate_id;

        RETURN jsonb_build_object('status', 'failed', 'invoice_id', NULL,
            'amount', v_candidate.amount_due, 'wallet_allocated', 0, 'error', SQLERRM);
    END;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_generated_invoice(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_generated_invoice(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_generated_invoice(uuid, uuid) TO authenticated, service_role;

COMMIT;

-- ROLLBACK:
-- BEGIN;
-- -- 1. Restore the previous create_generated_invoice body (4-part INV-<YYYYMM>-... numbers): re-run the
-- --    CREATE OR REPLACE FUNCTION block and its REVOKE/GRANT lines from
-- --    20261025090000_generated_invoice_skip_empty_wallet.sql.
-- -- 2. Then drop the counter function and table:
-- DROP FUNCTION IF EXISTS public.next_invoice_number(date);
-- DROP TABLE IF EXISTS public.invoice_number_counters;
-- COMMIT;
-- Invoice numbers already issued in the yearly format stay as they are (they remain unique).
