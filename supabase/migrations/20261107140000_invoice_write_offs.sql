-- Issue #1460: dues write-off (Exco settlement).
--
-- Owner decisions (5 Nov 2026): option B of the mockups; written-off bills show and report as
-- "Written off", apart from bills voided as errors; no second-admin approval; only super_admin and
-- chairman get the permission; a Write-offs report.
--
-- WHAT THIS ADDS
--   1. The permission billing.write_off_invoices (category billing), granted to super_admin and
--      chairman only.
--   2. public.invoice_write_offs: one row for each written-off bill. A bill with a row here is a
--      write-off; a void bill with no row is a bill voided as an error.
--   3. write_off_invoices(p_invoice_ids, p_reason, p_note, p_actor): writes off a set of open bills
--      of one resident in one transaction. One batch_id covers the set.
--        - A bill with nothing paid (amount_paid = 0) is set to status 'void'. Every debt, statement
--          and report query already leaves void bills out.
--        - A part-paid bill (amount_paid > 0) is NOT voided, because its paid money would then drop
--          out of the collection totals. Its amount_due is cut to amount_paid and its status set to
--          'paid'. Outstanding is amount_due - amount_paid everywhere (and the roll-forward ledger in
--          resident_account_balance sums amount_due of non-void bills), so both fall by exactly the
--          unpaid balance, and the paid part stays counted.
--      amount_written_off is always the unpaid balance (original amount_due - amount_paid).
--      Refused, with nothing written: no bills, a bill not found, bills of more than one resident,
--      a bill not unpaid/partially_paid, a bill with no unpaid balance, a bad reason, a note under 5
--      characters.
--   4. undo_invoice_write_off(p_batch_id): puts each bill of the batch back to its original status
--      and amount_due and deletes the batch's rows. Refused when any bill of the batch has changed
--      since the write-off (a payment allocated or reversed, or its status or amount changed).
--   5. resident_merge_references() lists invoice_write_offs.resident_id ('move'), so a resident
--      merge re-points the write-off rows onto the kept resident, with the invoices.
--
-- AUTHORIZATION: inside each function (SECURITY DEFINER bypasses RLS), as in
-- 20261103120000_wallet_credit_transfers.sql: billing.write_off_invoices, or service_role. The actor
-- recorded is auth.uid() for a signed-in caller; p_actor is used only for a service_role caller.
-- The table has no write policies: rows are written only by these functions.
--
-- LOCKS: the functions lock invoice rows only, in id order. They never lock a wallet, so they cannot
-- form a deadlock cycle with the wallet RPCs (which lock wallet, then invoices by id).
--
-- ROLLBACK (written-off bills stay void/paid; undo each batch first if they must come back):
-- BEGIN;
-- -- re-run resident_merge_references() from 20261104120200_whatsapp_group_members.sql
-- DROP FUNCTION IF EXISTS public.undo_invoice_write_off(UUID);
-- DROP FUNCTION IF EXISTS public.write_off_invoices(UUID[], TEXT, TEXT, UUID);
-- DROP TABLE IF EXISTS public.invoice_write_offs;
-- DELETE FROM public.role_permissions WHERE permission_id IN
--   (SELECT id FROM public.app_permissions WHERE name = 'billing.write_off_invoices');
-- DELETE FROM public.app_permissions WHERE name = 'billing.write_off_invoices';
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT r.name FROM public.role_permissions rp JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name = 'billing.write_off_invoices' ORDER BY 1;                     -- chairman, super_admin
--   SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef FROM pg_proc p
--    WHERE p.proname IN ('write_off_invoices', 'undo_invoice_write_off') ORDER BY 1;
--   SELECT has_function_privilege('anon', 'public.write_off_invoices(uuid[], text, text, uuid)', 'EXECUTE');  -- false
--   SELECT has_function_privilege('anon', 'public.undo_invoice_write_off(uuid)', 'EXECUTE');                -- false
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.invoice_write_offs'::regclass;                   -- true

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
    'billing.write_off_invoices',
    'Write Off Invoices',
    'Write off the unpaid balance of a resident''s open bills (Exco settlement, hardship), and undo a write-off',
    'billing',
    true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman')
  AND p.name = 'billing.write_off_invoices'
ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.invoice_write_offs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id UUID NOT NULL,
    resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
    house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL,
    amount_written_off NUMERIC(12, 2) NOT NULL CHECK (amount_written_off > 0),
    original_status public.invoice_status NOT NULL,
    original_amount_due NUMERIC(12, 2) NOT NULL,
    -- amount_paid when written off: undo refuses when it has changed since.
    original_amount_paid NUMERIC(12, 2) NOT NULL,
    reason TEXT NOT NULL CHECK (reason IN ('exco_settlement', 'hardship', 'other')),
    note TEXT NOT NULL CHECK (length(btrim(note)) >= 5),
    batch_id UUID NOT NULL,
    written_off_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    written_off_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT invoice_write_offs_invoice_id_key UNIQUE (invoice_id),
    CONSTRAINT invoice_write_offs_invoice_id_fkey FOREIGN KEY (invoice_id)
        REFERENCES public.invoices(id) ON DELETE CASCADE
);

