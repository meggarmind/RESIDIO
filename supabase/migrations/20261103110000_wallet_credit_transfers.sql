-- Issue #1191 (slice 3 of #1188): admin "Transfer credit" between wallets.
--
-- Owner decision 6 (26 Oct 2026): credit can move between the wallets of one person, and between
-- persons linked to the same house. Admin only, audited, reversible. This migration adds:
--   1. The permission billing.transfer_wallet_credit, granted to super_admin and chairman.
--   2. transfer_wallet_credit(p_from_wallet, p_to_resident, p_to_category, p_amount, p_reason): in one
--      transaction, a debit row on the source wallet and a credit row on the target wallet. The
--      target wallet is created here when it does not exist, so a refused transfer leaves no wallet. Both rows have
--      reference_type 'wallet_transfer' and reference_id set to the other row, so each one points to
--      its pair. The id of the debit row is the transfer id. Refused: a zero, negative or non-finite
--      amount, an amount above the source balance, an empty reason, the same wallet twice, and two
--      persons with no shared active resident_houses link.
--   3. reverse_wallet_transfer(p_transfer_id, p_reason): moves the amount back, as a debit row on
--      the target wallet and a credit row on the source wallet, both with reference_type
--      'wallet_transfer_reversal' and reference_id = the transfer id. Refused when the target wallet
--      no longer holds the amount, or when the transfer is already reversed (also enforced by a
--      unique index, so two concurrent reversals cannot both commit).
-- Settlement of the target wallet after a transfer (#1191 item 4) runs in the server action through
-- the existing settle_wallet_invoices, not here.
--
-- ROLLBACK (wallet rows written by transfers stay; they are ordinary credit and debit rows):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.reverse_wallet_transfer(UUID, TEXT);
-- DROP FUNCTION IF EXISTS public.transfer_wallet_credit(UUID, UUID, TEXT, DECIMAL, TEXT);
-- DROP INDEX IF EXISTS public.wallet_transactions_transfer_reversal_key;
-- DELETE FROM public.role_permissions WHERE permission_id IN
--   (SELECT id FROM public.app_permissions WHERE name = 'billing.transfer_wallet_credit');
-- DELETE FROM public.app_permissions WHERE name = 'billing.transfer_wallet_credit';
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT r.name FROM public.role_permissions rp JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name = 'billing.transfer_wallet_credit' ORDER BY 1;               -- chairman, super_admin
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef FROM pg_proc p
--    WHERE p.proname IN ('transfer_wallet_credit', 'reverse_wallet_transfer') ORDER BY 1;
--     -- reverse_wallet_transfer(p_transfer_id uuid, p_reason text) t
--     -- transfer_wallet_credit(p_from_wallet uuid, p_to_resident uuid, p_to_category text, p_amount numeric, p_reason text) t
--   SELECT has_function_privilege('anon', 'public.transfer_wallet_credit(uuid, uuid, text, numeric, text)', 'EXECUTE');  -- false
--   SELECT has_function_privilege('anon', 'public.reverse_wallet_transfer(uuid, text)', 'EXECUTE');                 -- false
--   SELECT indexname FROM pg_indexes WHERE indexname = 'wallet_transactions_transfer_reversal_key';                 -- one row

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
    'billing.transfer_wallet_credit',
    'Transfer Wallet Credit',
    'Move credit between the wallets of one resident, or to another resident linked to the same house, and reverse a transfer',
    'billing',
    true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman')
  AND p.name = 'billing.transfer_wallet_credit'
ON CONFLICT DO NOTHING;

-- One reversal per transfer: one debit and one credit row reference it.
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_transfer_reversal_key
    ON public.wallet_transactions (reference_id, type)
    WHERE reference_type = 'wallet_transfer_reversal';

CREATE OR REPLACE FUNCTION public.transfer_wallet_credit(
    p_from_wallet UUID,
    p_to_resident UUID,
    p_to_category TEXT,
    p_amount DECIMAL(12, 2),
    p_reason TEXT
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_from public.resident_wallets%ROWTYPE;
    v_to public.resident_wallets%ROWTYPE;
    v_to_id UUID;
    v_reason TEXT := btrim(p_reason);
    v_from_balance DECIMAL(12, 2);
    v_to_balance DECIMAL(12, 2);
    v_debit_id UUID := gen_random_uuid();
    v_credit_id UUID := gen_random_uuid();
    v_from_label TEXT;
    v_to_label TEXT;
BEGIN
    IF NOT (public.has_permission('billing.transfer_wallet_credit') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Not authorized to transfer wallet credit';
    END IF;

    IF p_amount IS NULL OR p_amount::TEXT IN ('NaN', 'Infinity', '-Infinity') OR p_amount <= 0 THEN
        RAISE EXCEPTION 'Transfer amount must be finite and greater than zero';
    END IF;
    IF v_reason IS NULL OR v_reason = '' THEN
        RAISE EXCEPTION 'A reason is required for a wallet transfer';
    END IF;
    IF p_from_wallet IS NULL OR p_to_resident IS NULL OR p_to_category IS NULL THEN
        RAISE EXCEPTION 'Choose two different wallets';
    END IF;

    -- Any refusal below rolls this insert back with the rest of the transfer.
    INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
    VALUES (p_to_resident, p_to_category, 0)
    ON CONFLICT (resident_id, charge_category) DO NOTHING;
    SELECT id INTO v_to_id FROM public.resident_wallets
    WHERE resident_id = p_to_resident AND charge_category = p_to_category;
    IF v_to_id = p_from_wallet THEN
        RAISE EXCEPTION 'Choose two different wallets';
    END IF;

    -- Lock both wallets in id order, so two opposite transfers cannot deadlock.
    PERFORM 1 FROM public.resident_wallets WHERE id IN (p_from_wallet, v_to_id) ORDER BY id FOR UPDATE;
    SELECT * INTO v_from FROM public.resident_wallets WHERE id = p_from_wallet;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Source wallet not found';
    END IF;
    SELECT * INTO v_to FROM public.resident_wallets WHERE id = v_to_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Target wallet not found';
    END IF;

    IF v_from.resident_id <> v_to.resident_id AND NOT EXISTS (
        SELECT 1
        FROM public.resident_houses a
        JOIN public.resident_houses b ON b.house_id = a.house_id
        WHERE a.resident_id = v_from.resident_id AND a.is_active
          AND b.resident_id = v_to.resident_id AND b.is_active
    ) THEN
        RAISE EXCEPTION 'Credit can only be transferred to a resident linked to the same house';
    END IF;

    IF v_from.balance < p_amount THEN
        RAISE EXCEPTION 'Transfer amount is more than the source wallet balance';
    END IF;

    SELECT c.name || ' wallet of ' || r.first_name || ' ' || r.last_name INTO v_from_label
    FROM public.charge_categories c, public.residents r
    WHERE c.code = v_from.charge_category AND r.id = v_from.resident_id;
    SELECT c.name || ' wallet of ' || r.first_name || ' ' || r.last_name INTO v_to_label
    FROM public.charge_categories c, public.residents r
    WHERE c.code = v_to.charge_category AND r.id = v_to.resident_id;

    v_from_balance := v_from.balance - p_amount;
    v_to_balance := v_to.balance + p_amount;
    UPDATE public.resident_wallets SET balance = v_from_balance WHERE id = v_from.id;
    UPDATE public.resident_wallets SET balance = v_to_balance WHERE id = v_to.id;

    INSERT INTO public.wallet_transactions (id, wallet_id, type, amount, balance_after, reference_type, reference_id, description)
    VALUES
        (v_debit_id, v_from.id, 'debit', p_amount, v_from_balance, 'wallet_transfer', v_credit_id,
         'Transfer to ' || v_to_label || ': ' || v_reason),
        (v_credit_id, v_to.id, 'credit', p_amount, v_to_balance, 'wallet_transfer', v_debit_id,
         'Transfer from ' || v_from_label || ': ' || v_reason);

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', v_debit_id,
        'credit_transaction_id', v_credit_id,
        'amount', p_amount,
        'from_wallet_id', v_from.id,
        'from_resident_id', v_from.resident_id,
        'from_charge_category', v_from.charge_category,
        'from_balance', v_from_balance,
        'to_wallet_id', v_to.id,
        'to_resident_id', v_to.resident_id,
        'to_charge_category', v_to.charge_category,
        'to_balance', v_to_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_wallet_credit(UUID, UUID, TEXT, DECIMAL, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_wallet_credit(UUID, UUID, TEXT, DECIMAL, TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reverse_wallet_transfer(
    p_transfer_id UUID,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_debit public.wallet_transactions%ROWTYPE;
    v_credit public.wallet_transactions%ROWTYPE;
    v_from public.resident_wallets%ROWTYPE;
    v_to public.resident_wallets%ROWTYPE;
    v_from_balance DECIMAL(12, 2);
    v_to_balance DECIMAL(12, 2);
    v_note TEXT := 'Reversal of transfer' || COALESCE(': ' || NULLIF(btrim(p_reason), ''), '');
BEGIN
    IF NOT (public.has_permission('billing.transfer_wallet_credit') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Not authorized to transfer wallet credit';
    END IF;

    SELECT * INTO v_debit FROM public.wallet_transactions
    WHERE id = p_transfer_id AND type = 'debit' AND reference_type = 'wallet_transfer';
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;
    SELECT * INTO v_credit FROM public.wallet_transactions
    WHERE id = v_debit.reference_id AND type = 'credit' AND reference_type = 'wallet_transfer'
      AND reference_id = v_debit.id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Transfer not found';
    END IF;

    PERFORM 1 FROM public.resident_wallets WHERE id IN (v_debit.wallet_id, v_credit.wallet_id) ORDER BY id FOR UPDATE;
    SELECT * INTO STRICT v_from FROM public.resident_wallets WHERE id = v_debit.wallet_id;
    SELECT * INTO STRICT v_to FROM public.resident_wallets WHERE id = v_credit.wallet_id;

    IF EXISTS (SELECT 1 FROM public.wallet_transactions
               WHERE reference_type = 'wallet_transfer_reversal' AND reference_id = p_transfer_id) THEN
        RAISE EXCEPTION 'Transfer already reversed';
    END IF;
    IF v_to.balance < v_credit.amount THEN
        RAISE EXCEPTION 'The receiving wallet no longer holds the transferred amount';
    END IF;

    v_to_balance := v_to.balance - v_credit.amount;
    v_from_balance := v_from.balance + v_credit.amount;
    UPDATE public.resident_wallets SET balance = v_to_balance WHERE id = v_to.id;
    UPDATE public.resident_wallets SET balance = v_from_balance WHERE id = v_from.id;

    INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, reference_type, reference_id, description)
    VALUES
        (v_to.id, 'debit', v_credit.amount, v_to_balance, 'wallet_transfer_reversal', p_transfer_id, v_note),
        (v_from.id, 'credit', v_credit.amount, v_from_balance, 'wallet_transfer_reversal', p_transfer_id, v_note);

    RETURN jsonb_build_object(
        'success', true,
        'transfer_id', p_transfer_id,
        'amount', v_credit.amount,
        'transfer_description', v_debit.description,
        'from_wallet_id', v_from.id,
        'from_resident_id', v_from.resident_id,
        'from_balance', v_from_balance,
        'to_wallet_id', v_to.id,
        'to_resident_id', v_to.resident_id,
        'to_balance', v_to_balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reverse_wallet_transfer(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_wallet_transfer(UUID, TEXT) TO authenticated, service_role;

COMMIT;
