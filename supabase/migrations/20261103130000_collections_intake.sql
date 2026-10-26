-- Collections intake (#1195, slice 7 of #1188): collection money from the bank import and from mixed
-- payments, and moving a payment between billing and collections.
--
-- WHAT CHANGES
--   bank_statement_rows.collection_parts         JSONB array, NULL when the line has no collection part.
--                                                 Each element: collection_id, payer_id, house_id, quantity,
--                                                 unit_price, amount. Written by the import review when the
--                                                 admin marks the line "Collection"; read when the import is
--                                                 posted, which creates one collection_payments row per part,
--                                                 linked to the line by bank_row_id.
--   bank_statement_rows.matched_charge_category  the charge category of the billing part of a split line
--                                                 (matched_resident_id gets the rest of the amount). NULL
--                                                 means Dues.
--   collection_payments.split_payment_group_id   the payment_records.split_payment_group_id of the billing
--                                                 part, when one payment was split between billing and
--                                                 collections on the payment form.
--   move_payment_to_collection(...)              in one transaction: reverses the payment's settlement
--                                                 (or its plain wallet credit), records the same money as a
--                                                 collection payment and deletes the payment record.
--                                                 Refused when the credit has already been spent.
--   move_collection_payment_to_billing(...)      in one transaction: reverses the collection payment, records
--                                                 a payment for the resident and credits the wallet of the
--                                                 category, settling the given invoices.
--   Both functions: service_role only. The server actions check collections.manage and payments.delete
--   (to collections) or payments.create (to billing) first, and write the audit entries.
--
-- WHO IS AFFECTED: nobody gains or loses access. New columns are NULL for every existing row.
--
-- DEPENDS ON 20261103090100_create_collections_ledger.sql, 20261103100000_charge_category_wallets.sql and
-- 20261103110000_payment_purpose_and_payer.sql.
--
-- VERIFY (read-only, after applying):
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_schema = 'public' AND ((table_name = 'bank_statement_rows'
--      AND column_name IN ('collection_parts', 'matched_charge_category'))
--      OR (table_name = 'collection_payments' AND column_name = 'split_payment_group_id'));
--     -- 3 rows: jsonb, text, uuid
--   SELECT count(*) FROM public.bank_statement_rows WHERE collection_parts IS NOT NULL;      -- 0
--   SELECT p.proname, has_function_privilege('authenticated', p.oid, 'EXECUTE')
--     FROM pg_proc p WHERE p.proname IN ('move_payment_to_collection', 'move_collection_payment_to_billing');
--     -- 2 rows, both false
--
-- ROLLBACK (roll the application code back first; only while no line or payment uses the new columns:
--   SELECT count(*) FROM public.bank_statement_rows WHERE collection_parts IS NOT NULL OR matched_charge_category IS NOT NULL;  -- 0
--   SELECT count(*) FROM public.collection_payments WHERE split_payment_group_id IS NOT NULL;  -- 0):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.move_collection_payment_to_billing(UUID, UUID, UUID, TEXT, UUID[], TEXT, UUID);
-- DROP FUNCTION IF EXISTS public.move_payment_to_collection(UUID, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, UUID);
-- ALTER TABLE public.collection_payments DROP COLUMN split_payment_group_id;
-- ALTER TABLE public.bank_statement_rows DROP COLUMN matched_charge_category;
-- ALTER TABLE public.bank_statement_rows DROP COLUMN collection_parts;
-- COMMIT;

BEGIN;

ALTER TABLE public.bank_statement_rows
    ADD COLUMN IF NOT EXISTS collection_parts jsonb
        CONSTRAINT bank_statement_rows_collection_parts_array
        CHECK (collection_parts IS NULL OR (jsonb_typeof(collection_parts) = 'array' AND jsonb_array_length(collection_parts) > 0));
ALTER TABLE public.bank_statement_rows
    ADD COLUMN IF NOT EXISTS matched_charge_category text
        REFERENCES public.charge_categories (code) ON UPDATE CASCADE;

COMMENT ON COLUMN public.bank_statement_rows.collection_parts IS
'Collection parts of this line (#1195): [{collection_id, payer_id, house_id, quantity, unit_price, amount}]. Posting the import creates one collection payment per part.';
COMMENT ON COLUMN public.bank_statement_rows.matched_charge_category IS
'Charge category of the billing part of the line (#1195); NULL means dues.';

ALTER TABLE public.collection_payments ADD COLUMN IF NOT EXISTS split_payment_group_id uuid;
CREATE INDEX IF NOT EXISTS idx_collection_payments_split_group
    ON public.collection_payments (split_payment_group_id) WHERE split_payment_group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_payments_bank_row
    ON public.collection_payments (bank_row_id) WHERE bank_row_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.move_payment_to_collection(
    p_payment_id UUID,
    p_collection_id UUID,
    p_payer_id UUID,
    p_house_id UUID,
    p_quantity INTEGER,
    p_unit_price NUMERIC,
    p_reason TEXT,
    p_actor UUID
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_payment public.payment_records%ROWTYPE;
    v_batch RECORD;
    v_wallet public.resident_wallets%ROWTYPE;
    v_allocated NUMERIC(12, 2);
    v_source_credit NUMERIC(12, 2);
    v_outstanding NUMERIC(12, 2);
    v_had_batch BOOLEAN := false;
    v_collection_payment public.collection_payments%ROWTYPE;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Not authorized to move payments';
    END IF;
    IF length(btrim(coalesce(p_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Enter the reason for the move';
    END IF;

    SELECT * INTO v_payment FROM public.payment_records WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;
    IF v_payment.status <> 'paid' THEN
        RAISE EXCEPTION 'Only a paid payment can move to a collection';
    END IF;

    -- Undo what the payment paid and the credit it added, like deleting a payment (#993).
    FOR v_batch IN
        SELECT * FROM public.wallet_payment_batches WHERE source_payment_id = p_payment_id ORDER BY created_at FOR UPDATE
    LOOP
        v_had_batch := true;
        CONTINUE WHEN v_batch.status <> 'completed';

        SELECT * INTO v_wallet FROM public.resident_wallets
        WHERE resident_id = v_batch.resident_id AND charge_category = v_batch.charge_category
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'The resident wallet could not be found';
        END IF;
        SELECT COALESCE(SUM(amount_allocated), 0) INTO v_allocated
        FROM public.wallet_payment_batch_items WHERE batch_id = v_batch.id;
        SELECT COALESCE(SUM(amount), 0) INTO v_source_credit
        FROM public.wallet_transactions
        WHERE wallet_id = v_wallet.id AND type = 'credit' AND reference_type = 'payment' AND reference_id = p_payment_id;
        -- reverse_wallet_payment_batch has no balance floor.
        IF v_wallet.balance + v_allocated - v_source_credit < 0 THEN
            RAISE EXCEPTION 'The credit from this payment has already been spent, so it cannot move';
        END IF;

        PERFORM public.reverse_wallet_payment_batch(v_batch.id, p_actor);
    END LOOP;

    IF NOT v_had_batch AND v_payment.resident_id IS NOT NULL THEN
        SELECT COALESCE(SUM(CASE
                   WHEN reference_type = 'payment' AND type = 'credit' THEN amount
                   WHEN reference_type = 'payment_deletion' AND type = 'debit' THEN -amount
                   ELSE 0 END), 0)
          INTO v_outstanding
        FROM public.wallet_transactions
        WHERE reference_id = p_payment_id AND reference_type IN ('payment', 'payment_deletion');
        IF v_outstanding > 0 THEN
            -- Raises 'Insufficient wallet balance' when the credit has been spent.
            PERFORM public.adjust_wallet_debit(
                v_payment.resident_id, v_outstanding, 'payment_deletion', p_payment_id,
                'Payment moved to a collection', v_payment.charge_category
            );
        END IF;
    END IF;

    -- The trigger sets the amount of an item purchase from quantity x unit price and the receipt number.
    INSERT INTO public.collection_payments (
        collection_id, payer_id, house_id, quantity, unit_price, amount, payment_date, method, reference,
        bank_row_id, notes, recorded_by
    ) VALUES (
        p_collection_id, p_payer_id, p_house_id, p_quantity, p_unit_price, v_payment.amount, v_payment.payment_date,
        v_payment.method, v_payment.reference_number, v_payment.bank_row_id,
        format('Moved from a billing payment: %s', btrim(p_reason)), p_actor
    )
    RETURNING * INTO v_collection_payment;

    IF v_collection_payment.amount <> v_payment.amount THEN
        RAISE EXCEPTION 'The collection amount (%) is not the payment amount (%)', v_collection_payment.amount, v_payment.amount;
    END IF;

    UPDATE public.bank_statement_rows SET payment_id = NULL WHERE payment_id = p_payment_id;
    UPDATE public.email_transactions SET payment_id = NULL WHERE payment_id = p_payment_id;
    DELETE FROM public.payment_records WHERE id = p_payment_id;

    RETURN jsonb_build_object(
        'success', true,
        'collection_payment_id', v_collection_payment.id,
        'receipt_number', v_collection_payment.receipt_number,
        'payment', to_jsonb(v_payment)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.move_payment_to_collection(UUID, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_payment_to_collection(UUID, UUID, UUID, UUID, INTEGER, NUMERIC, TEXT, UUID) TO service_role;

CREATE OR REPLACE FUNCTION public.move_collection_payment_to_billing(
    p_collection_payment_id UUID,
    p_resident_id UUID,
    p_house_id UUID,
    p_charge_category TEXT,
    p_invoice_ids UUID[],
    p_reason TEXT,
    p_actor UUID
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_collection_payment public.collection_payments%ROWTYPE;
    v_payer public.collection_payers%ROWTYPE;
    v_payment_id UUID;
BEGIN
    IF auth.role() IS DISTINCT FROM 'service_role' THEN
        RAISE EXCEPTION 'Not authorized to move payments';
    END IF;
    IF length(btrim(coalesce(p_reason, ''))) = 0 THEN
        RAISE EXCEPTION 'Enter the reason for the move';
    END IF;
    IF p_resident_id IS NULL THEN
        RAISE EXCEPTION 'Choose the resident whose wallet the payment credits';
    END IF;

    SELECT * INTO v_collection_payment FROM public.collection_payments WHERE id = p_collection_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Collection payment not found';
    END IF;
    IF v_collection_payment.reversed_at IS NOT NULL THEN
        RAISE EXCEPTION 'This collection payment was reversed';
    END IF;
    SELECT * INTO v_payer FROM public.collection_payers WHERE id = v_collection_payment.payer_id;

    UPDATE public.collection_payments
    SET reversed_at = now(), reversed_by = p_actor, reversal_reason = format('Moved to billing: %s', btrim(p_reason))
    WHERE id = p_collection_payment_id;

    INSERT INTO public.payment_records (
        resident_id, house_id, amount, payment_date, status, method, reference_number, notes, bank_row_id,
        is_verified, verified_at, charge_category, paid_by_resident_id, paid_by_name
    ) VALUES (
        p_resident_id, p_house_id, v_collection_payment.amount, v_collection_payment.payment_date, 'paid',
        v_collection_payment.method, v_collection_payment.reference,
        format('Moved from collection receipt %s: %s', v_collection_payment.receipt_number, btrim(p_reason)),
        v_collection_payment.bank_row_id,
        v_collection_payment.bank_row_id IS NOT NULL,
        CASE WHEN v_collection_payment.bank_row_id IS NOT NULL THEN now() END,
        p_charge_category, v_payer.resident_id, CASE WHEN v_payer.resident_id IS NULL THEN v_payer.full_name END
    )
    RETURNING id INTO v_payment_id;

    IF cardinality(p_invoice_ids) > 0 THEN
        PERFORM public.settle_wallet_invoices(
            p_resident_id => p_resident_id,
            p_invoice_ids => p_invoice_ids,
            p_batch_type => 'payment_received',
            p_payment_date => v_collection_payment.payment_date,
            p_source_payment_id => v_payment_id,
            p_house_id => p_house_id,
            p_credit_amount => v_collection_payment.amount,
            p_batch_amount => v_collection_payment.amount,
            p_created_by => p_actor,
            p_charge_category => p_charge_category
        );
    ELSE
        PERFORM public.adjust_wallet_credit(
            p_resident_id, v_collection_payment.amount, 'payment', v_payment_id,
            'Payment retained as wallet credit because no eligible invoice was found', p_charge_category
        );
    END IF;

    UPDATE public.bank_statement_rows SET payment_id = v_payment_id
    WHERE id = v_collection_payment.bank_row_id AND payment_id IS NULL;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_payment_id,
        'amount', v_collection_payment.amount,
        'receipt_number', v_collection_payment.receipt_number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.move_collection_payment_to_billing(UUID, UUID, UUID, TEXT, UUID[], TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_collection_payment_to_billing(UUID, UUID, UUID, TEXT, UUID[], TEXT, UUID) TO service_role;

COMMIT;
