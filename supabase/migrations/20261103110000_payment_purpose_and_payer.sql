-- Issue #1190 (slice 2 of #1188): each payment records what it is for and who paid it.
--
--   1. payment_records.charge_category (NOT NULL, default 'dues', FK to charge_categories): the
--      wallet the payment credits. Every existing payment becomes 'dues' (owner decision 2: a
--      payment with no purpose pays dues only).
--   2. payment_records.paid_by_resident_id (nullable FK to residents) and paid_by_name (nullable
--      text): who paid, separate from resident_id (whose wallet is credited).
--   3. resident_merge_references() lists paid_by_resident_id with handling 'move', so a merge
--      re-points it onto the kept resident.
--   4. retag_payment_charge_category(p_payment_id, p_charge_category): moves a payment's credit from
--      the wallet of its old category to the wallet of the new one and changes the payment's
--      category, in one transaction. Refused when the payment's settlement batch already paid an
--      invoice (reverse it first) or the old wallet no longer holds the amount. Needs
--      billing.manage_wallets.
--
-- ROLLBACK (only while every payment is still Dues; check first:
--   SELECT count(*) FROM public.payment_records WHERE charge_category <> 'dues';  -- must be 0):
-- BEGIN;
-- DROP FUNCTION IF EXISTS public.retag_payment_charge_category(UUID, TEXT);
-- -- re-run resident_merge_references() from 20261103090200_collections_resident_merge_reference.sql
-- ALTER TABLE public.payment_records DROP COLUMN paid_by_name;
-- ALTER TABLE public.payment_records DROP COLUMN paid_by_resident_id;
-- ALTER TABLE public.payment_records DROP COLUMN charge_category;
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT charge_category, count(*) FROM public.payment_records GROUP BY 1;
--     -- one row: dues, the same count as before (Stage, 26 Oct 2026: 2278 payments)
--   SELECT column_name, is_nullable, column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'payment_records'
--      AND column_name IN ('charge_category', 'paid_by_resident_id', 'paid_by_name');
--     -- charge_category NO 'dues'::text; paid_by_resident_id YES; paid_by_name YES
--   SELECT count(*) FROM public.resident_merge_references() WHERE column_name = 'paid_by_resident_id';  -- 1
--   SELECT pg_get_function_identity_arguments(p.oid) FROM pg_proc p
--    WHERE p.proname = 'retag_payment_charge_category';  -- p_payment_id uuid, p_charge_category text

BEGIN;

ALTER TABLE public.payment_records
    ADD COLUMN IF NOT EXISTS charge_category text NOT NULL DEFAULT 'dues'
        REFERENCES public.charge_categories (code) ON UPDATE CASCADE;
ALTER TABLE public.payment_records
    ADD COLUMN IF NOT EXISTS paid_by_resident_id uuid
        REFERENCES public.residents (id) ON DELETE SET NULL;
ALTER TABLE public.payment_records
    ADD COLUMN IF NOT EXISTS paid_by_name text
        CHECK (paid_by_name IS NULL OR length(btrim(paid_by_name)) BETWEEN 1 AND 200);

CREATE INDEX IF NOT EXISTS idx_payment_records_paid_by_resident_id
    ON public.payment_records (paid_by_resident_id) WHERE paid_by_resident_id IS NOT NULL;

COMMENT ON COLUMN public.payment_records.charge_category IS
'What the payment is for (#1190); the payment credits the resident''s wallet of this category. Dues when not given.';
COMMENT ON COLUMN public.payment_records.paid_by_resident_id IS
'The resident who paid (#1190), when known and different from or the same as resident_id (whose wallet is credited).';
COMMENT ON COLUMN public.payment_records.paid_by_name IS
'Who paid, as named on the payment (#1190), for example the bank sender. Free text; may name a non-resident.';

