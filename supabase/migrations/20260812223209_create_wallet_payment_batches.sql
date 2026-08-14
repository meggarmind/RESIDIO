-- Auditable wallet-funded payment batches and invoice allocations.
-- This migration is intentionally additive; historical payments continue to use
-- payment_records.period_start/period_end when no batch exists.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS public.wallet_receipt_number_seq;

CREATE TABLE IF NOT EXISTS public.wallet_payment_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
    house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL,
    source_payment_id UUID UNIQUE REFERENCES public.payment_records(id) ON DELETE SET NULL,
    batch_type TEXT NOT NULL CHECK (batch_type IN ('payment_received', 'existing_wallet_settlement', 'future_prepayment')),
    receipt_number TEXT NOT NULL UNIQUE,
    amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
    payment_date DATE NOT NULL,
    period_start DATE,
    period_end DATE,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'reversed')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CHECK ((period_start IS NULL AND period_end IS NULL) OR (period_start IS NOT NULL AND period_end IS NOT NULL AND period_end >= period_start))
);

CREATE TABLE IF NOT EXISTS public.wallet_payment_batch_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES public.wallet_payment_batches(id) ON DELETE CASCADE,
    invoice_id UUID NOT NULL REFERENCES public.invoices(id) ON DELETE RESTRICT,
    wallet_transaction_id UUID REFERENCES public.wallet_transactions(id) ON DELETE RESTRICT,
    amount_allocated DECIMAL(12, 2) NOT NULL CHECK (amount_allocated > 0),
    invoice_period_start DATE NOT NULL,
    invoice_period_end DATE NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (batch_id, invoice_id),
    CHECK (invoice_period_end >= invoice_period_start)
);

CREATE INDEX IF NOT EXISTS idx_wallet_payment_batches_resident ON public.wallet_payment_batches(resident_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_payment_batches_source_payment ON public.wallet_payment_batches(source_payment_id);
CREATE INDEX IF NOT EXISTS idx_wallet_payment_batches_status ON public.wallet_payment_batches(status);
CREATE INDEX IF NOT EXISTS idx_wallet_payment_batch_items_batch ON public.wallet_payment_batch_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_wallet_payment_batch_items_invoice ON public.wallet_payment_batch_items(invoice_id);

ALTER TABLE public.wallet_payment_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_payment_batch_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches;
CREATE POLICY "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches
    FOR ALL
    USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'chairman', 'financial_secretary')))
    WITH CHECK (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'chairman', 'financial_secretary')));

DROP POLICY IF EXISTS "Residents can view own wallet payment batches" ON public.wallet_payment_batches;
CREATE POLICY "Residents can view own wallet payment batches" ON public.wallet_payment_batches
    FOR SELECT
    USING (resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid()));

