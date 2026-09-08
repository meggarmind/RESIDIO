BEGIN;

CREATE OR REPLACE FUNCTION public.adjust_wallet_credit(
    p_resident_id UUID,
    p_amount DECIMAL(12, 2),
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL
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

    INSERT INTO public.resident_wallets (resident_id, balance)
    VALUES (p_resident_id, 0)
    ON CONFLICT (resident_id) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = p_resident_id
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

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'wallet_id', v_wallet.id);
END;
$$;

CREATE OR REPLACE FUNCTION public.adjust_wallet_debit(
    p_resident_id UUID,
    p_amount DECIMAL(12, 2),
    p_reference_type TEXT DEFAULT NULL,
    p_reference_id UUID DEFAULT NULL,
    p_description TEXT DEFAULT NULL
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

    INSERT INTO public.resident_wallets (resident_id, balance)
    VALUES (p_resident_id, 0)
    ON CONFLICT (resident_id) DO NOTHING;

    SELECT * INTO STRICT v_wallet
    FROM public.resident_wallets
    WHERE resident_id = p_resident_id
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

    RETURN jsonb_build_object('success', true, 'new_balance', v_new_balance, 'wallet_id', v_wallet.id);
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_wallet_credit(UUID, DECIMAL, TEXT, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_wallet_debit(UUID, DECIMAL, TEXT, UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_wallet_credit(UUID, DECIMAL, TEXT, UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.adjust_wallet_debit(UUID, DECIMAL, TEXT, UUID, TEXT) TO authenticated, service_role;

COMMIT;