CREATE OR REPLACE FUNCTION public.resident_merge_references()
RETURNS TABLE (ordinal integer, table_name text, column_name text, key_column text, handling text)
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  VALUES
    (1,  'resident_houses',                  'resident_id',                   'id',          'fold'),
    (2,  'resident_houses',                  'sponsor_resident_id',           'id',          'move'),
    (3,  'residents',                        'emergency_contact_resident_id', 'id',          'move'),
    (4,  'residents',                        'merged_into_resident_id',       'id',          'move'),
    (5,  'profiles',                         'resident_id',                   'id',          'move'),
    (6,  'invoices',                         'resident_id',                   'id',          'move'),
    (7,  'payment_records',                  'resident_id',                   'id',          'move'),
    (8,  'paystack_transactions',            'resident_id',                   'id',          'move'),
    (9,  'wallet_payment_batches',           'resident_id',                   'id',          'move'),
    (10, 'wallet_settlement_requests',       'resident_id',                   'request_key', 'move'),
    (11, 'late_fee_waivers',                 'resident_id',                   'id',          'move'),
    (12, 'house_levy_history',               'resident_id',                   'id',          'move'),
    (13, 'invoice_generation_candidates',    'resident_id',                   'id',          'move'),
    (14, 'bank_statement_rows',              'matched_resident_id',           'id',          'move'),
    (15, 'email_transactions',               'matched_resident_id',           'id',          'move'),
    (16, 'expenses',                         'resident_id',                   'id',          'move'),
    (17, 'resident_payment_aliases',         'resident_id',                   'id',          'fold'),
    (18, 'resident_payment_cadence_summary', 'resident_id',                   'resident_id', 'fold'),
    (19, 'house_ownership_history',          'resident_id',                   'id',          'move'),
    (20, 'security_contacts',                'resident_id',                   'id',          'move'),
    (21, 'access_logs',                      'resident_id',                   'id',          'move'),
    (22, 'documents',                        'resident_id',                   'id',          'move'),
    (23, 'email_logs',                       'resident_id',                   'id',          'move'),
    (24, 'notification_queue',               'recipient_id',                  'id',          'move'),
    (25, 'notification_history',             'recipient_id',                  'id',          'move'),
    (26, 'notification_preferences',         'resident_id',                   'id',          'fold'),
    (27, 'escalation_states',                'resident_id',                   'id',          'fold'),
    (28, 'hierarchical_settings',            'resident_id',                   'id',          'fold'),
    (29, 'announcement_read_receipts',       'resident_id',                   'id',          'fold'),
    (30, 'report_subscriptions',             'resident_id',                   'id',          'fold'),
    (31, 'verification_tokens',              'resident_id',                   'id',          'move'),
    (32, 'approval_requests',                'affected_resident_id',          'id',          'move'),
    (33, 'approval_requests',                'requested_by_resident_id',      'id',          'move'),
    (34, 'impersonation_sessions',           'impersonated_resident_id',      'id',          'move'),
    (35, 'whatsapp_optins',                  'resident_id',                   'id',          'fold'),
    (36, 'whatsapp_sessions',                'resident_id',                   'id',          'move'),
    (37, 'whatsapp_link_tokens',             'resident_id',                   'id',          'move'),
    (38, 'whatsapp_pending_contacts',        'resident_id',                   'id',          'move'),
    (39, 'whatsapp_disclosure_logs',         'resident_id',                   'id',          'move'),
    (40, 'whatsapp_consent_decisions',       'resident_id',                   'id',          'move'),
    (41, 'whatsapp_outbound_sends',          'resident_id',                   'id',          'move'),
    (42, 'whatsapp_statement_requests',      'resident_id',                   'id',          'move'),
    (43, 'whatsapp_survey_responses',        'resident_id',                   'id',          'move'),
    (44, 'whatsapp_survey_opt_outs',         'resident_id',                   'resident_id', 'fold'),
    (45, 'recipient_group_members',          'resident_id',                   'id',          'fold'),
    (46, 'clearance_certificate_copies',     'recipient_resident_id',         'id',          'fold'),
    (47, 'resident_wallets',                 'resident_id',                   'id',          'keep'),
    (48, 'resident_merges',                  'kept_resident_id',              'id',          'keep'),
    (49, 'resident_merges',                  'merged_resident_id',            'id',          'keep'),
    (50, 'collection_payers',                'resident_id',                   'id',          'keep'),
    (51, 'payment_records',                  'paid_by_resident_id',           'id',          'move')
$$;

