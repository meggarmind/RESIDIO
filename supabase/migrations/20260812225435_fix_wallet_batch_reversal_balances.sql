-- Keep wallet ledger balance_after values correct when reversing a multi-invoice batch.
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
