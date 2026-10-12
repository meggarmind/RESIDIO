-- Migration: atomic wallet payment RPCs (issue #458)
--
-- Replaces three client-side read-modify-write flows (pay-invoice-with-wallet,
-- pay-multiple-invoices-with-wallet, reverse-payment-allocation) with single-transaction RPCs.
-- The wallet row is locked FIRST, then invoice rows in id order, so concurrent callers cannot
-- deadlock or overdraw. Every ledger row carries the correct running balance_after.
--
-- Authorization is inside each function (SECURITY DEFINER bypasses RLS):
--   pay_invoice_with_wallet / pay_invoices_with_wallet:
--       service_role, OR billing.manage_wallets, OR the active resident who owns the invoice(s)
--       (profiles.resident_id = invoices.resident_id, as the TS action did).
--   reverse_invoice_payment_allocation: service_role OR billing.manage_wallets.
--
-- Payable statuses: unpaid, partially_paid, overdue (void and paid are rejected).
-- NOTE: invoices has no currency column, so there is no currency check.
--
-- ROLLBACK (the functions are new; revert the TS callers first, then):
--   DROP FUNCTION IF EXISTS public.pay_invoice_with_wallet(uuid, numeric);
--   DROP FUNCTION IF EXISTS public.pay_invoices_with_wallet(jsonb);
--   DROP FUNCTION IF EXISTS public.reverse_invoice_payment_allocation(uuid, numeric);

BEGIN;

-- ---------------------------------------------------------------------------
-- pay_invoice_with_wallet(p_invoice_id, p_amount DEFAULT NULL)
-- p_amount NULL = pay min(wallet balance, remaining due).
-- ---------------------------------------------------------------------------
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
    SELECT resident_id INTO v_resident FROM public.invoices WHERE id = p_invoice_id;
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

    -- Lock order: wallet, then invoice.
    INSERT INTO public.resident_wallets (resident_id, balance)
    VALUES (v_resident, 0)
    ON CONFLICT (resident_id) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = v_resident
    FOR UPDATE;

    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_inv.resident_id IS DISTINCT FROM v_resident THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;

    IF v_inv.status NOT IN ('unpaid', 'partially_paid', 'overdue') THEN
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

-- ---------------------------------------------------------------------------
-- pay_invoices_with_wallet(p_items)  -- all-or-nothing
-- p_items: [{"invoice_id": uuid, "amount": numeric (optional; omitted = full remaining)}]
-- All invoices must belong to one resident. Any invalid item rejects the whole call
-- before any write.
-- ---------------------------------------------------------------------------
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
    SELECT array_agg(DISTINCT resident_id) INTO v_residents
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

    -- Lock order: wallet, then invoices by id.
    INSERT INTO public.resident_wallets (resident_id, balance)
    VALUES (v_resident, 0)
    ON CONFLICT (resident_id) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = v_resident
    FOR UPDATE;

    -- Pass 1: validate everything under lock, no writes.
    FOR v_rec IN
        SELECT i.id, i.invoice_number, i.amount_due, i.amount_paid, i.status, i.resident_id, it.amount AS req_amount
        FROM public.invoices i
        JOIN unnest(v_ids, v_amts) AS it(invoice_id, amount) ON it.invoice_id = i.id
        ORDER BY i.id
        FOR UPDATE OF i
    LOOP
        IF v_rec.resident_id IS DISTINCT FROM v_resident THEN
            RETURN jsonb_build_object('success', false, 'error', 'Some invoices were not found');
        END IF;
        IF v_rec.status NOT IN ('unpaid', 'partially_paid', 'overdue')
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

-- ---------------------------------------------------------------------------
-- reverse_invoice_payment_allocation(p_invoice_id, p_amount)
-- Admin only: lowers invoice amount_paid, recomputes status, credits the wallet and writes
-- the 'invoice_reversal' ledger row, all in one transaction.
-- ---------------------------------------------------------------------------
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

    SELECT resident_id INTO v_resident FROM public.invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
    END IF;

    -- Lock order: wallet, then invoice.
    INSERT INTO public.resident_wallets (resident_id, balance)
    VALUES (v_resident, 0)
    ON CONFLICT (resident_id) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = v_resident
    FOR UPDATE;

    SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
    IF NOT FOUND OR v_inv.resident_id IS DISTINCT FROM v_resident THEN
        RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
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

REVOKE ALL ON FUNCTION public.pay_invoice_with_wallet(UUID, NUMERIC) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.pay_invoices_with_wallet(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reverse_invoice_payment_allocation(UUID, NUMERIC) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_invoice_with_wallet(UUID, NUMERIC) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_invoices_with_wallet(JSONB) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverse_invoice_payment_allocation(UUID, NUMERIC) TO authenticated, service_role;

COMMIT;