REVOKE ALL ON FUNCTION public.resident_merge_references() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.retag_payment_charge_category(
    p_payment_id UUID,
    p_charge_category TEXT
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $$
DECLARE
    v_payment public.payment_records%ROWTYPE;
    v_old_wallet public.resident_wallets%ROWTYPE;
    v_new_wallet public.resident_wallets%ROWTYPE;
BEGIN
    IF NOT (public.has_permission('billing.manage_wallets') OR auth.role() = 'service_role') THEN
        RAISE EXCEPTION 'Not authorized to re-tag payments';
    END IF;

    IF p_charge_category IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.charge_categories WHERE code = p_charge_category AND is_active
    ) THEN
        RAISE EXCEPTION 'Unknown charge category %', p_charge_category;
    END IF;

    SELECT * INTO v_payment FROM public.payment_records WHERE id = p_payment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Payment not found';
    END IF;
    IF v_payment.charge_category = p_charge_category THEN
        RAISE EXCEPTION 'Payment is already %', p_charge_category;
    END IF;
    IF v_payment.amount IS NULL OR v_payment.amount <= 0 THEN
        RAISE EXCEPTION 'Payment amount must be greater than zero';
    END IF;

    -- Money already spent on invoices of the old category cannot move without reversing it first.
    IF EXISTS (
        SELECT 1
        FROM public.wallet_payment_batches b
        JOIN public.wallet_payment_batch_items i ON i.batch_id = b.id
        WHERE b.source_payment_id = p_payment_id AND b.status = 'completed'
    ) THEN
        RAISE EXCEPTION 'This payment has already paid invoices. Reverse its settlement before changing its category';
    END IF;

    INSERT INTO public.resident_wallets (resident_id, charge_category, balance)
    VALUES (v_payment.resident_id, v_payment.charge_category, 0), (v_payment.resident_id, p_charge_category, 0)
    ON CONFLICT (resident_id, charge_category) DO NOTHING;

    -- Lock both wallets in a fixed order so two re-tags of one resident cannot deadlock.
    PERFORM 1 FROM public.resident_wallets
    WHERE resident_id = v_payment.resident_id AND charge_category IN (v_payment.charge_category, p_charge_category)
    ORDER BY charge_category
    FOR UPDATE;

    SELECT * INTO STRICT v_old_wallet FROM public.resident_wallets
    WHERE resident_id = v_payment.resident_id AND charge_category = v_payment.charge_category;
    SELECT * INTO STRICT v_new_wallet FROM public.resident_wallets
    WHERE resident_id = v_payment.resident_id AND charge_category = p_charge_category;

    IF v_old_wallet.balance < v_payment.amount THEN
        RAISE EXCEPTION 'The % wallet holds less than this payment. Reverse what it paid before changing its category',
            v_payment.charge_category;
    END IF;

    UPDATE public.resident_wallets SET balance = balance - v_payment.amount WHERE id = v_old_wallet.id
    RETURNING * INTO v_old_wallet;
    UPDATE public.resident_wallets SET balance = balance + v_payment.amount WHERE id = v_new_wallet.id
    RETURNING * INTO v_new_wallet;

    INSERT INTO public.wallet_transactions (
        wallet_id, type, amount, balance_after, reference_type, reference_id, description
    ) VALUES
        (v_old_wallet.id, 'debit', v_payment.amount, v_old_wallet.balance, 'payment_retag', p_payment_id,
         format('Payment moved to %s', p_charge_category)),
        (v_new_wallet.id, 'credit', v_payment.amount, v_new_wallet.balance, 'payment_retag', p_payment_id,
         format('Payment moved from %s', v_payment.charge_category));

    UPDATE public.payment_records SET charge_category = p_charge_category, updated_at = NOW()
    WHERE id = p_payment_id;
    -- A credit-only batch of this payment now belongs to the new wallet, so a reversal returns there.
    UPDATE public.wallet_payment_batches SET charge_category = p_charge_category, updated_at = NOW()
    WHERE source_payment_id = p_payment_id;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', p_payment_id,
        'resident_id', v_payment.resident_id,
        'amount', v_payment.amount,
        'old_charge_category', v_payment.charge_category,
        'new_charge_category', p_charge_category,
        'old_wallet_id', v_old_wallet.id,
        'old_wallet_balance', v_old_wallet.balance,
        'new_wallet_id', v_new_wallet.id,
        'new_wallet_balance', v_new_wallet.balance
    );
END;
$$;

REVOKE ALL ON FUNCTION public.retag_payment_charge_category(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.retag_payment_charge_category(UUID, TEXT) TO authenticated, service_role;

COMMIT;
