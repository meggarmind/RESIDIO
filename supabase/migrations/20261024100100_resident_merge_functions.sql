-- Merge residents, functions (#987, database half of #821). Migration B of three.
-- Depends on 20261024100000_resident_merge_schema.sql. The JSON contract of the two API functions is
-- in docs/features/resident-merge.md; the rolled-back Stage probe is docs/security/probe-821-merge.sql.
--
-- WHAT CHANGES
--   API (EXECUTE granted to authenticated only; each checks has_permission('residents.merge') first):
--     public.preview_resident_merge(p_kept uuid, p_duplicate uuid) RETURNS jsonb
--       Read-only. Both records, counts per referencing column, the rows that will fold, blockers,
--       warnings, both wallets, both account balances and the contact fields side by side.
--     public.merge_residents(p_kept uuid, p_duplicate uuid, p_contact_choices jsonb) RETURNS jsonb
--       Moves everything that belongs to the person from the duplicate to the kept record in one
--       transaction, archives the duplicate with merged_into_resident_id, writes resident_merges,
--       and raises (rolling everything back) if any blocker or invariant fails.
--   Internal (EXECUTE revoked from PUBLIC, anon and authenticated; called by the two above):
--     public.resident_merge_references()  every column that references residents(id) and how it
--                                         is handled: move, fold, or keep
--     public.resident_merge_money(...)    the money figures the invariants compare
--     public.resident_merge_plan(...)     the preview body, also re-run by the merge inside its locks
--
-- REFERENCES (re-derived on 2026-10-21 from supabase/baseline plus every later migration): 46
--   foreign-key columns in 44 tables point at residents(id), plus three added by migration A
--   (residents.merged_into_resident_id and the two resident_merges columns). The static test
--   src/__tests__/resident-merge-migration.test.ts fails when a migration adds a reference that is
--   not listed in resident_merge_references(). At run time the preview reports any foreign key to
--   residents that is not listed and holds rows for the duplicate as the blocker
--   unhandled_reference, and the merge's last check counts rows left on the duplicate in every
--   foreign key read from pg_constraint, so a table added later cannot be skipped silently.
--   References without a foreign key: entity_notes (entity_type 'resident'), and the polymorphic
--   entity_id of approval_requests, in_app_notifications and escalation_states when entity_type is
--   'resident' or 'residents'. They move. audit_logs is history and stays on the archived record.
--
-- OWNER DECISIONS (2026-10-21, on #987; do not re-litigate)
--   Q2 contact: the caller picks email, phone_primary and phone_secondary field by field (default
--      the kept record's value; phone_secondary may take the duplicate's phone_primary). A
--      verified-at timestamp follows its value. Every other residents column stays as on the kept
--      record.
--   Q3 both records linked (active links) to the same house: stop. When one of the two links has
--      been ended (is_active false), the merge keeps the active link and drops the ended one into the
--      snapshot; when both are ended it keeps the kept record's. resident_houses is unique on
--      (resident_id, house_id), so the two rows cannot both survive.
--   Q4 both records have a login: stop. Otherwise the login moves to the kept record before the
--      duplicate is archived, so residents_remove_admin_roles finds no profile on the duplicate.
--   Q5 the duplicate's WhatsApp PIN and lock state are cleared and never copied. The kept record's
--      PIN is untouched. Unused WhatsApp link and PIN-setup codes and contact verification codes of
--      the duplicate are expired, and its WhatsApp sessions lose PIN authentication, for the same
--      reason: nothing proven on the duplicate carries over to the kept record.
--   Q6 wallets: the duplicate's wallet_transactions are re-pointed to the kept wallet (created if
--      missing), the kept balance becomes kept + duplicate, the duplicate's wallet stays with
--      balance 0, the kept wallet's balance_after is recomputed in time order, and one ZERO-amount
--      row (reference_type 'resident_merge') explains the move on each side. No real-amount
--      transfer pair: it would count the duplicate's payment-backed credit twice.
--   Q7 two opt-ins for the same phone: the latest decision (opted_in_at or opted_out_at) wins; the
--      surviving row keeps link_verified_at if either had it and stays active if either was. The
--      consent decision log moves whole.
--   Q9 resident_merges.snapshot holds every moved row's key per column, every dropped or changed
--      row in full (the old value only for codes and PIN state), both residents' rows before the
--      merge (without the PIN hash), both wallets and every old balance_after.
--
-- MONEY: how each table is kept from double counting or loss
--   invoices, payment_records, paystack_transactions, wallet_payment_batches,
--   wallet_settlement_requests, late_fee_waivers, house_levy_history, bank_statement_rows,
--   email_transactions, expenses, invoice_generation_candidates: re-pointed, never copied or
--   deleted. Two invoices or candidates that would collide on a unique business key, or an open
--   invoice generation run holding either record, are blockers.
--   resident_wallets and wallet_transactions: as Q6.
--   Invariants checked before commit (any failure raises and rolls back the whole merge):
--     - Σ wallet balances of the two records unchanged; the duplicate's wallet balance is 0;
--     - Σ signed wallet_transactions amounts of the two records unchanged (markers are zero);
--     - resident_account_balance closing and awaiting figures: kept after = kept before +
--       duplicate before, duplicate after = 0. This is the single check that proves nothing was
--       counted twice or lost;
--     - payment count and Σ amount, invoice count and Σ amount_due over the two records unchanged,
--       and none left on the duplicate;
--     - per referencing column, rows moved plus rows folded equal the plan's count;
--     - no row left on the duplicate in any foreign key to residents (read from pg_constraint) or in
--       a polymorphic reference, except the duplicate's own emptied wallet and resident_merges.
--
-- SECURITY
--   preview_resident_merge and merge_residents are SECURITY DEFINER with SET search_path = '': the
--   merge writes profiles columns only service_role may write and WhatsApp tables an admin's RLS
--   cannot reach, and the preview must count rows the caller's RLS hides. Each checks
--   public.has_permission('residents.merge') before anything else (super_admin only, Q1). EXECUTE
--   is revoked from PUBLIC and anon and granted to authenticated; there is no service_role bypass,
--   so the action must call them with the signed-in admin's session.
--   Locks: both residents rows FOR UPDATE, then both wallets FOR UPDATE, each in ascending id
--   order, so two merges cannot deadlock. The residents row lock also blocks every concurrent
--   insert of a row that references either record (the foreign key check takes FOR KEY SHARE)
--   until the merge commits.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION; REVOKE and GRANT are repeatable.
--
-- ROLLBACK (apply the rollback of 20261024100200 first):
--   DROP FUNCTION IF EXISTS public.merge_residents(uuid, uuid, jsonb);
--   DROP FUNCTION IF EXISTS public.preview_resident_merge(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.resident_merge_plan(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.resident_merge_money(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.resident_merge_references();
--   (Merges already done stay done: reverse one by hand from its resident_merges.snapshot.)
--
-- VERIFY (read-only, after applying):
--   SELECT p.proname, p.prosecdef, p.proconfig FROM pg_proc p
--    WHERE p.pronamespace = 'public'::regnamespace
--      AND p.proname IN ('preview_resident_merge', 'merge_residents');       -- both prosecdef true, search_path=""
--   SELECT has_function_privilege('anon', 'public.merge_residents(uuid, uuid, jsonb)', 'EXECUTE');        -- false
--   SELECT has_function_privilege('authenticated', 'public.resident_merge_plan(uuid, uuid)', 'EXECUTE'); -- false
--   -- Every foreign key to residents is listed (expect 0 rows):
--   SELECT c.conrelid::regclass, a.attname
--     FROM pg_constraint c
--     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
--    WHERE c.contype = 'f' AND c.confrelid = 'public.residents'::regclass
--      AND NOT EXISTS (SELECT 1 FROM public.resident_merge_references() r
--                       WHERE to_regclass('public.' || quote_ident(r.table_name)) = c.conrelid
--                         AND r.column_name = a.attname);
--   Then run docs/security/probe-821-merge.sql (rolled back) on Residio_Stage.

BEGIN;

-- Every column that references residents(id), in the order the merge moves them.
--   move: re-pointed to the kept record.
--   fold: unique per resident; the merge first drops the duplicate's rows that would collide (each
--         copied in full into the snapshot), then re-points the rest.
--   keep: never moved. The duplicate keeps its emptied wallet (Q6) and the merge history.
-- Order matters: house links before sponsors (the sponsor trigger checks the sponsor's links), and
-- the login (profiles) is moved before the duplicate is archived.
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
    (49, 'resident_merges',                  'merged_resident_id',            'id',          'keep')
$$;

-- The money figures over the two records that the merge compares before and after.
CREATE OR REPLACE FUNCTION public.resident_merge_money(p_kept uuid, p_duplicate uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT jsonb_build_object(
    'kept_closing_balance', kb.closing_balance,
    'duplicate_closing_balance', db.closing_balance,
    'kept_awaiting_verification', kb.awaiting_verification,
    'duplicate_awaiting_verification', db.awaiting_verification,
    'payment_count', (SELECT count(*) FROM public.payment_records p WHERE p.resident_id IN (p_kept, p_duplicate)),
    'payment_amount', (SELECT coalesce(sum(p.amount), 0) FROM public.payment_records p WHERE p.resident_id IN (p_kept, p_duplicate)),
    'duplicate_payment_count', (SELECT count(*) FROM public.payment_records p WHERE p.resident_id = p_duplicate),
    'invoice_count', (SELECT count(*) FROM public.invoices i WHERE i.resident_id IN (p_kept, p_duplicate)),
    'invoice_amount_due', (SELECT coalesce(sum(i.amount_due), 0) FROM public.invoices i WHERE i.resident_id IN (p_kept, p_duplicate)),
    'duplicate_invoice_count', (SELECT count(*) FROM public.invoices i WHERE i.resident_id = p_duplicate),
    'kept_wallet_balance', (SELECT coalesce(sum(w.balance), 0) FROM public.resident_wallets w WHERE w.resident_id = p_kept),
    'duplicate_wallet_balance', (SELECT coalesce(sum(w.balance), 0) FROM public.resident_wallets w WHERE w.resident_id = p_duplicate),
    'wallet_ledger_total', (SELECT coalesce(sum(CASE WHEN t.type = 'credit' THEN t.amount ELSE -t.amount END), 0)
                              FROM public.wallet_transactions t
                              JOIN public.resident_wallets w ON w.id = t.wallet_id
                             WHERE w.resident_id IN (p_kept, p_duplicate))
  )
  FROM public.resident_account_balance(p_kept, NULL, DATE '1900-01-01', DATE '2999-12-31') kb
  CROSS JOIN public.resident_account_balance(p_duplicate, NULL, DATE '1900-01-01', DATE '2999-12-31') db;
$$;

-- The preview: what a merge of p_duplicate into p_kept would do, and what stops it. Read-only.
CREATE OR REPLACE FUNCTION public.resident_merge_plan(p_kept uuid, p_duplicate uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  k public.residents%ROWTYPE;
  d public.residents%ROWTYPE;
  v_ref record;
  v_n bigint;
  v_tmp jsonb;
  v_blockers jsonb := '[]'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_folds jsonb;
  v_replaced jsonb;
  v_unhandled jsonb := '[]'::jsonb;
  v_kept_login boolean;
  v_dup_login boolean;
  v_kept_residences bigint;
  v_dup_residences bigint;
  v_money jsonb;
  v_dup_wallet public.resident_wallets%ROWTYPE;
BEGIN
  SELECT * INTO k FROM public.residents WHERE id = p_kept;
  SELECT * INTO d FROM public.residents WHERE id = p_duplicate;

  IF k.id IS NULL OR d.id IS NULL THEN
    RETURN jsonb_build_object(
      'kept_resident_id', p_kept,
      'duplicate_resident_id', p_duplicate,
      'can_merge', false,
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'not_found', 'message', 'One or both residents do not exist.',
        'detail', jsonb_build_object('kept_found', k.id IS NOT NULL, 'duplicate_found', d.id IS NOT NULL))));
  END IF;

  IF k.id = d.id THEN
    RETURN jsonb_build_object(
      'kept_resident_id', p_kept,
      'duplicate_resident_id', p_duplicate,
      'can_merge', false,
      'blockers', jsonb_build_array(jsonb_build_object(
        'code', 'self_merge', 'message', 'A resident cannot be merged into itself.', 'detail', NULL)));
  END IF;

  IF k.merged_into_resident_id IS NOT NULL OR d.merged_into_resident_id IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'already_merged', 'message', 'One of the records has already been merged into another.',
      'detail', jsonb_build_object('kept_merged_into', k.merged_into_resident_id,
                                   'duplicate_merged_into', d.merged_into_resident_id)));
  END IF;

  IF k.account_status = 'archived' THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'kept_archived', 'message', 'The record to keep is archived. Keep an active or inactive record.',
      'detail', NULL));
  END IF;

  IF k.entity_type <> d.entity_type THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'entity_type_mismatch', 'message', 'The two records are different kinds of resident (individual, corporate or developer).',
      'detail', jsonb_build_object('kept', k.entity_type, 'duplicate', d.entity_type)));
  END IF;

  -- Q3: both linked to the same house, both links active.
  SELECT jsonb_agg(DISTINCT kh.house_id) INTO v_tmp
    FROM public.resident_houses kh
    JOIN public.resident_houses dh ON dh.house_id = kh.house_id AND dh.resident_id = p_duplicate
   WHERE kh.resident_id = p_kept AND kh.is_active AND dh.is_active;
  IF v_tmp IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'same_house', 'message', 'Both records are linked to the same house. End one of the two links first.',
      'detail', jsonb_build_object('house_ids', v_tmp)));
  END IF;

  -- Moving links by resident_id skips the residency trigger, so the merge checks it itself.
  SELECT count(*) FILTER (WHERE rh.resident_id = p_kept), count(*) FILTER (WHERE rh.resident_id = p_duplicate)
    INTO v_kept_residences, v_dup_residences
    FROM public.resident_houses rh
   WHERE rh.resident_id IN (p_kept, p_duplicate)
     AND rh.is_active
     AND rh.resident_role IN ('resident_landlord', 'tenant', 'co_resident');
  IF v_dup_residences > 0 AND v_kept_residences + v_dup_residences > 1 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'two_active_residences', 'message', 'After the merge the person would live in two houses at once (resident landlord, tenant or co-resident). End one residency first.',
      'detail', jsonb_build_object('kept', v_kept_residences, 'duplicate', v_dup_residences)));
  END IF;

  -- Q4: both have a login.
  v_kept_login := k.profile_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.resident_id = p_kept);
  v_dup_login := d.profile_id IS NOT NULL OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.resident_id = p_duplicate);
  IF v_kept_login AND v_dup_login THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'both_logins', 'message', 'Both records have a portal login. Unlink one first.', 'detail', NULL));
  END IF;

  -- Invoices that would collide on a unique billing key (the person was billed twice).
  SELECT jsonb_agg(jsonb_build_object('kept_invoice_id', ki.id, 'duplicate_invoice_id', di.id)) INTO v_tmp
    FROM public.invoices di
    JOIN public.invoices ki ON ki.resident_id = p_kept
   WHERE di.resident_id = p_duplicate
     AND ((di.house_id IS NOT NULL AND di.billing_profile_id IS NOT NULL
           AND di.period_start IS NOT NULL AND di.period_end IS NOT NULL
           AND ki.house_id = di.house_id AND ki.billing_profile_id = di.billing_profile_id
           AND ki.period_start = di.period_start AND ki.period_end = di.period_end)
       OR (di.billing_profile_version_id IS NOT NULL
           AND ki.billing_profile_version_id = di.billing_profile_version_id
           AND ki.house_id IS NOT DISTINCT FROM di.house_id
           AND ki.period_start IS NOT DISTINCT FROM di.period_start
           AND ki.period_end IS NOT DISTINCT FROM di.period_end));
  IF v_tmp IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'invoice_clash', 'message', 'Both records were invoiced for the same house and period. Void one invoice of each pair first.',
      'detail', jsonb_build_object('pairs', v_tmp)));
  END IF;

  SELECT jsonb_agg(DISTINCT c.run_id) INTO v_tmp
    FROM public.invoice_generation_candidates c
    JOIN public.invoice_generation_runs r ON r.id = c.run_id
   WHERE c.resident_id IN (p_kept, p_duplicate)
     AND r.status IN ('draft', 'awaiting_approval', 'queued', 'processing');
  IF v_tmp IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'generation_run_open', 'message', 'An invoice generation run that includes one of the records is still open. Finish or cancel it first.',
      'detail', jsonb_build_object('run_ids', v_tmp)));
  END IF;

  SELECT jsonb_agg(jsonb_build_object('kept_candidate_id', kc.id, 'duplicate_candidate_id', dc.id)) INTO v_tmp
    FROM public.invoice_generation_candidates dc
    JOIN public.invoice_generation_candidates kc
      ON kc.resident_id = p_kept AND kc.run_id = dc.run_id
     AND kc.house_id IS NOT DISTINCT FROM dc.house_id
     AND kc.billing_profile_version_id = dc.billing_profile_version_id
     AND kc.period_start = dc.period_start AND kc.period_end = dc.period_end
   WHERE dc.resident_id = p_duplicate;
  IF v_tmp IS NOT NULL THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'generation_candidate_clash', 'message', 'One invoice generation run billed both records for the same house and period.',
      'detail', jsonb_build_object('pairs', v_tmp)));
  END IF;

  -- Rows on the duplicate, per referencing column.
  FOR v_ref IN
    SELECT r.table_name, r.column_name FROM public.resident_merge_references() r
     WHERE r.handling <> 'keep' ORDER BY r.ordinal
  LOOP
    EXECUTE format('SELECT count(*) FROM public.%I WHERE %I = $1', v_ref.table_name, v_ref.column_name)
      INTO v_n USING p_duplicate;
    v_counts := v_counts || jsonb_build_object(v_ref.table_name || '.' || v_ref.column_name, v_n);
  END LOOP;

  v_counts := v_counts || jsonb_build_object(
    'entity_notes.entity_id',
      (SELECT count(*) FROM public.entity_notes n WHERE n.entity_type = 'resident' AND n.entity_id = p_duplicate),
    'approval_requests.entity_id',
      (SELECT count(*) FROM public.approval_requests a WHERE a.entity_type IN ('resident', 'residents') AND a.entity_id = p_duplicate),
    'in_app_notifications.entity_id',
      (SELECT count(*) FROM public.in_app_notifications n WHERE n.entity_type IN ('resident', 'residents') AND n.entity_id = p_duplicate),
    'escalation_states.entity_id',
      (SELECT count(*) FROM public.escalation_states e WHERE e.entity_type IN ('resident', 'residents') AND e.entity_id = p_duplicate),
    'wallet_transactions.wallet_id',
      (SELECT count(*) FROM public.wallet_transactions t JOIN public.resident_wallets w ON w.id = t.wallet_id
        WHERE w.resident_id = p_duplicate));

  -- A foreign key to residents that resident_merge_references() does not list.
  FOR v_ref IN
    SELECT c.conrelid::regclass::text AS table_name, a.attname::text AS column_name
      FROM pg_catalog.pg_constraint c
      JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.residents'::regclass
       AND NOT EXISTS (
         SELECT 1 FROM public.resident_merge_references() r
          WHERE pg_catalog.to_regclass('public.' || pg_catalog.quote_ident(r.table_name)) = c.conrelid
            AND r.column_name = a.attname)
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', v_ref.table_name, v_ref.column_name)
      INTO v_n USING p_duplicate;
    IF v_n > 0 THEN
      v_unhandled := v_unhandled || jsonb_build_array(jsonb_build_object(
        'reference', v_ref.table_name || '.' || v_ref.column_name, 'rows', v_n));
    END IF;
  END LOOP;
  IF jsonb_array_length(v_unhandled) > 0 THEN
    v_blockers := v_blockers || jsonb_build_array(jsonb_build_object(
      'code', 'unhandled_reference', 'message', 'A table the merge does not know about holds rows for the duplicate. The merge function needs updating first.',
      'detail', jsonb_build_object('references', v_unhandled)));
  END IF;

  -- Duplicate rows the merge drops because the kept record already has the same row (each goes
  -- into the snapshot in full), keyed like counts.
  v_folds := jsonb_build_object(
    'resident_houses.resident_id',
      (SELECT count(*) FROM public.resident_houses dh
         JOIN public.resident_houses kh ON kh.house_id = dh.house_id AND kh.resident_id = p_kept
        WHERE dh.resident_id = p_duplicate AND NOT dh.is_active),
    'resident_payment_aliases.resident_id',
      (SELECT count(*) FROM public.resident_payment_aliases da
         JOIN public.resident_payment_aliases ka ON ka.resident_id = p_kept AND ka.alias_name = da.alias_name
        WHERE da.resident_id = p_duplicate),
    'resident_payment_cadence_summary.resident_id',
      (SELECT count(*) FROM public.resident_payment_cadence_summary s WHERE s.resident_id = p_duplicate),
    'notification_preferences.resident_id',
      (SELECT count(*) FROM public.notification_preferences dp
         JOIN public.notification_preferences kp
           ON kp.resident_id = p_kept AND kp.category = dp.category AND kp.channel = dp.channel
        WHERE dp.resident_id = p_duplicate),
    'escalation_states.resident_id',
      (SELECT count(*) FROM public.escalation_states de
         JOIN public.escalation_states ke
           ON ke.resident_id = p_kept AND ke.entity_type = de.entity_type AND ke.entity_id = de.entity_id
        WHERE de.resident_id = p_duplicate),
    'hierarchical_settings.resident_id',
      (SELECT count(*) FROM public.hierarchical_settings ds
         JOIN public.hierarchical_settings ks
           ON ks.resident_id = p_kept AND ks.setting_key = ds.setting_key AND ks.level = ds.level
          AND ks.house_id IS NOT DISTINCT FROM ds.house_id
        WHERE ds.resident_id = p_duplicate),
    'announcement_read_receipts.resident_id',
      (SELECT count(*) FROM public.announcement_read_receipts dr
         JOIN public.announcement_read_receipts kr ON kr.resident_id = p_kept AND kr.announcement_id = dr.announcement_id
        WHERE dr.resident_id = p_duplicate),
    'report_subscriptions.resident_id',
      (SELECT count(*) FROM public.report_subscriptions s
        WHERE s.resident_id = p_duplicate
          AND EXISTS (SELECT 1 FROM public.report_subscriptions ks WHERE ks.resident_id = p_kept)),
    'whatsapp_optins.resident_id',
      (SELECT count(*) FROM public.whatsapp_optins do2
         JOIN public.whatsapp_optins ko ON ko.resident_id = p_kept AND ko.phone_number = do2.phone_number
        WHERE do2.resident_id = p_duplicate),
    'whatsapp_survey_opt_outs.resident_id',
      (SELECT count(*) FROM public.whatsapp_survey_opt_outs s
        WHERE s.resident_id = p_duplicate
          AND EXISTS (SELECT 1 FROM public.whatsapp_survey_opt_outs ks WHERE ks.resident_id = p_kept)),
    'recipient_group_members.resident_id',
      (SELECT count(*) FROM public.recipient_group_members dm
         JOIN public.recipient_group_members km ON km.resident_id = p_kept AND km.group_id = dm.group_id
        WHERE dm.resident_id = p_duplicate),
    'clearance_certificate_copies.recipient_resident_id',
      (SELECT count(*) FROM public.clearance_certificate_copies dc
         JOIN public.clearance_certificate_copies kc
           ON kc.recipient_resident_id = p_kept AND kc.document_id = dc.document_id
        WHERE dc.recipient_resident_id = p_duplicate));

  -- Kept rows the merge replaces: an ended house link of the kept record whose house the duplicate
  -- still lives in (Q3). The duplicate's active link moves in its place.
  v_replaced := jsonb_build_object(
    'resident_houses',
      (SELECT count(*) FROM public.resident_houses kh
         JOIN public.resident_houses dh ON dh.house_id = kh.house_id AND dh.resident_id = p_duplicate
        WHERE kh.resident_id = p_kept AND NOT kh.is_active AND dh.is_active));

  v_money := public.resident_merge_money(p_kept, p_duplicate);
  SELECT * INTO v_dup_wallet FROM public.resident_wallets w WHERE w.resident_id = p_duplicate;

  RETURN jsonb_build_object(
    'kept_resident_id', p_kept,
    'duplicate_resident_id', p_duplicate,
    'can_merge', jsonb_array_length(v_blockers) = 0,
    'blockers', v_blockers,
    'warnings', jsonb_build_object(
      -- Same amount and date, and the same reference or none: possibly one payment entered twice.
      'possible_duplicate_payments', coalesce((
        SELECT jsonb_agg(x.pair ORDER BY x.payment_date)
          FROM (SELECT jsonb_build_object('kept_payment_id', kp.id, 'duplicate_payment_id', dp.id,
                                          'amount', dp.amount, 'payment_date', dp.payment_date) AS pair,
                       dp.payment_date
                  FROM public.payment_records dp
                  JOIN public.payment_records kp
                    ON kp.resident_id = p_kept AND kp.amount = dp.amount AND kp.payment_date = dp.payment_date
                   AND (nullif(btrim(kp.reference_number), '') IS NULL
                        OR nullif(btrim(dp.reference_number), '') IS NULL
                        OR btrim(kp.reference_number) = btrim(dp.reference_number))
                 WHERE dp.resident_id = p_duplicate AND dp.status <> 'failed' AND kp.status <> 'failed'
                 LIMIT 50) x), '[]'::jsonb),
      -- Non-void invoices for the same house over overlapping periods: possibly billed twice.
      'overlapping_invoices', coalesce((
        SELECT jsonb_agg(x.pair)
          FROM (SELECT jsonb_build_object('kept_invoice_id', ki.id, 'duplicate_invoice_id', di.id,
                                          'house_id', di.house_id) AS pair
                  FROM public.invoices di
                  JOIN public.invoices ki
                    ON ki.resident_id = p_kept AND ki.house_id = di.house_id AND ki.status <> 'void'
                   AND ki.period_start IS NOT NULL AND ki.period_end IS NOT NULL
                   AND pg_catalog.daterange(ki.period_start, ki.period_end, '[]')
                       && pg_catalog.daterange(di.period_start, di.period_end, '[]')
                 WHERE di.resident_id = p_duplicate AND di.status <> 'void'
                   AND di.period_start IS NOT NULL AND di.period_end IS NOT NULL
                 LIMIT 50) x), '[]'::jsonb)),
    'kept', jsonb_build_object(
      'id', k.id, 'resident_code', k.resident_code,
      'name', coalesce(k.company_name, k.first_name || ' ' || k.last_name),
      'entity_type', k.entity_type, 'account_status', k.account_status,
      'has_login', v_kept_login, 'has_whatsapp_pin', k.whatsapp_pin_hash IS NOT NULL),
    'duplicate', jsonb_build_object(
      'id', d.id, 'resident_code', d.resident_code,
      'name', coalesce(d.company_name, d.first_name || ' ' || d.last_name),
      'entity_type', d.entity_type, 'account_status', d.account_status,
      'has_login', v_dup_login, 'has_whatsapp_pin', d.whatsapp_pin_hash IS NOT NULL),
    'contact', jsonb_build_object(
      'kept', jsonb_build_object('email', k.email, 'email_verified_at', k.email_verified_at,
                                 'phone_primary', k.phone_primary, 'phone_verified_at', k.phone_verified_at,
                                 'phone_secondary', k.phone_secondary),
      'duplicate', jsonb_build_object('email', d.email, 'email_verified_at', d.email_verified_at,
                                      'phone_primary', d.phone_primary, 'phone_verified_at', d.phone_verified_at,
                                      'phone_secondary', d.phone_secondary),
      -- Q2: offer the duplicate's phone as the kept record's second phone, so WhatsApp still knows it.
      'suggest_duplicate_phone_as_secondary',
        nullif(btrim(k.phone_secondary), '') IS NULL AND d.phone_primary IS DISTINCT FROM k.phone_primary),
    'counts', v_counts,
    'folds', v_folds,
    'replaced_kept_rows', v_replaced,
    'wallets', jsonb_build_object(
      'kept_balance', v_money->'kept_wallet_balance',
      'duplicate_balance', v_money->'duplicate_wallet_balance',
      'combined_balance', (v_money->>'kept_wallet_balance')::numeric + (v_money->>'duplicate_wallet_balance')::numeric,
      'duplicate_has_wallet', v_dup_wallet.id IS NOT NULL),
    'account_balances', jsonb_build_object(
      'kept_closing_balance', v_money->'kept_closing_balance',
      'duplicate_closing_balance', v_money->'duplicate_closing_balance',
      'combined_closing_balance', (v_money->>'kept_closing_balance')::numeric + (v_money->>'duplicate_closing_balance')::numeric));
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_resident_merge(p_kept uuid, p_duplicate uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT public.has_permission('residents.merge') THEN
    RAISE EXCEPTION 'Not authorized to merge residents' USING ERRCODE = '42501';
  END IF;
  IF p_kept IS NULL OR p_duplicate IS NULL THEN
    RAISE EXCEPTION 'Both resident ids are required' USING ERRCODE = '22023';
  END IF;

  RETURN public.resident_merge_plan(p_kept, p_duplicate);
END;
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
  v_wallets jsonb := jsonb_build_object('combined', false);
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

  -- 5. Wallets (Q6). Row ids and old balance_after values go into the snapshot.
  SELECT * INTO v_kw FROM public.resident_wallets w WHERE w.resident_id = p_kept;
  SELECT * INTO v_dw FROM public.resident_wallets w WHERE w.resident_id = p_duplicate;
  IF v_dw.id IS NOT NULL
     AND (v_dw.balance <> 0 OR EXISTS (SELECT 1 FROM public.wallet_transactions t WHERE t.wallet_id = v_dw.id)) THEN
    v_wallets := jsonb_build_object(
      'combined', true,
      'kept_before', CASE WHEN v_kw.id IS NULL THEN NULL ELSE to_jsonb(v_kw) END,
      'duplicate_before', to_jsonb(v_dw),
      'kept_wallet_created', v_kw.id IS NULL);

    IF v_kw.id IS NULL THEN
      INSERT INTO public.resident_wallets (resident_id, balance) VALUES (p_kept, 0) RETURNING * INTO v_kw;
    END IF;

    WITH moved AS (
      UPDATE public.wallet_transactions t SET wallet_id = v_kw.id WHERE t.wallet_id = v_dw.id RETURNING t.id)
    SELECT count(*), coalesce(jsonb_agg(id ORDER BY id), '[]'::jsonb) INTO v_n, v_ids FROM moved;
    v_moved := v_moved || jsonb_build_object('wallet_transactions.wallet_id', v_n);
    v_moved_keys := v_moved_keys || jsonb_build_object('wallet_transactions.wallet_id', v_ids);

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
    v_wallets := v_wallets || jsonb_build_object(
      'kept_wallet_id', v_kw.id, 'duplicate_wallet_id', v_dw.id,
      'kept_balance_after', v_new_balance, 'old_balance_after', v_rows);
  ELSE
    v_moved := v_moved || jsonb_build_object('wallet_transactions.wallet_id', 0);
    v_moved_keys := v_moved_keys || jsonb_build_object('wallet_transactions.wallet_id', '[]'::jsonb);
  END IF;

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

COMMENT ON FUNCTION public.preview_resident_merge(uuid, uuid) IS
  'Read-only preview of merging p_duplicate into p_kept: counts, folds, blockers, warnings, wallets and contact fields (#987). Needs residents.merge.';
COMMENT ON FUNCTION public.merge_residents(uuid, uuid, jsonb) IS
  'Merges p_duplicate into p_kept in one transaction, archives the duplicate and writes resident_merges; raises on any blocker or failed invariant (#987). Needs residents.merge.';

REVOKE ALL ON FUNCTION public.resident_merge_references() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resident_merge_money(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resident_merge_plan(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.preview_resident_merge(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.merge_residents(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.preview_resident_merge(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.merge_residents(uuid, uuid, jsonb) TO authenticated;

COMMIT;