COMMENT ON TABLE public.invoice_write_offs IS
  'One row for each written-off bill (#1460). A void bill with a row here is "Written off"; a void bill without one was voided as an error.';

CREATE INDEX IF NOT EXISTS invoice_write_offs_resident_id_idx ON public.invoice_write_offs (resident_id);
CREATE INDEX IF NOT EXISTS invoice_write_offs_batch_id_idx ON public.invoice_write_offs (batch_id);
CREATE INDEX IF NOT EXISTS invoice_write_offs_written_off_at_idx ON public.invoice_write_offs (written_off_at);
CREATE INDEX IF NOT EXISTS invoice_write_offs_house_id_idx ON public.invoice_write_offs (house_id);
CREATE INDEX IF NOT EXISTS invoice_write_offs_written_off_by_idx ON public.invoice_write_offs (written_off_by);

ALTER TABLE public.invoice_write_offs ENABLE ROW LEVEL SECURITY;

-- Admin read only. Whoever can read invoices on the admin side (billing.create_invoice, the invoices
-- read policy), whoever can write off, and whoever can run the financial reports (the Write-offs
-- report). Residents do not read these rows: the note is the Exco's own record.
DROP POLICY IF EXISTS "Admins can view invoice write-offs" ON public.invoice_write_offs;
CREATE POLICY "Admins can view invoice write-offs" ON public.invoice_write_offs
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (
    (select has_permission('billing.create_invoice'::text))
    OR (select has_permission('billing.write_off_invoices'::text))
    OR (select has_permission('reports.view_financial'::text))
  );

REVOKE ALL ON TABLE public.invoice_write_offs FROM anon, authenticated;
GRANT SELECT ON TABLE public.invoice_write_offs TO authenticated;
GRANT ALL ON TABLE public.invoice_write_offs TO service_role;

