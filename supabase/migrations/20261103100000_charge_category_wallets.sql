-- Issue #1189 (slice 1 of #1188): charge categories, and one wallet per charge category per resident.
--
-- Until now resident_wallets.resident_id was UNIQUE, so all of a resident's money was one balance and
-- settlement spent it on any unpaid invoice of the resident. This migration:
--   1. Adds the lookup table public.charge_categories (dues, development_levy, transformer_fee).
--      Everyone signed in can read it; it is extended by later migrations, not from the app yet.
--   2. Adds charge_category (NOT NULL, default 'dues') to billing_profiles, invoices,
--      resident_wallets and wallet_payment_batches. Every existing row becomes 'dues' (owner
--      decision 1, 26 Oct 2026), so every existing wallet is the resident's Dues wallet with the same
--      balance.
--   3. Replaces UNIQUE (resident_id) on resident_wallets with UNIQUE (resident_id, charge_category).
--   4. Makes every wallet function category-aware:
--        settle_wallet_invoices, settle_wallet_invoices_idempotent: new last argument
--          p_charge_category (default 'dues'); the wallet of that category is used and an invoice of
--          another category is refused. The batch records its category.
--        adjust_wallet_credit, adjust_wallet_debit: new last argument p_charge_category (default 'dues').
--        pay_invoice_with_wallet, pay_invoices_with_wallet, reverse_invoice_payment_allocation: the
--          wallet is the one of the invoice's category; a multi-invoice payment must be one category.
--        reverse_wallet_payment_batch: reverses into the wallet of the batch's category.
--        create_generated_invoice: the invoice takes its billing profile's category and is settled
--          only from the wallet of that category.
--        get_debt_statuses, get_resident_indebtedness: the wallet figure is the sum of the
--          resident's wallets (a scalar subquery over one row per resident would now fail).
--        merge_residents: combines the two records' wallets category by category.
--      Each function is copied from its latest definition (verified against Residio_Stage by a
--      normalised md5 of prosrc on 26 Oct 2026) with only the category edits. The functions whose
--      argument list changes are dropped and recreated; their defaults keep every existing named-
--      argument caller working.
--
-- ROLLBACK (only while no resident has a non-Dues wallet or invoice; check first:
--   SELECT count(*) FROM public.resident_wallets WHERE charge_category <> 'dues';  -- must be 0
--   SELECT count(*) FROM public.invoices WHERE charge_category <> 'dues';          -- must be 0):
-- BEGIN;
-- -- 1. Re-run the CREATE OR REPLACE FUNCTION, REVOKE and GRANT blocks of the previous definitions:
-- --    adjust_wallet_credit/debit from 20260908010000_atomic_manual_wallet_adjustments.sql,
-- --    settle_wallet_invoices from 20260813125404_add_wallet_batch_allocation_snapshots.sql,
-- --    settle_wallet_invoices_idempotent from 20260824180000_transactional_admin_workflows.sql,
-- --    reverse_wallet_payment_batch from 20260812225435_fix_wallet_batch_reversal_balances.sql,
-- --    pay_invoice_with_wallet, pay_invoices_with_wallet, reverse_invoice_payment_allocation from
-- --    20261012220000_atomic_wallet_payment_rpcs.sql, create_generated_invoice from
-- --    20261102090000_yearly_invoice_numbers.sql, get_debt_statuses from 20261022180000_debt_status.sql,
-- --    get_resident_indebtedness from 20261024110000_house_resident_debt_status.sql and merge_residents
-- --    from 20261024100100_resident_merge_functions.sql, after dropping the new signatures:
-- DROP FUNCTION IF EXISTS public.adjust_wallet_credit(UUID, DECIMAL, TEXT, UUID, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.adjust_wallet_debit(UUID, DECIMAL, TEXT, UUID, TEXT, TEXT);
-- DROP FUNCTION IF EXISTS public.settle_wallet_invoices_idempotent(UUID, UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID, TEXT);
-- -- 2. Then the schema:
-- ALTER TABLE public.resident_wallets DROP CONSTRAINT resident_wallets_resident_id_charge_category_key;
-- ALTER TABLE public.resident_wallets ADD CONSTRAINT resident_wallets_resident_id_key UNIQUE (resident_id);
-- ALTER TABLE public.resident_wallets DROP COLUMN charge_category;
-- ALTER TABLE public.wallet_payment_batches DROP COLUMN charge_category;
-- ALTER TABLE public.invoices DROP COLUMN charge_category;
-- ALTER TABLE public.billing_profiles DROP COLUMN charge_category;
-- DROP TABLE public.charge_categories;
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT code, name FROM public.charge_categories ORDER BY sort_order;     -- dues, development_levy, transformer_fee
--   SELECT charge_category, count(*), sum(balance) FROM public.resident_wallets GROUP BY 1;
--     -- one row: dues, the same count and sum as before (Stage, 26 Oct 2026: 148 wallets, 42759524.00)
--   SELECT count(*) FROM (SELECT resident_id FROM public.resident_wallets GROUP BY 1, charge_category HAVING count(*) > 1) x;  -- 0
--   SELECT charge_category, count(*) FROM public.invoices GROUP BY 1;         -- dues only
--   SELECT charge_category, count(*) FROM public.billing_profiles GROUP BY 1; -- dues only
--   SELECT conname FROM pg_constraint WHERE conrelid = 'public.resident_wallets'::regclass AND contype = 'u';
--     -- resident_wallets_resident_id_charge_category_key only
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid) FROM pg_proc p
--    WHERE p.proname IN ('settle_wallet_invoices', 'settle_wallet_invoices_idempotent', 'adjust_wallet_credit', 'adjust_wallet_debit');
--     -- one row each, every one ending in p_charge_category text

BEGIN;

CREATE TABLE IF NOT EXISTS public.charge_categories (
    code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]*$'),
    name text NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.charge_categories IS
'What a charge is for (#1189). Each resident has one wallet per category, and a wallet pays only invoices of its own category.';

INSERT INTO public.charge_categories (code, name, sort_order) VALUES
    ('dues', 'Dues', 1),
    ('development_levy', 'Development Levy', 2),
    ('transformer_fee', 'Transformer Fee', 3)
ON CONFLICT (code) DO NOTHING;

ALTER TABLE public.charge_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Signed-in users can read charge categories" ON public.charge_categories;
CREATE POLICY "Signed-in users can read charge categories"
    ON public.charge_categories
    FOR SELECT
    TO authenticated
    USING (true);

REVOKE ALL ON TABLE public.charge_categories FROM anon, authenticated;
GRANT SELECT ON TABLE public.charge_categories TO authenticated;
GRANT ALL ON TABLE public.charge_categories TO service_role;

DROP TRIGGER IF EXISTS charge_categories_updated_at ON public.charge_categories;
CREATE TRIGGER charge_categories_updated_at
    BEFORE UPDATE ON public.charge_categories
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.billing_profiles
    ADD COLUMN IF NOT EXISTS charge_category text NOT NULL DEFAULT 'dues'
        REFERENCES public.charge_categories (code) ON UPDATE CASCADE;
ALTER TABLE public.invoices
    ADD COLUMN IF NOT EXISTS charge_category text NOT NULL DEFAULT 'dues'
        REFERENCES public.charge_categories (code) ON UPDATE CASCADE;
ALTER TABLE public.resident_wallets
    ADD COLUMN IF NOT EXISTS charge_category text NOT NULL DEFAULT 'dues'
        REFERENCES public.charge_categories (code) ON UPDATE CASCADE;
ALTER TABLE public.wallet_payment_batches
    ADD COLUMN IF NOT EXISTS charge_category text NOT NULL DEFAULT 'dues'
        REFERENCES public.charge_categories (code) ON UPDATE CASCADE;

COMMENT ON COLUMN public.billing_profiles.charge_category IS
'Charge category of the invoices this profile generates (#1189); copied to invoices.charge_category at generation.';
COMMENT ON COLUMN public.invoices.charge_category IS
'Charge category, copied from the billing profile at generation (#1189). Only the resident''s wallet of the same category can pay it.';
COMMENT ON COLUMN public.resident_wallets.charge_category IS
'The category this wallet holds money for (#1189). One wallet per resident per category.';
COMMENT ON COLUMN public.wallet_payment_batches.charge_category IS
'The category of the wallet the batch settled from (#1189); a reversal returns the money to that wallet.';

ALTER TABLE public.resident_wallets DROP CONSTRAINT IF EXISTS resident_wallets_resident_id_key;
ALTER TABLE public.resident_wallets DROP CONSTRAINT IF EXISTS resident_wallets_resident_id_charge_category_key;
ALTER TABLE public.resident_wallets
    ADD CONSTRAINT resident_wallets_resident_id_charge_category_key UNIQUE (resident_id, charge_category);

