-- Preserve the invoice state observed at allocation time so receipts remain
-- accurate even after a later payment or reversal changes the invoice.

BEGIN;

ALTER TABLE public.wallet_payment_batch_items
    ADD COLUMN IF NOT EXISTS invoice_number_at_allocation TEXT,
    ADD COLUMN IF NOT EXISTS invoice_amount_due_at_allocation DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS amount_paid_before DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS amount_paid_after DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS balance_after DECIMAL(12, 2),
    ADD COLUMN IF NOT EXISTS status_after TEXT;

ALTER TABLE public.wallet_payment_batch_items
    DROP CONSTRAINT IF EXISTS wallet_payment_batch_items_status_after_check;

ALTER TABLE public.wallet_payment_batch_items
    ADD CONSTRAINT wallet_payment_batch_items_status_after_check
    CHECK (status_after IS NULL OR status_after IN ('paid', 'partially_paid'));

CREATE OR REPLACE FUNCTION public.settle_wallet_invoices(
    p_resident_id UUID,
    p_invoice_ids UUID[],
    p_batch_type TEXT,
    p_payment_date DATE,
    p_source_payment_id UUID DEFAULT NULL,
    p_house_id UUID DEFAULT NULL,
    p_credit_amount DECIMAL(12, 2) DEFAULT 0,
    p_batch_amount DECIMAL(12, 2) DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
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
    FOR UPDATE;

    IF NOT FOUND THEN
        INSERT INTO public.resident_wallets (resident_id, balance)
        VALUES (p_resident_id, 0)
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
        period_start, period_end, created_by
    ) VALUES (
        p_resident_id, p_house_id, p_source_payment_id, p_batch_type,
        v_receipt_number, COALESCE(p_batch_amount, v_total_allocated), p_payment_date,
        v_min_period, v_max_period, p_created_by
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
        'allocations', v_allocations,
        'period_start', v_min_period,
        'period_end', v_max_period
    );
END;
$$;

REVOKE ALL ON FUNCTION public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID) TO authenticated, service_role;

COMMIT;