-- ---------------------------------------------------------------------------
-- write_off_invoices(p_invoice_ids, p_reason, p_note, p_actor DEFAULT NULL)  -- all-or-nothing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.write_off_invoices(
    p_invoice_ids UUID[],
    p_reason TEXT,
    p_note TEXT,
    p_actor UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_service BOOLEAN := (auth.role() = 'service_role');
    v_actor UUID;
    v_note TEXT := btrim(p_note);
    v_ids UUID[];
    v_found INT;
    v_residents UUID[];
    v_bad TEXT;
    v_batch UUID := gen_random_uuid();
    v_rec RECORD;
    v_amount NUMERIC;
    v_total NUMERIC := 0;
    v_count INT := 0;
BEGIN
    IF NOT (v_is_service OR public.has_permission('billing.write_off_invoices')) THEN
        RAISE EXCEPTION 'Not authorized to write off invoices' USING ERRCODE = '42501';
    END IF;
    v_actor := CASE WHEN v_is_service THEN p_actor ELSE auth.uid() END;

    IF p_reason IS NULL OR p_reason NOT IN ('exco_settlement', 'hardship', 'other') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Choose a reason for the write-off');
    END IF;
    IF v_note IS NULL OR length(v_note) < 5 THEN
        RETURN jsonb_build_object('success', false, 'error', 'A note of at least 5 characters is required');
    END IF;

    SELECT array_agg(DISTINCT x ORDER BY x) INTO v_ids
    FROM unnest(coalesce(p_invoice_ids, '{}'::UUID[])) AS x
    WHERE x IS NOT NULL;
    IF v_ids IS NULL OR cardinality(v_ids) = 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Select at least one bill');
    END IF;
    IF cardinality(v_ids) > 1000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Select at most 1000 bills at a time');
    END IF;

    -- Lock every bill, in id order.
    PERFORM 1 FROM public.invoices WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;

    SELECT count(*), array_agg(DISTINCT resident_id) INTO v_found, v_residents
    FROM public.invoices WHERE id = ANY (v_ids);
    IF v_found <> cardinality(v_ids) THEN
        RETURN jsonb_build_object('success', false, 'error', 'One or more bills were not found');
    END IF;
    IF cardinality(v_residents) <> 1 THEN
        RETURN jsonb_build_object('success', false, 'error', 'All bills must belong to one resident');
    END IF;

    SELECT string_agg(invoice_number || ' (' || status::TEXT || ')', ', ' ORDER BY invoice_number) INTO v_bad
    FROM public.invoices
    WHERE id = ANY (v_ids) AND status NOT IN ('unpaid', 'partially_paid');
    IF v_bad IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Only unpaid or part-paid bills can be written off: ' || v_bad);
    END IF;

    SELECT string_agg(invoice_number, ', ' ORDER BY invoice_number) INTO v_bad
    FROM public.invoices
    WHERE id = ANY (v_ids) AND amount_due - amount_paid <= 0;
    IF v_bad IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'These bills have nothing left to pay: ' || v_bad);
    END IF;

    FOR v_rec IN
        SELECT * FROM public.invoices WHERE id = ANY (v_ids) ORDER BY id
    LOOP
        v_amount := v_rec.amount_due - v_rec.amount_paid;

        IF v_rec.amount_paid > 0 THEN
            -- Part-paid: keep the paid part counted; cut the bill to what was paid.
            UPDATE public.invoices SET amount_due = v_rec.amount_paid, status = 'paid' WHERE id = v_rec.id;
        ELSE
            UPDATE public.invoices SET status = 'void' WHERE id = v_rec.id;
        END IF;

        INSERT INTO public.invoice_write_offs (
            invoice_id, resident_id, house_id, amount_written_off, original_status,
            original_amount_due, original_amount_paid, reason, note, batch_id, written_off_by
        ) VALUES (
            v_rec.id, v_rec.resident_id, v_rec.house_id, v_amount, v_rec.status,
            v_rec.amount_due, v_rec.amount_paid, p_reason, v_note, v_batch, v_actor
        );

        v_total := v_total + v_amount;
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', v_batch,
        'count', v_count,
        'total', v_total,
        'resident_id', v_residents[1],
        'invoice_ids', to_jsonb(v_ids)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- undo_invoice_write_off(p_batch_id)  -- all-or-nothing
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.undo_invoice_write_off(p_batch_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_ids UUID[];
    v_residents UUID[];
    v_total NUMERIC;
    v_bad TEXT;
BEGIN
    IF NOT (auth.role() = 'service_role' OR public.has_permission('billing.write_off_invoices')) THEN
        RAISE EXCEPTION 'Not authorized to undo a write-off' USING ERRCODE = '42501';
    END IF;

    SELECT array_agg(invoice_id ORDER BY invoice_id) INTO v_ids
    FROM public.invoice_write_offs WHERE batch_id = p_batch_id;
    IF v_ids IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Write-off not found');
    END IF;

    PERFORM 1 FROM public.invoices WHERE id = ANY (v_ids) ORDER BY id FOR UPDATE;
    -- Lock the batch rows too, so two undos of one batch cannot both run.
    PERFORM 1 FROM public.invoice_write_offs WHERE batch_id = p_batch_id ORDER BY id FOR UPDATE;

    -- Each bill must be exactly as the write-off left it.
    SELECT string_agg(i.invoice_number, ', ' ORDER BY i.invoice_number) INTO v_bad
    FROM public.invoice_write_offs w
    JOIN public.invoices i ON i.id = w.invoice_id
    WHERE w.batch_id = p_batch_id
      AND (
          i.amount_paid <> w.original_amount_paid
          OR i.status <> (CASE WHEN w.original_amount_paid > 0 THEN 'paid' ELSE 'void' END)::public.invoice_status
          OR i.amount_due <> (CASE WHEN w.original_amount_paid > 0 THEN w.original_amount_paid ELSE w.original_amount_due END)
      );
    IF v_bad IS NOT NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'These bills have changed since the write-off, so it cannot be undone: ' || v_bad);
    END IF;

    UPDATE public.invoices i
    SET status = w.original_status, amount_due = w.original_amount_due
    FROM public.invoice_write_offs w
    WHERE w.batch_id = p_batch_id AND i.id = w.invoice_id;

    SELECT sum(amount_written_off), array_agg(DISTINCT resident_id) INTO v_total, v_residents
    FROM public.invoice_write_offs WHERE batch_id = p_batch_id;

    DELETE FROM public.invoice_write_offs WHERE batch_id = p_batch_id;

    RETURN jsonb_build_object(
        'success', true,
        'batch_id', p_batch_id,
        'count', cardinality(v_ids),
        'total', v_total,
        'resident_id', v_residents[1],
        'invoice_ids', to_jsonb(v_ids)
    );
END;
$$;

-- ---------------------------------------------------------------------------
-- Resident merge inventory: invoice_write_offs.resident_id is a foreign key to residents, so
-- resident_merge_references() must list it or a merge of a resident with a write-off is blocked
-- (unhandled_reference). 'move': the rows follow the duplicate's invoices onto the kept resident.
-- The list below is the one in 20261104120200_whatsapp_group_members.sql plus entry 53.
-- ---------------------------------------------------------------------------
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
    (51, 'payment_records',                  'paid_by_resident_id',           'id',          'move'),
    (52, 'whatsapp_group_members',           'resident_id',                   'id',          'move'),
    (53, 'invoice_write_offs',               'resident_id',                   'id',          'move')
$$;

REVOKE ALL ON FUNCTION public.resident_merge_references() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.write_off_invoices(UUID[], TEXT, TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.undo_invoice_write_off(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_off_invoices(UUID[], TEXT, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.undo_invoice_write_off(UUID) TO authenticated, service_role;

COMMIT;