DROP FUNCTION IF EXISTS public.adjust_wallet_credit(UUID, DECIMAL, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_wallet_credit(
    p_resident_id UUID,
    p_amount DECIMAL(12, 2),
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_charge_category TEXT DEFAULT 'dues'
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_wallet public.resident_wallets%ROWTYPE;
    v_new_balance DECIMAL(12, 2);
BEGIN
    IF NOT (public.has_permission('billing.manage_wallets') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Not authorized to adjust wallets';
    END IF;

    IF p_amount IS NULL OR p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Wallet adjustment amount must be finite and greater than zero';
    END IF;

    INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
    VALUES (p_resident_id, p_charge_category, 0)
    ON CONFLICT (resident_id, charge_category) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = p_resident_id
      AND charge_category = p_charge_category
    FOR UPDATE;

    v_new_balance := v_wallet.balance + p_amount;

    UPDATE public.resident_wallets
    SET balance = v_new_balance
    WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
        wallet_id, type, amount, balance_after, reference_type, reference_id, description
    ) VALUES (
        v_wallet.id, 'credit', p_amount, v_new_balance, p_reference_type, p_reference_id, p_description
    );

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'wallet_id', v_wallet.id,
        'charge_category', v_wallet.charge_category);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_wallet_credit(UUID, DECIMAL, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_wallet_credit(UUID, DECIMAL, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.adjust_wallet_debit(UUID, DECIMAL, TEXT, UUID, TEXT);

CREATE OR REPLACE FUNCTION public.adjust_wallet_debit(
    p_resident_id UUID,
    p_amount DECIMAL(12, 2),
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_charge_category TEXT DEFAULT 'dues'
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_wallet public.resident_wallets%ROWTYPE;
    v_new_balance DECIMAL(12, 2);
BEGIN
    IF NOT (public.has_permission('billing.manage_wallets') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Not authorized to adjust wallets';
    END IF;

    IF p_amount IS NULL OR p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Wallet adjustment amount must be finite and greater than zero';
    END IF;

    INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
    VALUES (p_resident_id, p_charge_category, 0)
    ON CONFLICT (resident_id, charge_category) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = p_resident_id
      AND charge_category = p_charge_category
    FOR UPDATE;

    IF v_wallet.balance < p_amount THEN
        RAISE EXCEPTION 'Insufficient wallet balance';
    END IF;

    v_new_balance := v_wallet.balance - p_amount;

    UPDATE public.resident_wallets
    SET balance = v_new_balance
    WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
        wallet_id, type, amount, balance_after, reference_type, reference_id, description
    ) VALUES (
        v_wallet.id, 'debit', p_amount, v_new_balance, p_reference_type, p_reference_id, p_description
    );

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'wallet_id', v_wallet.id,
        'charge_category', v_wallet.charge_category);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_wallet_debit(UUID, DECIMAL, TEXT, UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_wallet_debit(UUID, DECIMAL, TEXT, UUID, TEXT, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID);

CREATE OR REPLACE FUNCTION public.settle_wallet_invoices(
    p_resident_id UUID,
    p_invoice_ids UUID[],
    p_batch_type TEXT,
    p_payment_date DATE,
    p_source_payment_id UUID DEFAULT NULL,
    p_house_id UUID DEFAULT NULL,
    p_credit_amount DECIMAL(12, 2) DEFAULT 0,
    p_batch_amount DECIMAL(12, 2) DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_charge_category TEXT DEFAULT 'dues'
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_wallet resident_wallets%ROWTYPE;
    v_invoice invoices%ROWTYPE;
    v_invoice_id UUID;
    v_wallet_balance DECIMAL(12, 2);
    v_remaining DECIMAL(12, 2);
    v_allocation DECIMAL(12, 2);
    v_total_allocated DECIMAL(12, 2) := 0;
    v_credit_amount DECIMAL(12, 2) := COALESCE(p_credit_amount, 0);
    v_amount_paid_before DECIMAL(12, 2);
    v_amount_paid_after DECIMAL(12, 2);
    v_balance_after DECIMAL(12, 2);
    v_status_after TEXT;
    v_batch_id UUID;
    v_receipt_number TEXT;
    v_wallet_tx_id UUID;
    v_allocations JSONB := '[]'::JSONB;
    v_min_period DATE;
    v_max_period DATE;
BEGIN
    IF p_batch_type NOT IN ('payment_received', 'existing_wallet_settlement', 'future_prepayment') THEN
        RAISE EXCEPTION 'Unsupported wallet payment batch type';
    END IF;
    IF p_credit_amount < 0 OR p_batch_amount < 0 THEN
        RAISE EXCEPTION 'Wallet credit and batch amount must not be negative';
    END IF;
    IF p_charge_category IS NULL OR NOT EXISTS (SELECT 1 FROM public.charge_categories WHERE code = p_charge_category) THEN
        RAISE EXCEPTION 'Unknown charge category %', p_charge_category;
    END IF;
    IF p_invoice_ids IS NULL OR cardinality(p_invoice_ids) = 0 THEN
        RAISE EXCEPTION 'At least one invoice is required for settlement';
    END IF;
    IF p_source_payment_id IS NOT NULL AND EXISTS (SELECT 1 FROM wallet_payment_batches WHERE source_payment_id = p_source_payment_id) THEN
        RETURN (SELECT jsonb_build_object('success', true, 'existing', true, 'batch_id', id, 'receipt_number', receipt_number)
                FROM wallet_payment_batches WHERE source_payment_id = p_source_payment_id);
    END IF;

    SELECT * INTO v_wallet
    FROM public.resident_wallets
    WHERE resident_id = p_resident_id
      AND charge_category = p_charge_category
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
        VALUES (p_resident_id, p_charge_category, 0)
        RETURNING * INTO v_wallet;
    END IF;

    v_wallet_balance := v_wallet.balance + v_credit_amount;

    IF v_credit_amount > 0 THEN
        UPDATE public.resident_wallets SET balance = v_wallet_balance WHERE id = v_wallet.id;
        INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (v_wallet.id, 'credit', v_credit_amount, v_wallet_balance, 'payment', p_source_payment_id, 'Wallet credit for payment batch')
        RETURNING id INTO v_wallet_tx_id;
    END IF;

    FOREACH v_invoice_id IN ARRAY p_invoice_ids LOOP
        SELECT * INTO v_invoice
        FROM public.invoices
        WHERE id = v_invoice_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Invoice % was not found', v_invoice_id;
        END IF;
        IF v_invoice.resident_id <> p_resident_id THEN
            RAISE EXCEPTION 'Invoice % does not belong to the resident', v_invoice.invoice_number;
        END IF;
        IF v_invoice.charge_category <> p_charge_category THEN
            RAISE EXCEPTION 'Invoice % is a % charge and cannot be paid from the % wallet',
                v_invoice.invoice_number, v_invoice.charge_category, p_charge_category;
        END IF;
        IF v_invoice.status NOT IN ('unpaid', 'partially_paid') OR v_invoice.amount_due <= v_invoice.amount_paid THEN
            RAISE EXCEPTION 'Invoice % is not payable', v_invoice.invoice_number;
        END IF;
        IF v_invoice.period_start IS NULL OR v_invoice.period_end IS NULL THEN
            RAISE EXCEPTION 'Invoice % has no billable period', v_invoice.invoice_number;
        END IF;

        v_remaining := v_invoice.amount_due - v_invoice.amount_paid;
        v_allocation := LEAST(v_wallet_balance, v_remaining);
        IF v_allocation <= 0 THEN
            EXIT;
        END IF;

        v_amount_paid_before := v_invoice.amount_paid;
        v_amount_paid_after := v_invoice.amount_paid + v_allocation;
        v_balance_after := GREATEST(0, v_invoice.amount_due - v_amount_paid_after);
        v_status_after := CASE WHEN v_balance_after = 0 THEN 'paid' ELSE 'partially_paid' END;

        v_wallet_balance := v_wallet_balance - v_allocation;
        UPDATE public.invoices
        SET amount_paid = v_amount_paid_after,
            status = v_status_after::invoice_status
        WHERE id = v_invoice.id;

        UPDATE public.resident_wallets SET balance = v_wallet_balance WHERE id = v_wallet.id;
        INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (v_wallet.id, 'debit', v_allocation, v_wallet_balance, 'invoice', v_invoice.id, 'Wallet allocation for ' || v_invoice.invoice_number)
        RETURNING id INTO v_wallet_tx_id;

        v_total_allocated := v_total_allocated + v_allocation;
        IF v_status_after = 'paid' THEN
            v_min_period := CASE WHEN v_min_period IS NULL OR v_invoice.period_start < v_min_period THEN v_invoice.period_start ELSE v_min_period END;
            v_max_period := CASE WHEN v_max_period IS NULL OR v_invoice.period_end > v_max_period THEN v_invoice.period_end ELSE v_max_period END;
        END IF;

        v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
            'invoice_id', v_invoice.id,
            'invoice_number', v_invoice.invoice_number,
            'amount_allocated', v_allocation,
            'invoice_amount_due', v_invoice.amount_due,
            'amount_paid_before', v_amount_paid_before,
            'amount_paid_after', v_amount_paid_after,
            'balance_after', v_balance_after,
            'status_after', v_status_after,
            'period_start', v_invoice.period_start,
            'period_end', v_invoice.period_end,
            'wallet_transaction_id', v_wallet_tx_id
        ));
    END LOOP;

    IF v_total_allocated <= 0 THEN
        RAISE EXCEPTION 'Wallet balance is insufficient for the requested invoices';
    END IF;

    v_receipt_number := public.next_wallet_receipt_number();
    INSERT INTO public.wallet_payment_batches (
        resident_id, house_id, source_payment_id, batch_type, receipt_number, amount, payment_date,
        period_start, period_end, created_by, charge_category
    ) VALUES (
        p_resident_id, p_house_id, p_source_payment_id, p_batch_type,
        v_receipt_number, COALESCE(p_batch_amount, v_total_allocated), p_payment_date,
        v_min_period, v_max_period, p_created_by, p_charge_category
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.wallet_payment_batch_items (
        batch_id, invoice_id, wallet_transaction_id, amount_allocated, invoice_period_start, invoice_period_end,
        invoice_number_at_allocation, invoice_amount_due_at_allocation, amount_paid_before,
        amount_paid_after, balance_after, status_after
    )
    SELECT v_batch_id,
           (allocation->>'invoice_id')::UUID,
           (allocation->>'wallet_transaction_id')::UUID,
           (allocation->>'amount_allocated')::DECIMAL(12,2),
           (allocation->>'period_start')::DATE,
           (allocation->>'period_end')::DATE,
           allocation->>'invoice_number',
           (allocation->>'invoice_amount_due')::DECIMAL(12,2),
           (allocation->>'amount_paid_before')::DECIMAL(12,2),
           (allocation->>'amount_paid_after')::DECIMAL(12,2),
           (allocation->>'balance_after')::DECIMAL(12,2),
           allocation->>'status_after'
    FROM jsonb_array_elements(v_allocations) AS allocation;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch_id,
        'receipt_number', v_receipt_number,
        'total_allocated', v_total_allocated,
        'new_wallet_balance', v_wallet_balance,
        'charge_category', p_charge_category,
        'allocations', v_allocations,
        'period_start', v_min_period,
        'period_end', v_max_period
    );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID, TEXT) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.settle_wallet_invoices_idempotent(UUID, UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID);

CREATE OR REPLACE FUNCTION public.settle_wallet_invoices_idempotent(
    p_request_key UUID,
    p_resident_id UUID,
    p_invoice_ids UUID[],
    p_batch_type TEXT,
    p_payment_date DATE,
    p_source_payment_id UUID DEFAULT NULL,
    p_house_id UUID DEFAULT NULL,
    p_credit_amount DECIMAL(12, 2) DEFAULT 0,
    p_batch_amount DECIMAL(12, 2) DEFAULT NULL,
    p_created_by UUID DEFAULT NULL,
    p_charge_category TEXT DEFAULT 'dues'
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_existing public.wallet_settlement_requests%ROWTYPE;
    v_result JSONB;
BEGIN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_request_key::TEXT, 0));

    SELECT * INTO v_existing
    FROM public.wallet_settlement_requests
    WHERE request_key = p_request_key;

    IF FOUND THEN
        IF v_existing.resident_id <> p_resident_id THEN
            RAISE EXCEPTION 'Settlement request key belongs to another resident';
        END IF;
        RETURN v_existing.result || jsonb_build_object('existing', true);
    END IF;

    v_result := public.settle_wallet_invoices(
        p_resident_id,
        p_invoice_ids,
        p_batch_type,
        p_payment_date,
        p_source_payment_id,
        p_house_id,
        p_credit_amount,
        p_batch_amount,
        p_created_by,
        p_charge_category
    );

    INSERT INTO public.wallet_settlement_requests (request_key, resident_id, result)
    VALUES (p_request_key, p_resident_id, v_result);

    RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.settle_wallet_invoices_idempotent(UUID, UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.settle_wallet_invoices_idempotent(UUID, UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_wallet_payment_batch(
    p_batch_id UUID,
    p_reversed_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_batch wallet_payment_batches%ROWTYPE;
    v_item RECORD;
    v_wallet resident_wallets%ROWTYPE;
    v_total_allocated DECIMAL(12, 2) := 0;
    v_source_credit DECIMAL(12, 2) := 0;
    v_new_balance DECIMAL(12, 2);
BEGIN
    SELECT * INTO v_batch FROM wallet_payment_batches WHERE id = p_batch_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Wallet payment batch not found'; END IF;
    IF v_batch.status <> 'completed' THEN RAISE EXCEPTION 'Wallet payment batch has already been reversed'; END IF;

    SELECT * INTO v_wallet FROM resident_wallets
    WHERE resident_id = v_batch.resident_id AND charge_category = v_batch.charge_category
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Resident wallet not found'; END IF;

    FOR v_item IN SELECT * FROM wallet_payment_batch_items WHERE batch_id = p_batch_id ORDER BY created_at DESC FOR UPDATE LOOP
        UPDATE invoices
        SET amount_paid = GREATEST(0, amount_paid - v_item.amount_allocated),
            status = CASE WHEN GREATEST(0, amount_paid - v_item.amount_allocated) = 0 THEN 'unpaid'::invoice_status ELSE 'partially_paid'::invoice_status END
        WHERE id = v_item.invoice_id;
        v_total_allocated := v_total_allocated + v_item.amount_allocated;
    END LOOP;

    v_new_balance := v_wallet.balance + v_total_allocated;
    IF v_batch.source_payment_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_source_credit
        FROM wallet_transactions
        WHERE wallet_id = v_wallet.id AND type = 'credit' AND reference_type = 'payment' AND reference_id = v_batch.source_payment_id;
        v_new_balance := v_new_balance - v_source_credit;
    END IF;

    UPDATE resident_wallets SET balance = v_new_balance WHERE id = v_wallet.id;
    INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
    VALUES (v_wallet.id, 'credit', v_total_allocated, v_wallet.balance + v_total_allocated, 'batch_reversal', p_batch_id, 'Reversal of invoice allocation');
    IF v_source_credit > 0 THEN
        INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (v_wallet.id, 'debit', v_source_credit, v_new_balance, 'batch_reversal', p_batch_id, 'Reversal of source payment credit');
    END IF;
    UPDATE wallet_payment_batches SET status = 'reversed', updated_at = NOW() WHERE id = p_batch_id;

    RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'new_wallet_balance', v_new_balance, 'total_reversed', v_total_allocated);
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_invoice_with_wallet(
    p_invoice_id UUID,
    p_amount NUMERIC DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_is_service BOOLEAN := (auth.role() = 'service_role');
    v_caller_resident UUID;
    v_resident UUID;
    v_category TEXT;
    v_wallet public.resident_wallets%ROWTYPE;
    v_inv public.invoices%ROWTYPE;
    v_remaining NUMERIC;
    v_pay NUMERIC;
    v_new_paid NUMERIC;
    v_new_status public.invoice_status;
    v_new_balance NUMERIC;
BEGIN
    IF NOT v_is_service AND v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_invoice_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;

    IF p_amount IS NOT NULL THEN
        IF p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0
           OR p_amount > 1000000000 OR p_amount <> round(p_amount, 2) THEN
            RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
        END IF;
    END IF;

    -- Unlocked read only to learn whose wallet to lock first.
    SELECT resident_id, charge_category INTO v_resident, v_category FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;

    IF NOT v_is_service AND NOT public.has_permission('billing.manage_wallets') THEN
        SELECT resident_id INTO v_caller_resident
        FROM public.profiles
        WHERE id = v_uid AND approval_status = 'active';
        IF v_caller_resident IS NULL OR v_caller_resident IS DISTINCT FROM v_resident THEN
            RAISE EXCEPTION 'Not authorized to pay this invoice' USING ERRCODE = '42501';
        END IF;
    END IF;

    -- Lock order: wallet, then invoice. The wallet is the one of the invoice's charge category.
    INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
    VALUES (v_resident, v_category, 0)
    ON CONFLICT (resident_id, charge_category) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = v_resident
      AND charge_category = v_category
    FOR UPDATE;

    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_inv.resident_id IS DISTINCT FROM v_resident
       OR v_inv.charge_category IS DISTINCT FROM v_category THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;

    IF v_inv.status NOT IN ('unpaid', 'partially_paid') THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'Invoice is not payable (status: ' || v_inv.status::TEXT || ')',
            'invoice_fully_paid', v_inv.status = 'paid', 'new_wallet_balance', v_wallet.balance
        );
    END IF;

    v_remaining := v_inv.amount_due - v_inv.amount_paid;
    IF v_remaining <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'Invoice is already fully paid',
            'invoice_fully_paid', true, 'new_wallet_balance', v_wallet.balance
        );
    END IF;

    IF v_wallet.balance <= 0 THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'Insufficient wallet balance', 'new_wallet_balance', v_wallet.balance
        );
    END IF;

    IF p_amount IS NULL THEN
        v_pay := LEAST(v_wallet.balance, v_remaining);
    ELSE
        IF p_amount > v_wallet.balance THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'Insufficient wallet balance for this amount',
                'new_wallet_balance', v_wallet.balance
            );
        END IF;
        IF p_amount > v_remaining THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'Payment amount exceeds remaining due',
                'new_wallet_balance', v_wallet.balance
            );
        END IF;
        v_pay := p_amount;
    END IF;

    v_new_balance := v_wallet.balance - v_pay;
    v_new_paid := v_inv.amount_paid + v_pay;
    v_new_status := CASE WHEN v_new_paid >= v_inv.amount_due THEN 'paid' ELSE 'partially_paid' END;

    UPDATE public.resident_wallets SET balance = v_new_balance WHERE id = v_wallet.id;
    UPDATE public.invoices SET amount_paid = v_new_paid, status = v_new_status WHERE id = v_inv.id;

    INSERT INTO public.wallet_transactions (
        wallet_id, type, amount, balance_after, reference_type, reference_id, description
    ) VALUES (
        v_wallet.id, 'debit', v_pay, v_new_balance, 'invoice', v_inv.id,
        'Payment for ' || v_inv.invoice_number
    );

    RETURN jsonb_build_object(
        'success', true,
        'amount_paid', v_pay,
        'new_wallet_balance', v_new_balance,
        'old_wallet_balance', v_wallet.balance,
        'invoice_fully_paid', v_new_status = 'paid',
        'invoice_number', v_inv.invoice_number,
        'old_amount_paid', v_inv.amount_paid,
        'old_status', v_inv.status,
        'new_amount_paid', v_new_paid,
        'new_status', v_new_status
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_invoices_with_wallet(p_items JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_uid UUID := auth.uid();
    v_is_service BOOLEAN := (auth.role() = 'service_role');
    v_is_admin BOOLEAN := false;
    v_caller_resident UUID;
    v_ids UUID[];
    v_amts NUMERIC[];
    v_count INT;
    v_residents UUID[];
    v_resident UUID;
    v_categories TEXT[];
    v_category TEXT;
    v_wallet public.resident_wallets%ROWTYPE;
    v_rec RECORD;
    v_pay NUMERIC;
    v_total NUMERIC := 0;
    v_balance NUMERIC;
    v_new_paid NUMERIC;
    v_new_status public.invoice_status;
    v_paid INT := 0;
    v_applied JSONB := '[]'::JSONB;
BEGIN
    IF NOT v_is_service AND v_uid IS NULL THEN
        RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'No invoices selected');
    END IF;
    IF jsonb_array_length(p_items) > 100 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Too many invoices in one payment');
    END IF;

    BEGIN
        SELECT array_agg((t.elem ->> 'invoice_id')::UUID ORDER BY t.ord),
               array_agg((t.elem ->> 'amount')::NUMERIC ORDER BY t.ord)
        INTO v_ids, v_amts
        FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(elem, ord);
    EXCEPTION WHEN OTHERS THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid invoice items');
    END;

    v_count := COALESCE(array_length(v_ids, 1), 0);
    IF v_count = 0 OR EXISTS (SELECT 1 FROM unnest(v_ids) x WHERE x IS NULL) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid invoice items');
    END IF;
    IF (SELECT count(DISTINCT x) FROM unnest(v_ids) x) <> v_count THEN
        RETURN jsonb_build_object('success', false, 'error', 'Duplicate invoices in payment');
    END IF;
    IF EXISTS (
        SELECT 1 FROM unnest(v_amts) a
        WHERE a IS NOT NULL AND (
            a::TEXT IN ('NaN', 'Infinity', '-Infinity') OR a <= 0 OR a > 1000000000 OR a <> round(a, 2)
        )
    ) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid payment amount');
    END IF;

    -- Unlocked read only to learn whose wallet to lock first.
    SELECT array_agg(DISTINCT resident_id), array_agg(DISTINCT charge_category) INTO v_residents, v_categories
    FROM public.invoices WHERE id = ANY (v_ids);
    IF (SELECT count(*) FROM public.invoices WHERE id = ANY (v_ids)) <> v_count THEN
        RETURN jsonb_build_object('success', false, 'error', 'Some invoices were not found');
    END IF;

    IF NOT v_is_service THEN
        v_is_admin := public.has_permission('billing.manage_wallets');
    END IF;
    IF NOT v_is_service AND NOT v_is_admin THEN
        SELECT resident_id INTO v_caller_resident
        FROM public.profiles
        WHERE id = v_uid AND approval_status = 'active';
        IF v_caller_resident IS NULL
           OR array_length(v_residents, 1) <> 1
           OR v_residents[1] IS DISTINCT FROM v_caller_resident THEN
            RAISE EXCEPTION 'Not authorized to pay these invoices' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF array_length(v_residents, 1) <> 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'All invoices must belong to the same resident');
    END IF;
    v_resident := v_residents[1];

    IF array_length(v_categories, 1) <> 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'All invoices must belong to the same charge category');
    END IF;
    v_category := v_categories[1];

    -- Lock order: wallet, then invoices by id. The wallet is the one of the invoices' charge category.
    INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
    VALUES (v_resident, v_category, 0)
    ON CONFLICT (resident_id, charge_category) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = v_resident
      AND charge_category = v_category
    FOR UPDATE;

    -- Pass 1: validate everything under lock, no writes.
    FOR v_rec IN
        SELECT i.id, i.invoice_number, i.amount_due, i.amount_paid, i.status, i.resident_id, i.charge_category, it.amount AS req_amount
        FROM public.invoices i
        JOIN unnest(v_ids, v_amts) AS it(invoice_id, amount) ON it.invoice_id = i.id
        ORDER BY i.id
        FOR UPDATE OF i
    LOOP
        IF v_rec.resident_id IS DISTINCT FROM v_resident OR v_rec.charge_category IS DISTINCT FROM v_category THEN
            RETURN jsonb_build_object('success', false, 'error', 'Some invoices were not found');
        END IF;
        IF v_rec.status NOT IN ('unpaid', 'partially_paid')
           OR v_rec.amount_due - v_rec.amount_paid <= 0 THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'Invoice ' || v_rec.invoice_number || ' is not payable',
                'new_wallet_balance', v_wallet.balance
            );
        END IF;
        v_pay := COALESCE(v_rec.req_amount, v_rec.amount_due - v_rec.amount_paid);
        IF v_pay > v_rec.amount_due - v_rec.amount_paid THEN
            RETURN jsonb_build_object(
                'success', false, 'error', 'Payment amount exceeds remaining due for ' || v_rec.invoice_number,
                'new_wallet_balance', v_wallet.balance
            );
        END IF;
        v_total := v_total + v_pay;
    END LOOP;

    IF v_total > v_wallet.balance THEN
        RETURN jsonb_build_object(
            'success', false, 'error', 'Insufficient wallet balance for all selected invoices',
            'new_wallet_balance', v_wallet.balance
        );
    END IF;

    -- Pass 2: apply, tracking the running balance for each ledger row.
    v_balance := v_wallet.balance;
    FOR v_rec IN
        SELECT i.id, i.invoice_number, i.amount_due, i.amount_paid, it.amount AS req_amount
        FROM public.invoices i
        JOIN unnest(v_ids, v_amts) AS it(invoice_id, amount) ON it.invoice_id = i.id
        ORDER BY i.id
    LOOP
        v_pay := COALESCE(v_rec.req_amount, v_rec.amount_due - v_rec.amount_paid);
        v_balance := v_balance - v_pay;
        v_new_paid := v_rec.amount_paid + v_pay;
        v_new_status := CASE WHEN v_new_paid >= v_rec.amount_due THEN 'paid' ELSE 'partially_paid' END;

        UPDATE public.invoices SET amount_paid = v_new_paid, status = v_new_status WHERE id = v_rec.id;

        INSERT INTO public.wallet_transactions (
            wallet_id, type, amount, balance_after, reference_type, reference_id, description
        ) VALUES (
            v_wallet.id, 'debit', v_pay, v_balance, 'invoice', v_rec.id,
            'Bulk payment for ' || v_rec.invoice_number
        );

        v_paid := v_paid + 1;
        v_applied := v_applied || jsonb_build_object(
            'invoice_id', v_rec.id, 'amount', v_pay, 'new_status', v_new_status
        );
    END LOOP;

    UPDATE public.resident_wallets SET balance = v_balance WHERE id = v_wallet.id;

    RETURN jsonb_build_object(
        'success', true,
        'total_paid', v_total,
        'count_paid', v_paid,
        'new_wallet_balance', v_balance,
        'old_wallet_balance', v_wallet.balance,
        'invoices', v_applied
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.reverse_invoice_payment_allocation(
    p_invoice_id UUID,
    p_amount NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_resident UUID;
    v_category TEXT;
    v_wallet public.resident_wallets%ROWTYPE;
    v_inv public.invoices%ROWTYPE;
    v_new_paid NUMERIC;
    v_new_status public.invoice_status;
    v_new_balance NUMERIC;
BEGIN
    IF NOT (public.has_permission('billing.manage_wallets') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Not authorized to reverse payment allocations' USING ERRCODE = '42501';
    END IF;

    IF p_invoice_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;
    IF p_amount IS NULL OR p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0
       OR p_amount > 1000000000 OR p_amount <> round(p_amount, 2) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invalid reversal amount');
    END IF;

    SELECT resident_id, charge_category INTO v_resident, v_category FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;

    -- Lock order: wallet, then invoice. The money returns to the wallet of the invoice's charge category.
    INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
    VALUES (v_resident, v_category, 0)
    ON CONFLICT (resident_id, charge_category) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = v_resident
      AND charge_category = v_category
    FOR UPDATE;

    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_inv.resident_id IS DISTINCT FROM v_resident
       OR v_inv.charge_category IS DISTINCT FROM v_category THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;

    IF v_inv.status = 'void' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cannot reverse a payment on a void invoice');
    END IF;

    IF v_inv.amount_paid < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Cannot reverse ' || p_amount::TEXT || '. Only ' || v_inv.amount_paid::TEXT
                     || ' has been paid on this invoice.',
            'amount_paid', v_inv.amount_paid
        );
    END IF;

    v_new_paid := v_inv.amount_paid - p_amount;
    v_new_status := CASE
        WHEN v_new_paid = 0 THEN 'unpaid'
        WHEN v_new_paid >= v_inv.amount_due THEN 'paid'
        ELSE 'partially_paid'
    END;
    v_new_balance := v_wallet.balance + p_amount;

    UPDATE public.invoices SET amount_paid = v_new_paid, status = v_new_status WHERE id = v_inv.id;
    UPDATE public.resident_wallets SET balance = v_new_balance WHERE id = v_wallet.id;

    INSERT INTO public.wallet_transactions (
        wallet_id, type, amount, balance_after, reference_type, reference_id, description
    ) VALUES (
        v_wallet.id, 'credit', p_amount, v_new_balance, 'invoice_reversal', v_inv.id,
        'Payment reversal for invoice ' || v_inv.invoice_number
    );

    RETURN jsonb_build_object(
        'success', true,
        'amount_reversed', p_amount,
        'new_invoice_status', v_new_status,
        'new_amount_paid', v_new_paid,
        'old_amount_paid', v_inv.amount_paid,
        'old_status', v_inv.status,
        'invoice_number', v_inv.invoice_number,
        'new_wallet_balance', v_new_balance,
        'old_wallet_balance', v_wallet.balance,
        'wallet_id', v_wallet.id
    );
END;
$$;

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
    v_category TEXT;
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

        v_invoice_number := public.allocate_invoice_number(v_candidate.period_start);

        -- The invoice takes the charge category of its billing profile (#1189).
        SELECT bp.charge_category INTO v_category
        FROM public.billing_profiles bp
        WHERE bp.id = v_candidate.billing_profile_id;
        v_category := COALESCE(v_category, 'dues');

        INSERT INTO public.invoices (
            resident_id, house_id, billing_profile_id, billing_profile_version_id, invoice_number,
            amount_due, amount_paid, status, due_date, period_start, period_end, created_by,
            invoice_type, rate_snapshot, charge_category
        ) VALUES (
            v_candidate.resident_id, v_candidate.house_id, v_candidate.billing_profile_id,
            v_candidate.billing_profile_version_id, v_invoice_number, v_candidate.amount_due,
            0, 'unpaid', v_candidate.due_date, v_candidate.period_start, v_candidate.period_end,
            p_actor_id, v_candidate.invoice_type, v_candidate.rate_snapshot, v_category
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
              AND charge_category = v_category
            FOR UPDATE;
        END IF;

        IF v_candidate.wallet_allocation_requested AND COALESCE(v_wallet_balance, 0) > 0 THEN
            v_wallet_result := public.settle_wallet_invoices(
                v_candidate.resident_id, ARRAY[v_invoice_id], 'existing_wallet_settlement',
                current_date, NULL, v_candidate.house_id, 0, v_candidate.amount_due, p_actor_id, v_category
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

CREATE OR REPLACE FUNCTION public.get_debt_statuses(
  p_house_ids uuid[] DEFAULT NULL,
  p_resident_id uuid DEFAULT NULL
)
RETURNS TABLE (
  house_id uuid,
  resident_id uuid,
  status text,
  owed_invoice_count integer,
  wallet_balance numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      (now() AT TIME ZONE 'Africa/Lagos')::date AS today,
      coalesce(
        (SELECT (s.value #>> '{}')::integer
           FROM public.system_settings s
          WHERE s.key = 'debt_status_arrears_threshold_months'
            AND s.value #>> '{}' ~ '^[0-9]{1,3}$'),
        3
      ) AS threshold
  ),
  targets AS (
    SELECT
      h.id AS house_id,
      coalesce(p_resident_id, (
        SELECT rh.resident_id
          FROM public.resident_houses rh
         WHERE rh.house_id = h.id
           AND rh.is_active
           AND rh.resident_role IN ('tenant', 'resident_landlord', 'non_resident_landlord')
         ORDER BY array_position(
                    ARRAY['tenant', 'resident_landlord', 'non_resident_landlord']::public.resident_role[],
                    rh.resident_role),
                  rh.move_in_date DESC
         LIMIT 1
      )) AS resident_id
    FROM public.houses h
    WHERE (p_house_ids IS NULL AND h.is_active) OR h.id = ANY (p_house_ids)
  ),
  owed AS (
    SELECT i.house_id, count(*)::integer AS n
      FROM public.invoices i
      CROSS JOIN params p
     WHERE i.house_id IN (SELECT t.house_id FROM targets t)
       AND i.status IN ('unpaid', 'partially_paid')
       AND i.amount_due > i.amount_paid
       AND coalesce(i.period_start, (i.created_at AT TIME ZONE 'Africa/Lagos')::date) <= p.today
       AND (p_resident_id IS NULL OR i.resident_id = p_resident_id)
     GROUP BY i.house_id
  )
  SELECT
    t.house_id,
    t.resident_id,
    CASE
      WHEN coalesce(o.n, 0) > p.threshold THEN 'arrears'
      WHEN coalesce(o.n, 0) > 0 THEN 'outstanding'
      WHEN coalesce(w.balance, 0) > 0 THEN 'credit'
      ELSE 'paid_in_full'
    END,
    coalesce(o.n, 0),
    coalesce(w.balance, 0)
  FROM targets t
  CROSS JOIN params p
  LEFT JOIN owed o ON o.house_id = t.house_id
  LEFT JOIN (SELECT rw.resident_id, sum(rw.balance) AS balance
               FROM public.resident_wallets rw
              GROUP BY rw.resident_id) w ON w.resident_id = t.resident_id;
$$;

CREATE OR REPLACE FUNCTION public.get_resident_indebtedness(p_resident_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH linked AS (
    SELECT rh.house_id FROM public.resident_houses rh WHERE rh.resident_id = p_resident_id
    UNION
    SELECT i.house_id FROM public.invoices i WHERE i.resident_id = p_resident_id AND i.house_id IS NOT NULL
  ),
  d AS (
    -- An empty array, never NULL: NULL would mean every active house.
    SELECT * FROM public.get_debt_statuses(
      COALESCE((SELECT array_agg(house_id) FROM linked), ARRAY[]::uuid[]),
      p_resident_id
    )
  ),
  totals AS (
    SELECT COALESCE(SUM(d.owed_invoice_count), 0) AS owed FROM d
  ),
  params AS (
    SELECT coalesce(
      (SELECT (s.value #>> '{}')::integer
         FROM public.system_settings s
        WHERE s.key = 'debt_status_arrears_threshold_months'
          AND s.value #>> '{}' ~ '^[0-9]{1,3}$'),
      3
    ) AS threshold
  ),
  wallet AS (
    SELECT COALESCE((SELECT sum(w.balance) FROM public.resident_wallets w WHERE w.resident_id = p_resident_id), 0) AS balance
  )
  SELECT jsonb_build_object(
    'totalUnpaid', COALESCE(SUM(GREATEST(i.amount_due - i.amount_paid, 0)), 0),
    'invoiceCount', COUNT(*) FILTER (WHERE i.amount_due - i.amount_paid > 0),
    'unpaidCount', COUNT(*) FILTER (
      WHERE i.status = 'unpaid' AND i.amount_due - i.amount_paid > 0
    ),
    'partiallyPaidCount', COUNT(*) FILTER (
      WHERE i.status = 'partially_paid' AND i.amount_due - i.amount_paid > 0
    ),
    'debtStatus', CASE
      WHEN (SELECT owed FROM totals) > (SELECT threshold FROM params) THEN 'arrears'
      WHEN (SELECT owed FROM totals) > 0 THEN 'outstanding'
      WHEN (SELECT balance FROM wallet) > 0 THEN 'credit'
      ELSE 'paid_in_full'
    END,
    'owedInvoiceCount', (SELECT owed FROM totals),
    'walletBalance', (SELECT balance FROM wallet)
  )
  FROM public.invoices i
  WHERE i.resident_id = p_resident_id
    AND i.status <> 'void';
$$;

CREATE OR REPLACE FUNCTION public.merge_residents(
  p_kept uuid,
  p_duplicate uuid,
  p_contact_choices jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  k public.residents%ROWTYPE;
  d public.residents%ROWTYPE;
  v_choices jsonb := coalesce(p_contact_choices, '{}'::jsonb);
  v_choice record;
  v_email_src text;
  v_phone_src text;
  v_secondary_src text;
  v_plan jsonb;
  v_before jsonb;
  v_after jsonb;
  v_merge_id uuid := gen_random_uuid();
  v_ref record;
  v_n bigint;
  v_ids jsonb;
  v_rows jsonb;
  v_moved jsonb := '{}'::jsonb;
  v_moved_keys jsonb := '{}'::jsonb;
  v_folded jsonb := '{}'::jsonb;
  v_folded_rows jsonb := '{}'::jsonb;
  v_updated_rows jsonb := '{}'::jsonb;
  v_wallets jsonb := jsonb_build_object('combined', false, 'categories', '[]'::jsonb);
  v_wallet jsonb;
  v_tx_n bigint := 0;
  v_tx_ids jsonb := '[]'::jsonb;
  v_kw public.resident_wallets%ROWTYPE;
  v_dw public.resident_wallets%ROWTYPE;
  v_new_balance numeric(12, 2);
  v_kept_name text;
  v_dup_name text;
  v_left jsonb := '[]'::jsonb;
  v_key text;
BEGIN
  IF NOT public.has_permission('residents.merge') THEN
    RAISE EXCEPTION 'Not authorized to merge residents' USING ERRCODE = '42501';
  END IF;
  IF p_kept IS NULL OR p_duplicate IS NULL THEN
    RAISE EXCEPTION 'Both resident ids are required' USING ERRCODE = '22023';
  END IF;

  -- Q2 contact choices: {"email"|"phone_primary"|"phone_secondary": "kept"|"duplicate"}, and
  -- phone_secondary may also be "duplicate_phone_primary". A missing key means "kept".
  IF jsonb_typeof(v_choices) <> 'object' THEN
    RAISE EXCEPTION 'contact_choices must be a JSON object' USING ERRCODE = '22023';
  END IF;
  FOR v_choice IN SELECT c.key, c.value FROM jsonb_each(v_choices) c LOOP
    IF v_choice.key NOT IN ('email', 'phone_primary', 'phone_secondary')
       OR jsonb_typeof(v_choice.value) <> 'string'
       OR NOT ((v_choice.value #>> '{}') IN ('kept', 'duplicate')
               OR (v_choice.key = 'phone_secondary' AND (v_choice.value #>> '{}') = 'duplicate_phone_primary')) THEN
      RAISE EXCEPTION 'Invalid contact choice %: %', v_choice.key, v_choice.value USING ERRCODE = '22023';
    END IF;
  END LOOP;
  v_email_src := coalesce(v_choices->>'email', 'kept');
  v_phone_src := coalesce(v_choices->>'phone_primary', 'kept');
  v_secondary_src := coalesce(v_choices->>'phone_secondary', 'kept');

  -- Lock both residents, then both wallets, each in ascending id order.
  PERFORM 1 FROM public.residents r WHERE r.id IN (p_kept, p_duplicate) ORDER BY r.id FOR UPDATE;
  PERFORM 1 FROM public.resident_wallets w WHERE w.resident_id IN (p_kept, p_duplicate) ORDER BY w.id FOR UPDATE;

  -- The plan again, inside the locks: nothing can add a row for either record until commit.
  v_plan := public.resident_merge_plan(p_kept, p_duplicate);
  IF jsonb_array_length(v_plan->'blockers') > 0 THEN
    RAISE EXCEPTION 'Resident merge blocked: %',
      (SELECT string_agg(b->>'code', ', ') FROM jsonb_array_elements(v_plan->'blockers') b)
      USING ERRCODE = 'P0001', DETAIL = (v_plan->'blockers')::text;
  END IF;

  SELECT * INTO STRICT k FROM public.residents WHERE id = p_kept;
  SELECT * INTO STRICT d FROM public.residents WHERE id = p_duplicate;
  v_kept_name := coalesce(k.company_name, k.first_name || ' ' || k.last_name);
  v_dup_name := coalesce(d.company_name, d.first_name || ' ' || d.last_name);
  v_before := public.resident_merge_money(p_kept, p_duplicate);

  -- 1. Contact fields on the kept record (Q2). A verified-at follows its value.
  UPDATE public.residents r SET
    email = CASE WHEN v_email_src = 'duplicate' THEN d.email ELSE k.email END,
    email_verified_at = CASE
      WHEN v_email_src <> 'duplicate' THEN k.email_verified_at
      WHEN lower(d.email) = lower(k.email) THEN greatest(k.email_verified_at, d.email_verified_at)
      ELSE d.email_verified_at END,
    phone_primary = CASE WHEN v_phone_src = 'duplicate' THEN d.phone_primary ELSE k.phone_primary END,
    phone_verified_at = CASE
      WHEN v_phone_src <> 'duplicate' THEN k.phone_verified_at
      WHEN d.phone_primary = k.phone_primary THEN greatest(k.phone_verified_at, d.phone_verified_at)
      ELSE d.phone_verified_at END,
    phone_secondary = CASE v_secondary_src
      WHEN 'duplicate' THEN d.phone_secondary
      WHEN 'duplicate_phone_primary' THEN d.phone_primary
      ELSE k.phone_secondary END
  WHERE r.id = p_kept
    AND (v_email_src <> 'kept' OR v_phone_src <> 'kept' OR v_secondary_src <> 'kept');

  -- 2. House links on the same house (Q3; both active is a blocker). Keep the active link, else the
  --    kept record's. The dropped row goes into the snapshot.
  WITH dropped AS (
    DELETE FROM public.resident_houses x
     USING public.resident_houses dh, public.resident_houses kh
     WHERE dh.resident_id = p_duplicate AND kh.resident_id = p_kept AND kh.house_id = dh.house_id
       AND ((x.id = dh.id AND NOT dh.is_active) OR (x.id = kh.id AND dh.is_active AND NOT kh.is_active))
    RETURNING x.*
  )
  SELECT count(*) FILTER (WHERE resident_id = p_duplicate), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb)
    INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('resident_houses.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('resident_houses', v_rows);

  -- 3. The other unique-per-resident tables: the kept record's row wins, the duplicate's is dropped.
  WITH dropped AS (
    DELETE FROM public.resident_payment_aliases x USING public.resident_payment_aliases ka
     WHERE x.resident_id = p_duplicate AND ka.resident_id = p_kept AND ka.alias_name = x.alias_name
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('resident_payment_aliases.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('resident_payment_aliases', v_rows);

  -- A derived cache: the nightly refresh-payment-cadence cron recomputes the kept record's row.
  WITH dropped AS (
    DELETE FROM public.resident_payment_cadence_summary x WHERE x.resident_id = p_duplicate RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('resident_payment_cadence_summary.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('resident_payment_cadence_summary', v_rows);

  WITH dropped AS (
    DELETE FROM public.notification_preferences x USING public.notification_preferences kp
     WHERE x.resident_id = p_duplicate AND kp.resident_id = p_kept
       AND kp.category = x.category AND kp.channel = x.channel
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('notification_preferences.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('notification_preferences', v_rows);

  WITH dropped AS (
    DELETE FROM public.escalation_states x USING public.escalation_states ke
     WHERE x.resident_id = p_duplicate AND ke.resident_id = p_kept
       AND ke.entity_type = x.entity_type AND ke.entity_id = x.entity_id
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('escalation_states.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('escalation_states', v_rows);

  WITH dropped AS (
    DELETE FROM public.hierarchical_settings x USING public.hierarchical_settings ks
     WHERE x.resident_id = p_duplicate AND ks.resident_id = p_kept
       AND ks.setting_key = x.setting_key AND ks.level = x.level
       AND ks.house_id IS NOT DISTINCT FROM x.house_id
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('hierarchical_settings.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('hierarchical_settings', v_rows);

  -- Read receipts: the kept row keeps the earlier read time of the two.
  WITH changed AS (
    UPDATE public.announcement_read_receipts kr SET read_at = dr.read_at
      FROM public.announcement_read_receipts dr, public.announcement_read_receipts prev
     WHERE kr.resident_id = p_kept AND dr.resident_id = p_duplicate AND dr.announcement_id = kr.announcement_id
       AND prev.id = kr.id AND dr.read_at < coalesce(kr.read_at, 'infinity'::timestamptz)
    RETURNING to_jsonb(prev) AS old_row)
  SELECT coalesce(jsonb_agg(old_row), '[]'::jsonb) INTO v_rows FROM changed;
  v_updated_rows := v_updated_rows || jsonb_build_object('announcement_read_receipts', v_rows);
  WITH dropped AS (
    DELETE FROM public.announcement_read_receipts x USING public.announcement_read_receipts kr
     WHERE x.resident_id = p_duplicate AND kr.resident_id = p_kept AND kr.announcement_id = x.announcement_id
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('announcement_read_receipts.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('announcement_read_receipts', v_rows);

  WITH dropped AS (
    DELETE FROM public.report_subscriptions x
     WHERE x.resident_id = p_duplicate
       AND EXISTS (SELECT 1 FROM public.report_subscriptions ks WHERE ks.resident_id = p_kept)
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('report_subscriptions.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('report_subscriptions', v_rows);

  -- Q7: two opt-ins for one phone. The latest decision wins and is written onto the kept row.
  WITH pairs AS (
    SELECT ko.id AS kept_id, to_jsonb(ko) AS old_row, do2.*
      FROM public.whatsapp_optins ko
      JOIN public.whatsapp_optins do2 ON do2.resident_id = p_duplicate AND do2.phone_number = ko.phone_number
     WHERE ko.resident_id = p_kept
  ), changed AS (
    UPDATE public.whatsapp_optins ko SET
      opted_in = CASE WHEN p.dup_wins THEN p.opted_in ELSE ko.opted_in END,
      opted_in_at = CASE WHEN p.dup_wins THEN p.opted_in_at ELSE ko.opted_in_at END,
      opted_out_at = CASE WHEN p.dup_wins THEN p.opted_out_at ELSE ko.opted_out_at END,
      source = CASE WHEN p.dup_wins THEN p.source ELSE ko.source END,
      link_verified_at = greatest(ko.link_verified_at, p.link_verified_at),
      deactivated_at = CASE WHEN ko.deactivated_at IS NULL OR p.deactivated_at IS NULL THEN NULL
                            ELSE greatest(ko.deactivated_at, p.deactivated_at) END,
      updated_at = now()
      FROM (SELECT pairs.*,
                   coalesce(pairs.opted_in_at, pairs.opted_out_at) IS NOT NULL
                   AND coalesce(pairs.opted_in_at, pairs.opted_out_at)
                       > coalesce((pairs.old_row->>'opted_in_at')::timestamptz,
                                  (pairs.old_row->>'opted_out_at')::timestamptz,
                                  '-infinity'::timestamptz) AS dup_wins
              FROM pairs) p
     WHERE ko.id = p.kept_id
    RETURNING p.old_row)
  SELECT coalesce(jsonb_agg(old_row), '[]'::jsonb) INTO v_rows FROM changed;
  v_updated_rows := v_updated_rows || jsonb_build_object('whatsapp_optins', v_rows);
  WITH dropped AS (
    DELETE FROM public.whatsapp_optins x USING public.whatsapp_optins ko
     WHERE x.resident_id = p_duplicate AND ko.resident_id = p_kept AND ko.phone_number = x.phone_number
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('whatsapp_optins.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('whatsapp_optins', v_rows);

  -- Survey opt-out on either record means opted out: the kept row stays.
  WITH dropped AS (
    DELETE FROM public.whatsapp_survey_opt_outs x
     WHERE x.resident_id = p_duplicate
       AND EXISTS (SELECT 1 FROM public.whatsapp_survey_opt_outs ks WHERE ks.resident_id = p_kept)
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('whatsapp_survey_opt_outs.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('whatsapp_survey_opt_outs', v_rows);

  WITH dropped AS (
    DELETE FROM public.recipient_group_members x USING public.recipient_group_members km
     WHERE x.resident_id = p_duplicate AND km.resident_id = p_kept AND km.group_id = x.group_id
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('recipient_group_members.resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('recipient_group_members', v_rows);

  WITH dropped AS (
    DELETE FROM public.clearance_certificate_copies x USING public.clearance_certificate_copies kc
     WHERE x.recipient_resident_id = p_duplicate AND kc.recipient_resident_id = p_kept
       AND kc.document_id = x.document_id
    RETURNING x.*)
  SELECT count(*), coalesce(jsonb_agg(to_jsonb(dropped)), '[]'::jsonb) INTO v_n, v_rows FROM dropped;
  v_folded := v_folded || jsonb_build_object('clearance_certificate_copies.recipient_resident_id', v_n);
  v_folded_rows := v_folded_rows || jsonb_build_object('clearance_certificate_copies', v_rows);

  -- 4. Before the moves. Q5: codes and PIN sessions proven on the duplicate do not carry over.
  WITH changed AS (
    UPDATE public.verification_tokens t SET expires_at = now()
      FROM public.verification_tokens prev
     WHERE t.resident_id = p_duplicate AND t.used_at IS NULL AND t.expires_at > now() AND prev.id = t.id
    RETURNING jsonb_build_object('id', t.id, 'expires_at', prev.expires_at) AS old_row)
  SELECT coalesce(jsonb_agg(old_row), '[]'::jsonb) INTO v_rows FROM changed;
  v_updated_rows := v_updated_rows || jsonb_build_object('verification_tokens', v_rows);

  WITH changed AS (
    UPDATE public.whatsapp_link_tokens t SET expires_at = now()
      FROM public.whatsapp_link_tokens prev
     WHERE t.resident_id = p_duplicate AND t.used_at IS NULL AND t.expires_at > now() AND prev.id = t.id
    RETURNING jsonb_build_object('id', t.id, 'purpose', t.purpose, 'expires_at', prev.expires_at) AS old_row)
  SELECT coalesce(jsonb_agg(old_row), '[]'::jsonb) INTO v_rows FROM changed;
  v_updated_rows := v_updated_rows || jsonb_build_object('whatsapp_link_tokens', v_rows);

  WITH changed AS (
    UPDATE public.whatsapp_sessions s SET pin_authenticated = false, pending_pin_hash = NULL
      FROM public.whatsapp_sessions prev
     WHERE s.resident_id = p_duplicate AND prev.id = s.id
       AND (s.pin_authenticated OR s.pending_pin_hash IS NOT NULL)
    RETURNING jsonb_build_object('id', s.id, 'pin_authenticated', prev.pin_authenticated,
                                 'had_pending_pin', prev.pending_pin_hash IS NOT NULL) AS old_row)
  SELECT coalesce(jsonb_agg(old_row), '[]'::jsonb) INTO v_rows FROM changed;
  v_updated_rows := v_updated_rows || jsonb_build_object('whatsapp_sessions', v_rows);

  -- The kept record cannot name itself as its emergency contact (residents_emergency_contact_check).
  -- The cleared pointer is counted as dropped, so moved plus dropped still equals the plan.
  UPDATE public.residents r SET emergency_contact_resident_id = NULL
   WHERE r.id = p_kept AND r.emergency_contact_resident_id = p_duplicate;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  v_folded := v_folded || jsonb_build_object('residents.emergency_contact_resident_id', v_n);
  IF v_n > 0 THEN
    v_updated_rows := v_updated_rows || jsonb_build_object('residents.emergency_contact_resident_id',
      jsonb_build_array(jsonb_build_object('id', p_kept, 'emergency_contact_resident_id', p_duplicate)));
  END IF;

  -- 5. Wallets (Q6), one charge category at a time (#1189): the duplicate's wallet of each category
  -- goes into the kept record's wallet of the same category. Row ids and old balance_after values
  -- go into the snapshot.
  FOR v_dw IN SELECT * FROM public.resident_wallets w WHERE w.resident_id = p_duplicate ORDER BY w.charge_category LOOP
    CONTINUE WHEN v_dw.balance = 0 AND NOT EXISTS (SELECT 1 FROM public.wallet_transactions t WHERE t.wallet_id = v_dw.id);

    SELECT * INTO v_kw FROM public.resident_wallets w
     WHERE w.resident_id = p_kept AND w.charge_category = v_dw.charge_category;
    v_wallet := jsonb_build_object(
      'charge_category', v_dw.charge_category,
      'kept_before', CASE WHEN v_kw.id IS NULL THEN NULL ELSE to_jsonb(v_kw) END,
      'duplicate_before', to_jsonb(v_dw),
      'kept_wallet_created', v_kw.id IS NULL);

    IF v_kw.id IS NULL THEN
      INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
      VALUES (p_kept, v_dw.charge_category, 0) RETURNING * INTO v_kw;
    END IF;

    WITH moved AS (
      UPDATE public.wallet_transactions t SET wallet_id = v_kw.id WHERE t.wallet_id = v_dw.id RETURNING t.id)
    SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_n, v_ids FROM moved;
    v_tx_n := v_tx_n + v_n;
    v_tx_ids := v_tx_ids || v_ids;

    v_new_balance := v_kw.balance + v_dw.balance;
    UPDATE public.resident_wallets w SET balance = v_new_balance WHERE w.id = v_kw.id;
    UPDATE public.resident_wallets w SET balance = 0 WHERE w.id = v_dw.id;

    -- Zero-amount explanation rows: they change no total.
    INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
    VALUES
      (v_kw.id, 'credit', 0, v_new_balance, 'resident_merge', v_merge_id,
       'Merged in ' || v_dup_name || ' (' || d.resident_code || '): ₦' || to_char(v_dw.balance, 'FM999,999,999,990.00')),
      (v_dw.id, 'credit', 0, 0, 'resident_merge', v_merge_id,
       'Moved to ' || v_kept_name || ' (' || k.resident_code || '): ₦' || to_char(v_dw.balance, 'FM999,999,999,990.00'));

    -- Running balance in time order, ending at the wallet balance.
    WITH ordered AS (
      SELECT t.id, t.balance_after AS old_after,
             v_new_balance
               - sum(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END) OVER ()
               + sum(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END)
                   OVER (ORDER BY t.created_at, t.id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS new_after
        FROM public.wallet_transactions t
       WHERE t.wallet_id = v_kw.id
    ), changed AS (
      UPDATE public.wallet_transactions t SET balance_after = o.new_after
        FROM ordered o
       WHERE t.id = o.id AND t.balance_after IS DISTINCT FROM o.new_after
      RETURNING t.id, o.old_after)
    SELECT coalesce(jsonb_object_agg(id, old_after), '{}'::jsonb) INTO v_rows FROM changed;

    v_wallets := jsonb_build_object(
      'combined', true,
      'categories', (v_wallets->'categories') || jsonb_build_array(v_wallet || jsonb_build_object(
        'kept_wallet_id', v_kw.id, 'duplicate_wallet_id', v_dw.id,
        'kept_balance_after', v_new_balance, 'old_balance_after', v_rows)));
  END LOOP;
  v_moved := v_moved || jsonb_build_object('wallet_transactions.wallet_id', v_tx_n);
  v_moved_keys := v_moved_keys || jsonb_build_object('wallet_transactions.wallet_id', v_tx_ids);

  -- 6. Re-point every referencing column, in order.
  FOR v_ref IN
    SELECT r.table_name, r.column_name, r.key_column FROM public.resident_merge_references() r
     WHERE r.handling IN ('move', 'fold') ORDER BY r.ordinal
  LOOP
    EXECUTE format(
      'WITH moved AS (UPDATE public.%I SET %I = $1 WHERE %I = $2 RETURNING %I::text AS moved_key) '
      'SELECT count(*), coalesce(jsonb_agg(moved_key ORDER BY moved_key), ''[]''::jsonb) FROM moved',
      v_ref.table_name, v_ref.column_name, v_ref.column_name, v_ref.key_column)
      INTO v_n, v_ids USING p_kept, p_duplicate;
    v_moved := v_moved || jsonb_build_object(v_ref.table_name || '.' || v_ref.column_name, v_n);
    v_moved_keys := v_moved_keys || jsonb_build_object(v_ref.table_name || '.' || v_ref.column_name, v_ids);
  END LOOP;

  -- References without a foreign key.
  WITH moved AS (
    UPDATE public.entity_notes n SET entity_id = p_kept
     WHERE n.entity_type = 'resident' AND n.entity_id = p_duplicate RETURNING n.id)
  SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_n, v_ids FROM moved;
  v_moved := v_moved || jsonb_build_object('entity_notes.entity_id', v_n);
  v_moved_keys := v_moved_keys || jsonb_build_object('entity_notes.entity_id', v_ids);

  WITH moved AS (
    UPDATE public.approval_requests a SET entity_id = p_kept
     WHERE a.entity_type IN ('resident', 'residents') AND a.entity_id = p_duplicate RETURNING a.id)
  SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_n, v_ids FROM moved;
  v_moved := v_moved || jsonb_build_object('approval_requests.entity_id', v_n);
  v_moved_keys := v_moved_keys || jsonb_build_object('approval_requests.entity_id', v_ids);

  WITH moved AS (
    UPDATE public.in_app_notifications n SET entity_id = p_kept
     WHERE n.entity_type IN ('resident', 'residents') AND n.entity_id = p_duplicate RETURNING n.id)
  SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_n, v_ids FROM moved;
  v_moved := v_moved || jsonb_build_object('in_app_notifications.entity_id', v_n);
  v_moved_keys := v_moved_keys || jsonb_build_object('in_app_notifications.entity_id', v_ids);

  WITH moved AS (
    UPDATE public.escalation_states e SET entity_id = p_kept
     WHERE e.entity_type IN ('resident', 'residents') AND e.entity_id = p_duplicate RETURNING e.id)
  SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_n, v_ids FROM moved;
  v_moved := v_moved || jsonb_build_object('escalation_states.entity_id', v_n);
  v_moved_keys := v_moved_keys || jsonb_build_object('escalation_states.entity_id', v_ids);

  -- 7. The login moved with profiles.resident_id above (Q4: only one record has one).
  IF k.profile_id IS NULL AND d.profile_id IS NOT NULL THEN
    UPDATE public.residents r SET profile_id = d.profile_id WHERE r.id = p_kept;
  END IF;

  -- 8. Archive the duplicate. Q5: its PIN and lock state are cleared, never copied.
  UPDATE public.residents r SET
    account_status = 'archived',
    merged_into_resident_id = p_kept,
    profile_id = NULL,
    whatsapp_pin_hash = NULL,
    whatsapp_pin_set_at = NULL,
    whatsapp_pin_failed_attempts = 0,
    whatsapp_pin_locked_until = NULL,
    whatsapp_pin_failed_at = '{}',
    whatsapp_pin_hard_locked_at = NULL
  WHERE r.id = p_duplicate;

  -- 9. Invariants. Any failure raises and rolls the whole merge back.
  v_after := public.resident_merge_money(p_kept, p_duplicate);

  IF (v_after->>'kept_wallet_balance')::numeric + (v_after->>'duplicate_wallet_balance')::numeric
       <> (v_before->>'kept_wallet_balance')::numeric + (v_before->>'duplicate_wallet_balance')::numeric
     OR (v_after->>'duplicate_wallet_balance')::numeric <> 0 THEN
    RAISE EXCEPTION 'Resident merge invariant failed: wallet balances (before %, after %)', v_before, v_after;
  END IF;
  IF (v_after->>'wallet_ledger_total')::numeric <> (v_before->>'wallet_ledger_total')::numeric THEN
    RAISE EXCEPTION 'Resident merge invariant failed: wallet ledger total (before %, after %)', v_before, v_after;
  END IF;
  IF (v_after->>'kept_closing_balance')::numeric
       <> (v_before->>'kept_closing_balance')::numeric + (v_before->>'duplicate_closing_balance')::numeric
     OR (v_after->>'duplicate_closing_balance')::numeric <> 0
     OR (v_after->>'kept_awaiting_verification')::numeric
       <> (v_before->>'kept_awaiting_verification')::numeric + (v_before->>'duplicate_awaiting_verification')::numeric
     OR (v_after->>'duplicate_awaiting_verification')::numeric <> 0 THEN
    RAISE EXCEPTION 'Resident merge invariant failed: account balance (before %, after %)', v_before, v_after;
  END IF;
  IF (v_after->>'payment_count')::numeric <> (v_before->>'payment_count')::numeric
     OR (v_after->>'payment_amount')::numeric <> (v_before->>'payment_amount')::numeric
     OR (v_after->>'duplicate_payment_count')::numeric <> 0
     OR (v_after->>'invoice_count')::numeric <> (v_before->>'invoice_count')::numeric
     OR (v_after->>'invoice_amount_due')::numeric <> (v_before->>'invoice_amount_due')::numeric
     OR (v_after->>'duplicate_invoice_count')::numeric <> 0 THEN
    RAISE EXCEPTION 'Resident merge invariant failed: payments or invoices (before %, after %)', v_before, v_after;
  END IF;

  -- Rows moved plus rows dropped equal what the plan counted on the duplicate, column by column.
  FOR v_key IN SELECT jsonb_object_keys(v_plan->'counts') LOOP
    IF coalesce((v_moved->>v_key)::bigint, 0) + coalesce((v_folded->>v_key)::bigint, 0)
         <> (v_plan->'counts'->>v_key)::bigint THEN
      RAISE EXCEPTION 'Resident merge invariant failed: % counted %, moved %, dropped %', v_key,
        v_plan->'counts'->>v_key, coalesce(v_moved->>v_key, '0'), coalesce(v_folded->>v_key, '0');
    END IF;
  END LOOP;

  -- Nothing left on the duplicate in any foreign key to residents, read from the catalogue so a
  -- table added after this function cannot be skipped. The duplicate's own emptied wallet and the
  -- merge history are the only rows that keep pointing at it.
  FOR v_ref IN
    SELECT c.conrelid::regclass::text AS table_name, a.attname::text AS column_name
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.residents'::regclass
       AND NOT EXISTS (
         SELECT 1 FROM public.resident_merge_references() r
          WHERE r.handling = 'keep'
            AND pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(r.table_name)) = c.conrelid
            AND r.column_name = a.attname)
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', v_ref.table_name, v_ref.column_name)
      INTO v_n USING p_duplicate;
    IF v_n > 0 THEN
      v_left := v_left || jsonb_build_array(v_ref.table_name || '.' || v_ref.column_name);
    END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.entity_notes n WHERE n.entity_type = 'resident' AND n.entity_id = p_duplicate)
     OR EXISTS (SELECT 1 FROM public.approval_requests a WHERE a.entity_type IN ('resident', 'residents') AND a.entity_id = p_duplicate)
     OR EXISTS (SELECT 1 FROM public.in_app_notifications n WHERE n.entity_type IN ('resident', 'residents') AND n.entity_id = p_duplicate)
     OR EXISTS (SELECT 1 FROM public.escalation_states e WHERE e.entity_type IN ('resident', 'residents') AND e.entity_id = p_duplicate) THEN
    v_left := v_left || jsonb_build_array('polymorphic entity_id');
  END IF;
  IF EXISTS (SELECT 1 FROM public.wallet_transactions t JOIN public.resident_wallets w ON w.id = t.wallet_id
              WHERE w.resident_id = p_duplicate AND NOT (t.reference_type = 'resident_merge' AND t.amount = 0)) THEN
    v_left := v_left || jsonb_build_array('wallet_transactions.wallet_id');
  END IF;
  IF jsonb_array_length(v_left) > 0 THEN
    RAISE EXCEPTION 'Resident merge invariant failed: rows still reference the duplicate in %', v_left;
  END IF;

  -- 10. The record of the merge.
  INSERT INTO public.resident_merges (id, kept_resident_id, merged_resident_id, merged_by, snapshot, counts)
  VALUES (
    v_merge_id, p_kept, p_duplicate, auth.uid(),
    jsonb_build_object(
      'version', 1,
      'contact_choices', v_choices,
      'kept_before', to_jsonb(k) - 'whatsapp_pin_hash',
      'duplicate_before', to_jsonb(d) - 'whatsapp_pin_hash',
      'moved', v_moved_keys,
      'folded', v_folded_rows,
      'updated', v_updated_rows,
      'wallets', v_wallets),
    jsonb_build_object(
      'references', v_plan->'counts',
      'moved', v_moved,
      'folded', v_folded,
      'replaced_kept_rows', v_plan->'replaced_kept_rows'));

  RETURN jsonb_build_object(
    'merge_id', v_merge_id,
    'kept_resident_id', p_kept,
    'merged_resident_id', p_duplicate,
    'moved', v_moved,
    'folded', v_folded,
    'replaced_kept_rows', v_plan->'replaced_kept_rows',
    'contact', jsonb_build_object('email', v_email_src, 'phone_primary', v_phone_src, 'phone_secondary', v_secondary_src),
    'wallet', jsonb_build_object(
      'combined', v_wallets->'combined',
      'kept_balance_before', v_before->'kept_wallet_balance',
      'duplicate_balance_before', v_before->'duplicate_wallet_balance',
      'kept_balance_after', v_after->'kept_wallet_balance'),
    'account_balance', jsonb_build_object(
      'kept_closing_before', v_before->'kept_closing_balance',
      'duplicate_closing_before', v_before->'duplicate_closing_balance',
      'kept_closing_after', v_after->'kept_closing_balance'),
    'whatsapp_pin_cleared', d.whatsapp_pin_hash IS NOT NULL,
    'kept_has_whatsapp_pin', k.whatsapp_pin_hash IS NOT NULL);
END;
$$;

COMMIT;