DROP POLICY IF EXISTS "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items;
CREATE POLICY "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items
    FOR ALL
    USING (batch_id IN (SELECT id FROM public.wallet_payment_batches WHERE auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'chairman', 'financial_secretary'))))
    WITH CHECK (batch_id IN (SELECT id FROM public.wallet_payment_batches WHERE auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin', 'chairman', 'financial_secretary'))));

DROP POLICY IF EXISTS "Residents can view own wallet payment batch items" ON public.wallet_payment_batch_items;
CREATE POLICY "Residents can view own wallet payment batch items" ON public.wallet_payment_batch_items
    FOR SELECT
    USING (batch_id IN (SELECT id FROM public.wallet_payment_batches WHERE resident_id IN (SELECT id FROM public.residents WHERE profile_id = auth.uid())));

DROP TRIGGER IF EXISTS wallet_payment_batches_updated_at ON public.wallet_payment_batches;
CREATE TRIGGER wallet_payment_batches_updated_at
    BEFORE UPDATE ON public.wallet_payment_batches
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.next_wallet_receipt_number()
RETURNS TEXT
LANGUAGE SQL
VOLATILE
SET search_path = public
AS $$
    SELECT 'RCP-' || to_char(CURRENT_DATE, 'YYYYMMDD') || '-' || lpad(nextval('public.wallet_receipt_number_seq')::text, 5, '0');
$$;

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

        v_wallet_balance := v_wallet_balance - v_allocation;
        UPDATE public.invoices
        SET amount_paid = amount_paid + v_allocation,
            status = CASE WHEN amount_paid + v_allocation >= amount_due THEN 'paid'::invoice_status ELSE 'partially_paid'::invoice_status END
        WHERE id = v_invoice.id;

        UPDATE public.resident_wallets SET balance = v_wallet_balance WHERE id = v_wallet.id;
        INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (v_wallet.id, 'debit', v_allocation, v_wallet_balance, 'invoice', v_invoice.id, 'Wallet allocation for ' || v_invoice.invoice_number)
        RETURNING id INTO v_wallet_tx_id;

        v_total_allocated := v_total_allocated + v_allocation;
        v_min_period := CASE WHEN v_min_period IS NULL OR v_invoice.period_start < v_min_period THEN v_invoice.period_start ELSE v_min_period END;
        v_max_period := CASE WHEN v_max_period IS NULL OR v_invoice.period_end > v_max_period THEN v_invoice.period_end ELSE v_max_period END;
        v_allocations := v_allocations || jsonb_build_array(jsonb_build_object(
            'invoice_id', v_invoice.id,
            'invoice_number', v_invoice.invoice_number,
            'amount_allocated', v_allocation,
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
        p_resident_id, p_house_id, p_source_payment_id, p_batch_type, v_receipt_number,
        COALESCE(p_batch_amount, v_total_allocated), p_payment_date, v_min_period, v_max_period, p_created_by
    ) RETURNING id INTO v_batch_id;

    INSERT INTO public.wallet_payment_batch_items (
        batch_id, invoice_id, wallet_transaction_id, amount_allocated, invoice_period_start, invoice_period_end
    )
    SELECT v_batch_id,
           (allocation->>'invoice_id')::UUID,
           (allocation->>'wallet_transaction_id')::UUID,
           (allocation->>'amount_allocated')::DECIMAL(12,2),
           (allocation->>'period_start')::DATE,
           (allocation->>'period_end')::DATE
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

    SELECT * INTO v_wallet FROM resident_wallets WHERE resident_id = v_batch.resident_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Resident wallet not found'; END IF;

    FOR v_item IN SELECT * FROM wallet_payment_batch_items WHERE batch_id = p_batch_id ORDER BY created_at DESC FOR UPDATE LOOP
        UPDATE invoices
        SET amount_paid = GREATEST(0, amount_paid - v_item.amount_allocated),
            status = CASE
                WHEN GREATEST(0, amount_paid - v_item.amount_allocated) = 0 THEN 'unpaid'::invoice_status
                ELSE 'partially_paid'::invoice_status
            END
        WHERE id = v_item.invoice_id;
        v_total_allocated := v_total_allocated + v_item.amount_allocated;
        INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (v_wallet.id, 'credit', v_item.amount_allocated, v_wallet.balance + v_item.amount_allocated, 'batch_reversal', p_batch_id, 'Reversal of invoice allocation');
    END LOOP;

    IF v_batch.source_payment_id IS NOT NULL THEN
        SELECT COALESCE(SUM(amount), 0) INTO v_source_credit
        FROM wallet_transactions
        WHERE wallet_id = v_wallet.id AND type = 'credit' AND reference_type = 'payment' AND reference_id = v_batch.source_payment_id;
        INSERT INTO wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
        VALUES (v_wallet.id, 'debit', v_source_credit, v_wallet.balance + v_total_allocated - v_source_credit, 'batch_reversal', p_batch_id, 'Reversal of source payment credit');
    END IF;

    v_new_balance := v_wallet.balance + v_total_allocated - v_source_credit;
    UPDATE resident_wallets SET balance = v_new_balance WHERE id = v_wallet.id;
    UPDATE wallet_payment_batches SET status = 'reversed', updated_at = NOW() WHERE id = p_batch_id;

    RETURN jsonb_build_object('success', true, 'batch_id', p_batch_id, 'new_wallet_balance', v_new_balance, 'total_reversed', v_total_allocated);
END;
$$;

REVOKE ALL ON FUNCTION public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.settle_wallet_invoices(UUID, UUID[], TEXT, DATE, UUID, UUID, DECIMAL, DECIMAL, UUID) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.reverse_wallet_payment_batch(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reverse_wallet_payment_batch(UUID, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.next_wallet_receipt_number() TO authenticated, service_role;

COMMIT;
