-- Rolled-back probe for #987 (merge residents, database half of #821). NOT executed by the branch
-- author, who has no database access.
--
-- Run on Residio_Stage BEFORE the migrations are applied, as the migration owner, in ONE
-- transaction. Nothing is committed: the script ends with a statement that raises (so even a
-- client that drops the trailing ROLLBACK cannot commit) and then ROLLBACK.
--
--   1. Paste the bodies of the three migrations at the marker below, in order, without their own
--      BEGIN; and COMMIT; lines:
--        20261024100000_resident_merge_schema.sql
--        20261024100100_resident_merge_functions.sql
--        20261024100200_resident_merge_guard.sql   (optional: without it the guard check is SKIP)
--      From the repo root this writes the assembled script:
--        { sed -n '1,/^-- >>> MIGRATIONS/p' docs/security/probe-821-merge.sql
--          grep -vhE '^(BEGIN|COMMIT);$' supabase/migrations/20261024100000_resident_merge_schema.sql \
--            supabase/migrations/20261024100100_resident_merge_functions.sql \
--            supabase/migrations/20261024100200_resident_merge_guard.sql
--          sed -n '/^-- >>> MIGRATIONS/,$p' docs/security/probe-821-merge.sql | tail -n +2
--        } > probe-821-assembled.sql
--   2. The probe builds its own fixtures (four houses on an existing street, a handful of
--      residents named "Probe ... <tag>", their invoices, payments, wallets and WhatsApp rows),
--      merges two of them as an active super_admin, and checks the outcome.
--   3. Read the result rows (and the final error message, which repeats them). Every line must be
--      PASS. SKIP means the database lacked what that check needs (it says what).
--
-- Needs: one active super_admin profile and one street. Optional: a billing profile (invoice_clash
-- check), one active profile whose role lacks residents.merge (refusal check), and two residents
-- that each have a login (both_logins check, read-only on those two).
--
-- Trap (#412, 2026-10-21): MCP execute_sql may wait for owner approval on statement text it reads as
-- destructive (DROP ... IF EXISTS in the migration bodies, DELETE inside the merge function body).
-- On this fresh path the DROP ... IF EXISTS lines can be left out of the pasted bodies.
--
-- Not covered here: the generation_run_open and generation_candidate_clash blockers (they need a
-- full invoice generation run fixture) and concurrency (two sessions). The static test
-- src/__tests__/resident-merge-pglite.test.ts covers the house_link_in_use blocker.

BEGIN;

-- >>> MIGRATIONS: paste the three migration bodies here (see step 1) <<<

CREATE TEMP TABLE probe_821 (n serial, check_name text, ok boolean, detail text);

CREATE FUNCTION pg_temp.p821(p_name text, p_ok boolean, p_detail text DEFAULT NULL) RETURNS void
LANGUAGE sql AS $$ INSERT INTO probe_821 (check_name, ok, detail) VALUES (p_name, p_ok, p_detail) $$;

DO $probe$
DECLARE
  v_tag text := upper(substr(md5(random()::text), 1, 6));
  v_admin uuid; v_plain uuid; v_street uuid; v_bp uuid;
  v_h1 uuid; v_h2 uuid; v_h3 uuid; v_h4 uuid;
  v_k uuid; v_d uuid; v_o uuid; v_b1 uuid; v_b2 uuid; v_corp uuid; v_r1 uuid; v_r3 uuid; v_r4 uuid;
  v_r5 uuid; v_r6 uuid; v_login_a uuid; v_login_b uuid; v_l1 uuid; v_l2 uuid; v_login_p uuid; v_login_role uuid;
  v_kw uuid; v_dw uuid;
  v_kphone text := '+234' || (1000000000 + floor(random() * 8999999999))::bigint::text;
  v_dphone text := '+234' || (1000000000 + floor(random() * 8999999999))::bigint::text;
  v_ps text := '+234' || (1000000000 + floor(random() * 8999999999))::bigint::text;
  v_po text := '+234' || (1000000000 + floor(random() * 8999999999))::bigint::text;
  v_dup_optin_at timestamptz := now() - interval '1 day';
  v_pv jsonb; v_res jsonb; v_before jsonb; v_snap jsonb; v_counts jsonb;
  v_state text; v_n bigint; v_m bigint; v_txt text; v_ok boolean; v_num numeric;
  v_ref record; v_key text;
BEGIN
  -- Who and where.
  SELECT p.id INTO v_admin FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
   WHERE r.name = 'super_admin' AND p.approval_status = 'active' LIMIT 1;
  SELECT p.id INTO v_plain FROM public.profiles p
   WHERE p.approval_status = 'active'
     AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp JOIN public.app_permissions ap ON ap.id = rp.permission_id
                      WHERE rp.role_id = p.role_id AND ap.name = 'residents.merge')
   LIMIT 1;
  SELECT s.id INTO v_street FROM public.streets s LIMIT 1;
  SELECT b.id INTO v_bp FROM public.billing_profiles b LIMIT 1;
  IF v_admin IS NULL OR v_street IS NULL THEN
    PERFORM pg_temp.p821('setup', NULL, 'SKIP: needs an active super_admin profile and a street');
    RETURN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'merge_residents') THEN
    PERFORM pg_temp.p821('setup', false, 'merge_residents is missing: paste the migration bodies at the marker');
    RETURN;
  END IF;

  -- Fixtures. Houses H1..H4 are new.
  INSERT INTO public.houses (house_number, street_id, short_name) VALUES ('P821-' || v_tag || '-1', v_street, 'P821' || v_tag || 'A') RETURNING id INTO v_h1;
  INSERT INTO public.houses (house_number, street_id, short_name) VALUES ('P821-' || v_tag || '-2', v_street, 'P821' || v_tag || 'B') RETURNING id INTO v_h2;
  INSERT INTO public.houses (house_number, street_id, short_name) VALUES ('P821-' || v_tag || '-3', v_street, 'P821' || v_tag || 'C') RETURNING id INTO v_h3;
  INSERT INTO public.houses (house_number, street_id, short_name) VALUES ('P821-' || v_tag || '-4', v_street, 'P821' || v_tag || 'D') RETURNING id INTO v_h4;

  -- K (kept) and D (duplicate). Only D has a WhatsApp PIN (Q5: it must be cleared, not copied).
  INSERT INTO public.residents (first_name, last_name, phone_primary, email)
  VALUES ('Probe', 'Kept ' || v_tag, v_kphone, 'probe-kept-' || lower(v_tag) || '@example.test') RETURNING id INTO v_k;
  INSERT INTO public.residents (first_name, last_name, phone_primary, email, whatsapp_pin_hash, whatsapp_pin_set_at, whatsapp_pin_failed_attempts)
  VALUES ('Probe', 'Dup ' || v_tag, v_dphone, 'probe-dup-' || lower(v_tag) || '@example.test', 'probe-not-a-real-hash', now(), 2) RETURNING id INTO v_d;
  INSERT INTO public.residents (first_name, last_name, phone_primary, emergency_contact_resident_id)
  VALUES ('Probe', 'Other ' || v_tag, '+2340000000001', v_d) RETURNING id INTO v_o;
  UPDATE public.residents SET emergency_contact_resident_id = v_d WHERE id = v_k;

  -- Links: K tenant of H1; D owner of H2 and an ended household link on H1 (folds away, Q3).
  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES (v_k, v_h1, 'tenant', true);
  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES (v_d, v_h2, 'non_resident_landlord', true);
  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active, move_in_date, move_out_date)
  VALUES (v_d, v_h1, 'household_member', false, current_date - 30, current_date);

  -- Money. K: invoice 1000, verified payment 1000, wallet credit 50 (adjustment).
  --        D: invoice 500 and a void 300, verified payment 400, pending payment 100,
  --           wallet 250 = 200 mirrored (payment) + 50 non-mirrored (legacy credit).
  INSERT INTO public.invoices (resident_id, house_id, billing_profile_id, invoice_number, amount_due, status, due_date, period_start, period_end)
  VALUES (v_k, v_h1, v_bp, 'P821-' || v_tag || '-K1', 1000, 'unpaid', current_date, DATE '2026-01-01', DATE '2026-01-31');
  INSERT INTO public.invoices (resident_id, house_id, billing_profile_id, invoice_number, amount_due, status, due_date, period_start, period_end)
  VALUES (v_d, v_h2, v_bp, 'P821-' || v_tag || '-D1', 500, 'unpaid', current_date, DATE '2026-01-01', DATE '2026-01-31');
  INSERT INTO public.invoices (resident_id, house_id, invoice_number, amount_due, status, due_date)
  VALUES (v_d, v_h2, 'P821-' || v_tag || '-D2', 300, 'void', current_date);
  INSERT INTO public.payment_records (resident_id, house_id, amount, payment_date, status, is_verified, verified_at, reference_number)
  VALUES (v_k, v_h1, 1000, current_date - 3, 'paid', true, now(), 'P821K' || v_tag);
  INSERT INTO public.payment_records (resident_id, house_id, amount, payment_date, status, is_verified, verified_at, reference_number)
  VALUES (v_d, v_h2, 400, current_date - 2, 'paid', true, now(), 'P821D' || v_tag);
  INSERT INTO public.payment_records (resident_id, house_id, amount, payment_date, status, is_verified)
  VALUES (v_d, v_h2, 100, current_date - 1, 'pending', false);
  INSERT INTO public.resident_wallets (resident_id, balance) VALUES (v_k, 50) RETURNING id INTO v_kw;
  INSERT INTO public.resident_wallets (resident_id, balance) VALUES (v_d, 250) RETURNING id INTO v_dw;
  INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after, reference_type, description, created_at) VALUES
    (v_dw, 'credit', 200, 200, 'payment', 'probe 821 mirrored credit', now() - interval '20 days'),
    (v_kw, 'credit', 50, 50, 'adjustment', 'probe 821 kept adjustment', now() - interval '10 days'),
    (v_dw, 'credit', 50, 250, 'legacy_tracker_credit', 'probe 821 legacy credit', now() - interval '5 days');

  -- WhatsApp: both records opted the shared phone; D's decision is the later one (Q7).
  INSERT INTO public.whatsapp_optins (resident_id, phone_number, opted_in, source, opted_out_at)
  VALUES (v_k, v_ps, false, 'in_chat', now() - interval '30 days');
  INSERT INTO public.whatsapp_optins (resident_id, phone_number, opted_in, source, opted_in_at, link_verified_at)
  VALUES (v_d, v_ps, true, 'in_chat', v_dup_optin_at, v_dup_optin_at);
  INSERT INTO public.whatsapp_optins (resident_id, phone_number, opted_in, source, opted_in_at)
  VALUES (v_d, v_po, true, 'in_chat', now() - interval '2 days');
  INSERT INTO public.whatsapp_consent_decisions (resident_id, phone_number, decision, notice_version) VALUES
    (v_d, v_ps, 'privacy_accepted', 'probe-v1'), (v_d, v_po, 'privacy_accepted', 'probe-v1');
  INSERT INTO public.whatsapp_sessions (phone_number, resident_id, pin_authenticated, expires_at)
  VALUES (v_ps, v_d, true, now() + interval '1 hour');
  INSERT INTO public.verification_tokens (resident_id, token_type, token, target_value, expires_at)
  VALUES (v_d, 'email', '123456', 'probe-dup-' || lower(v_tag) || '@example.test', now() + interval '1 hour');

  -- Folds: identical alias and notification preference on both; one extra of each on D.
  INSERT INTO public.resident_payment_aliases (resident_id, alias_name) VALUES
    (v_k, 'PROBE ' || v_tag), (v_d, 'PROBE ' || v_tag), (v_d, 'PROBE ALT ' || v_tag);
  INSERT INTO public.notification_preferences (resident_id, category, channel) VALUES
    (v_k, 'payment', 'email'), (v_d, 'payment', 'email'), (v_d, 'invoice', 'sms');
  INSERT INTO public.entity_notes (entity_type, entity_id, content, created_by)
  VALUES ('resident', v_d, 'probe 821 note', v_admin);

  -- Blocker fixtures.
  INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'B1 ' || v_tag, '+2340000000002') RETURNING id INTO v_b1;
  INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'B2 ' || v_tag, '+2340000000003') RETURNING id INTO v_b2;
  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES (v_b1, v_h4, 'non_resident_landlord', true);
  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES (v_b2, v_h4, 'household_member', true);
  INSERT INTO public.residents (first_name, last_name, phone_primary, entity_type, company_name)
  VALUES ('Probe', 'Corp ' || v_tag, '+2340000000004', 'corporate', 'Probe Corp ' || v_tag) RETURNING id INTO v_corp;
  INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'R1 ' || v_tag, '+2340000000005') RETURNING id INTO v_r1;
  INSERT INTO public.resident_houses (resident_id, house_id, resident_role, is_active) VALUES (v_r1, v_h3, 'tenant', true);
  INSERT INTO public.residents (first_name, last_name, phone_primary, account_status)
  VALUES ('Probe', 'R3 ' || v_tag, '+2340000000006', 'archived') RETURNING id INTO v_r3;
  INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'R4 ' || v_tag, '+2340000000007') RETURNING id INTO v_r4;
  IF v_bp IS NOT NULL THEN
    INSERT INTO public.invoices (resident_id, house_id, billing_profile_id, invoice_number, amount_due, status, due_date, period_start, period_end)
    VALUES (v_r4, v_h1, v_bp, 'P821-' || v_tag || '-R4', 1000, 'unpaid', current_date, DATE '2026-01-01', DATE '2026-01-31');
  END IF;
  SELECT r.id INTO v_login_a FROM public.residents r WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.resident_id = r.id) ORDER BY r.id LIMIT 1;
  SELECT r.id INTO v_login_b FROM public.residents r WHERE EXISTS (SELECT 1 FROM public.profiles p WHERE p.resident_id = r.id) AND r.id > v_login_a ORDER BY r.id LIMIT 1;

  v_before := public.resident_merge_money(v_k, v_d);

  -- 1. Who may call. anon has no EXECUTE; a signed-in user without residents.merge is refused.
  PERFORM set_config('request.jwt.claims', '{"role":"anon"}', true);
  SET LOCAL ROLE anon;
  BEGIN
    v_pv := public.preview_resident_merge(v_k, v_d); v_state := 'returned';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM pg_temp.p821('anon cannot preview', v_state = '42501', v_state);

  IF v_plain IS NULL THEN
    PERFORM pg_temp.p821('non-holder refused', NULL, 'SKIP: no active profile without residents.merge');
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_plain)::text, true);
    SET LOCAL ROLE authenticated;
    BEGIN
      v_pv := public.preview_resident_merge(v_k, v_d); v_state := 'returned';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    BEGIN
      v_res := public.merge_residents(v_k, v_d, '{}'); v_txt := 'returned';
    EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
    END;
    RESET ROLE;
    PERFORM pg_temp.p821('non-holder refused (preview, merge)', v_state = '42501' AND v_txt = '42501', v_state || ', ' || v_txt);
  END IF;

  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    v_pv := public.resident_merge_plan(v_k, v_d); v_state := 'returned';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM pg_temp.p821('internal plan function hidden from authenticated', v_state = '42501', v_state);

  -- 2. Blockers, as the super_admin (preview is read-only).
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', v_admin)::text, true);
  SET LOCAL ROLE authenticated;
  v_pv := public.preview_resident_merge(v_k, v_k);
  v_ok := v_pv->'blockers' @> '[{"code": "self_merge"}]';
  v_txt := 'self_merge:' || v_ok;
  v_pv := public.preview_resident_merge(v_k, gen_random_uuid());
  v_ok := v_pv->'blockers' @> '[{"code": "not_found"}]';
  v_txt := v_txt || ' not_found:' || v_ok;
  v_pv := public.preview_resident_merge(v_b1, v_b2);
  v_txt := v_txt || ' same_house:' || (v_pv->'blockers' @> '[{"code": "same_house"}]');
  v_pv := public.preview_resident_merge(v_r3, v_r4);
  v_txt := v_txt || ' kept_archived:' || (v_pv->'blockers' @> '[{"code": "kept_archived"}]');
  RESET ROLE;
  PERFORM pg_temp.p821('blockers: self_merge, not_found, same_house (Q3), kept archived',
                       coalesce(v_txt NOT LIKE '%false%', false), v_txt);

  IF v_bp IS NULL THEN
    PERFORM pg_temp.p821('blocker: invoice_clash', NULL, 'SKIP: no billing profile');
  ELSE
    SET LOCAL ROLE authenticated;
    v_pv := public.preview_resident_merge(v_k, v_r4);
    RESET ROLE;
    PERFORM pg_temp.p821('blocker: invoice_clash', v_pv->'blockers' @> '[{"code": "invoice_clash"}]', v_pv->>'blockers');
  END IF;

  IF v_login_b IS NULL THEN
    PERFORM pg_temp.p821('blocker: both_logins (Q4)', NULL, 'SKIP: fewer than two residents with a login');
  ELSE
    SET LOCAL ROLE authenticated;
    v_pv := public.preview_resident_merge(v_login_a, v_login_b);
    RESET ROLE;
    PERFORM pg_temp.p821('blocker: both_logins (Q4)', v_pv->'blockers' @> '[{"code": "both_logins"}]', v_pv->>'blockers');
  END IF;

  -- A blocked merge raises and changes nothing.
  SET LOCAL ROLE authenticated;
  BEGIN
    v_res := public.merge_residents(v_b1, v_b2, '{}'); v_state := 'returned';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  SELECT count(*) INTO v_n FROM public.residents WHERE id = v_b2 AND account_status = 'active' AND merged_into_resident_id IS NULL;
  PERFORM pg_temp.p821('blocked merge raises and changes nothing',
                       v_state LIKE 'P0001 Resident merge blocked: %same_house%' AND v_n = 1, v_state);

  -- Invalid contact choices are refused.
  SET LOCAL ROLE authenticated;
  BEGIN
    v_res := public.merge_residents(v_k, v_d, '{"first_name": "duplicate"}'); v_state := 'returned';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
  END;
  RESET ROLE;
  PERFORM pg_temp.p821('unknown contact field refused', v_state = '22023', v_state);

  -- 3. Preview of the real pair.
  SET LOCAL ROLE authenticated;
  v_pv := public.preview_resident_merge(v_k, v_d);
  RESET ROLE;
  PERFORM pg_temp.p821('preview: can merge, no blockers', (v_pv->>'can_merge')::boolean, v_pv->>'blockers');
  PERFORM pg_temp.p821('preview: counts',
    (v_pv->'counts'->>'payment_records.resident_id')::int = 2
    AND (v_pv->'counts'->>'invoices.resident_id')::int = 2
    AND (v_pv->'counts'->>'wallet_transactions.wallet_id')::int = 2
    AND (v_pv->'counts'->>'resident_houses.resident_id')::int = 2
    AND (v_pv->'counts'->>'whatsapp_optins.resident_id')::int = 2
    AND (v_pv->'counts'->>'entity_notes.entity_id')::int = 1
    AND (v_pv->'counts'->>'residents.emergency_contact_resident_id')::int = 2,
    v_pv->>'counts');
  PERFORM pg_temp.p821('preview: folds',
    (v_pv->'folds'->>'resident_houses.resident_id')::int = 1
    AND (v_pv->'folds'->>'whatsapp_optins.resident_id')::int = 1
    AND (v_pv->'folds'->>'resident_payment_aliases.resident_id')::int = 1
    AND (v_pv->'folds'->>'notification_preferences.resident_id')::int = 1,
    v_pv->>'folds');
  PERFORM pg_temp.p821('preview: wallets and account balances',
    (v_pv->'wallets'->>'combined_balance')::numeric = 300
    AND (v_pv->'account_balances'->>'kept_closing_balance')::numeric = -50
    AND (v_pv->'account_balances'->>'duplicate_closing_balance')::numeric = 50
    AND (v_pv->'account_balances'->>'combined_closing_balance')::numeric = 0,
    (v_pv->>'wallets') || ' ' || (v_pv->>'account_balances'));
  PERFORM pg_temp.p821('preview: Q2 offer and PIN flags',
    (v_pv->'contact'->>'suggest_duplicate_phone_as_secondary')::boolean
    AND (v_pv->'duplicate'->>'has_whatsapp_pin')::boolean AND NOT (v_pv->'kept'->>'has_whatsapp_pin')::boolean,
    v_pv->>'contact');

  -- 4. The merge.
  SET LOCAL ROLE authenticated;
  BEGIN
    v_res := public.merge_residents(v_k, v_d, '{"phone_secondary": "duplicate_phone_primary"}');
    v_state := 'ok';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.p821('merge runs', v_state = 'ok', coalesce(v_res::text, v_state));
  IF v_state <> 'ok' THEN
    RETURN;
  END IF;

  -- Money: nothing counted twice, nothing lost.
  SELECT balance INTO v_num FROM public.resident_wallets WHERE id = v_kw;
  SELECT count(*) INTO v_n FROM public.resident_wallets WHERE id = v_dw AND balance = 0;
  PERFORM pg_temp.p821('wallet: kept 50 + duplicate 250 = 300, duplicate wallet kept at 0 (Q6)',
                       v_num = 300 AND v_n = 1, 'kept ' || v_num);
  SELECT string_agg(t.balance_after::text || '/' || t.amount::text, ' ' ORDER BY t.created_at, t.id), count(*)
    INTO v_txt, v_n FROM public.wallet_transactions t WHERE t.wallet_id = v_kw;
  PERFORM pg_temp.p821('wallet: running balance recomputed in time order (balance_after/amount)',
                       v_txt = '200.00/200.00 250.00/50.00 300.00/50.00 300.00/0.00' AND v_n = 4, v_txt);
  SELECT count(*), coalesce(sum(t.amount), 0) INTO v_n, v_num FROM public.wallet_transactions t
   WHERE t.reference_type = 'resident_merge' AND t.reference_id = (v_res->>'merge_id')::uuid;
  SELECT count(*) INTO v_m FROM public.wallet_transactions t WHERE t.wallet_id = v_dw;
  PERFORM pg_temp.p821('wallet: one zero-amount explanation row on each side, nothing else left on the duplicate wallet',
                       v_n = 2 AND v_num = 0 AND v_m = 1, v_n || ' markers, sum ' || v_num || ', duplicate rows ' || v_m);
  SELECT b.closing_balance, b.awaiting_verification INTO v_num, v_state
    FROM public.resident_account_balance(v_k, NULL, DATE '1900-01-01', DATE '2999-12-31') b;
  PERFORM pg_temp.p821('account balance: kept -50 + duplicate 50 = 0, awaiting 100 (no double count)',
    v_num = (v_before->>'kept_closing_balance')::numeric + (v_before->>'duplicate_closing_balance')::numeric
    AND v_num = 0 AND v_state::numeric = 100,
    'closing ' || v_num || ', awaiting ' || v_state);
  SELECT b.closing_balance INTO v_num FROM public.resident_account_balance(v_d, NULL, DATE '1900-01-01', DATE '2999-12-31') b;
  PERFORM pg_temp.p821('account balance: duplicate is 0', v_num = 0, v_num::text);
  SELECT count(*), sum(amount) INTO v_n, v_num FROM public.payment_records WHERE resident_id = v_k;
  SELECT count(*) INTO v_m FROM public.payment_records WHERE resident_id = v_d;
  PERFORM pg_temp.p821('payments: 3 rows, 1500 in total, all on the kept record', v_n = 3 AND v_num = 1500 AND v_m = 0,
                       v_n || ' rows, ' || v_num || ', duplicate ' || v_m);
  SELECT count(*), sum(amount_due) INTO v_n, v_num FROM public.invoices WHERE resident_id = v_k;
  SELECT count(*) INTO v_m FROM public.invoices WHERE resident_id = v_d;
  PERFORM pg_temp.p821('invoices: 3 rows, 1800 due (void included), all on the kept record', v_n = 3 AND v_num = 1800 AND v_m = 0,
                       v_n || ' rows, ' || v_num || ', duplicate ' || v_m);

  -- Nothing left on the duplicate, counted independently of the function.
  v_txt := '';
  FOR v_ref IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname::text AS col
      FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = 'public.residents'::regclass
  LOOP
    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', v_ref.tbl, v_ref.col) INTO v_n USING v_d;
    IF v_n > 0 AND v_ref.tbl || '.' || v_ref.col NOT IN ('resident_wallets.resident_id', 'resident_merges.merged_resident_id') THEN
      v_txt := v_txt || v_ref.tbl || '.' || v_ref.col || '=' || v_n || ' ';
    END IF;
  END LOOP;
  SELECT count(*) INTO v_n FROM public.entity_notes WHERE entity_type = 'resident' AND entity_id = v_d;
  IF v_n > 0 THEN v_txt := v_txt || 'entity_notes=' || v_n; END IF;
  PERFORM pg_temp.p821('no row left on the duplicate (except its emptied wallet and the merge row)', v_txt = '', nullif(v_txt, ''));

  -- Houses (Q3 fold): K keeps its H1 tenancy, gains D's H2 link; D's ended H1 link is dropped.
  SELECT string_agg(h.short_name || ':' || rh.resident_role || ':' || rh.is_active, ' ' ORDER BY h.short_name) INTO v_txt
    FROM public.resident_houses rh JOIN public.houses h ON h.id = rh.house_id WHERE rh.resident_id = v_k;
  PERFORM pg_temp.p821('house links: H1 tenant kept, H2 owner moved, ended duplicate H1 link dropped',
                       v_txt = 'P821' || v_tag || 'A:tenant:true P821' || v_tag || 'B:non_resident_landlord:true', v_txt);

  -- Q5: the lone PIN is cleared, not copied.
  SELECT count(*) INTO v_n FROM public.residents
   WHERE id = v_d AND whatsapp_pin_hash IS NULL AND whatsapp_pin_set_at IS NULL AND whatsapp_pin_failed_attempts = 0;
  SELECT count(*) INTO v_m FROM public.residents WHERE id = v_k AND whatsapp_pin_hash IS NULL;
  PERFORM pg_temp.p821('Q5: duplicate PIN cleared and not copied to the kept record',
                       v_n = 1 AND v_m = 1 AND (v_res->>'whatsapp_pin_cleared')::boolean, v_res->>'whatsapp_pin_cleared');
  SELECT count(*) INTO v_n FROM public.whatsapp_sessions WHERE phone_number = v_ps AND resident_id = v_k AND NOT pin_authenticated;
  SELECT count(*) INTO v_m FROM public.verification_tokens WHERE resident_id = v_k AND expires_at <= now();
  PERFORM pg_temp.p821('Q5: session moved without PIN authentication, unused code expired', v_n = 1 AND v_m = 1, v_n || ', ' || v_m);

  -- Q7: the later opt-in wins; the consent log moves whole.
  SELECT count(*) INTO v_n FROM public.whatsapp_optins
   WHERE resident_id = v_k AND phone_number = v_ps AND opted_in AND opted_in_at = v_dup_optin_at
     AND opted_out_at IS NULL AND link_verified_at IS NOT NULL AND deactivated_at IS NULL;
  SELECT count(*) INTO v_m FROM public.whatsapp_optins WHERE phone_number IN (v_ps, v_po);
  PERFORM pg_temp.p821('Q7: shared phone holds the later decision (opted in); 2 opt-in rows remain, both on the kept record',
    v_n = 1 AND v_m = 2 AND NOT EXISTS (SELECT 1 FROM public.whatsapp_optins WHERE resident_id = v_d),
    v_n || ' winner, ' || v_m || ' rows');
  SELECT count(*) INTO v_n FROM public.whatsapp_consent_decisions WHERE resident_id = v_k;
  PERFORM pg_temp.p821('Q7: consent decisions moved whole', v_n = 2, v_n::text);

  -- Folds and other moves.
  SELECT count(*) INTO v_n FROM public.resident_payment_aliases WHERE resident_id = v_k;
  SELECT count(*) INTO v_m FROM public.notification_preferences WHERE resident_id = v_k;
  PERFORM pg_temp.p821('folds: 2 aliases and 2 preferences on the kept record', v_n = 2 AND v_m = 2, v_n || ', ' || v_m);
  SELECT count(*) INTO v_n FROM public.residents WHERE id = v_o AND emergency_contact_resident_id = v_k;
  SELECT count(*) INTO v_m FROM public.residents WHERE id = v_k AND emergency_contact_resident_id IS NULL;
  PERFORM pg_temp.p821('emergency contacts: others re-pointed, the kept record no longer names itself', v_n = 1 AND v_m = 1, v_n || ', ' || v_m);
  SELECT count(*) INTO v_n FROM public.entity_notes WHERE entity_type = 'resident' AND entity_id = v_k;
  PERFORM pg_temp.p821('notes moved', v_n = 1, v_n::text);

  -- The duplicate is archived and points at the kept record; Q2 contact choice applied.
  SELECT count(*) INTO v_n FROM public.residents
   WHERE id = v_d AND account_status = 'archived' AND merged_into_resident_id = v_k AND profile_id IS NULL;
  SELECT count(*) INTO v_m FROM public.residents
   WHERE id = v_k AND phone_secondary = v_dphone AND phone_primary = v_kphone
     AND email = 'probe-kept-' || lower(v_tag) || '@example.test' AND account_status = 'active';
  PERFORM pg_temp.p821('duplicate archived with merged_into; Q2 phone_secondary taken from the duplicate, the rest kept',
                       v_n = 1 AND v_m = 1, v_n || ', ' || v_m);

  -- Q9: the snapshot is complete.
  SELECT m.snapshot, m.counts INTO v_snap, v_counts FROM public.resident_merges m
   WHERE m.id = (v_res->>'merge_id')::uuid AND m.kept_resident_id = v_k AND m.merged_resident_id = v_d AND m.merged_by = v_admin;
  v_ok := v_snap IS NOT NULL;
  v_txt := '';
  IF v_ok THEN
    FOR v_key IN SELECT jsonb_object_keys(v_counts->'moved') LOOP
      IF jsonb_array_length(coalesce(v_snap->'moved'->v_key, '[]'::jsonb)) <> (v_counts->'moved'->>v_key)::int THEN
        v_ok := false; v_txt := v_txt || 'moved ' || v_key || ' ';
      END IF;
    END LOOP;
    FOR v_key IN SELECT jsonb_object_keys(v_counts->'folded') LOOP
      CONTINUE WHEN v_key = 'residents.emergency_contact_resident_id';
      -- Dropped resident_houses rows include the kept record's replaced links.
      v_m := (v_counts->'folded'->>v_key)::int;
      IF v_key = 'resident_houses.resident_id' THEN
        v_m := v_m + coalesce((v_counts->'replaced_kept_rows'->>'resident_houses')::int, 0);
      END IF;
      IF jsonb_array_length(coalesce(v_snap->'folded'->split_part(v_key, '.', 1), '[]'::jsonb)) <> v_m THEN
        v_ok := false; v_txt := v_txt || 'folded ' || v_key || ' ';
      END IF;
    END LOOP;
    v_ok := v_ok
      AND NOT (v_snap->'kept_before' ? 'whatsapp_pin_hash') AND NOT (v_snap->'duplicate_before' ? 'whatsapp_pin_hash')
      AND (v_snap->'duplicate_before'->>'id')::uuid = v_d
      AND (v_snap->'wallets'->>'combined')::boolean
      AND jsonb_typeof(v_snap->'wallets'->'old_balance_after') = 'object'
      AND jsonb_array_length(v_snap->'moved'->'payment_records.resident_id') = 2
      AND jsonb_array_length(v_snap->'folded'->'whatsapp_optins') = 1
      AND jsonb_array_length(v_snap->'updated'->'whatsapp_optins') = 1;
  END IF;
  PERFORM pg_temp.p821('Q9: resident_merges row and a complete snapshot', v_ok, nullif(v_txt, ''));

  -- After the merge: already_merged, and a second merge is refused.
  SET LOCAL ROLE authenticated;
  v_pv := public.preview_resident_merge(v_k, v_d);
  BEGIN
    v_res := public.merge_residents(v_k, v_d, '{}'); v_state := 'returned';
  EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE || ' ' || SQLERRM;
  END;
  RESET ROLE;
  PERFORM pg_temp.p821('blocker: already_merged; a second merge is refused',
                       v_pv->'blockers' @> '[{"code": "already_merged"}]' AND v_state LIKE 'P0001 %already_merged%', v_state);

  -- Q4: a login on the duplicate only moves to the kept record before the duplicate is archived,
  -- so residents_remove_admin_roles finds no profile on it and the role survives.
  SELECT p.id, p.role_id INTO v_login_p, v_login_role FROM public.profiles p
   WHERE p.resident_id IS NULL AND p.approval_status = 'active' AND p.id <> v_admin
   ORDER BY p.id LIMIT 1;
  IF v_login_p IS NULL THEN
    PERFORM pg_temp.p821('Q4: the duplicate''s login moves, its role kept', NULL, 'SKIP: no active profile without a resident');
  ELSE
    BEGIN
      INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'L1 ' || v_tag, '+2340000000010') RETURNING id INTO v_l1;
      INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'L2 ' || v_tag, '+2340000000011') RETURNING id INTO v_l2;
      UPDATE public.profiles SET resident_id = v_l2 WHERE id = v_login_p;
      UPDATE public.residents SET profile_id = v_login_p WHERE id = v_l2;
      SET LOCAL ROLE authenticated;
      v_res := public.merge_residents(v_l1, v_l2, '{}');
      RESET ROLE;
      SELECT count(*) INTO v_n FROM public.profiles
       WHERE id = v_login_p AND resident_id = v_l1 AND role_id IS NOT DISTINCT FROM v_login_role;
      SELECT count(*) INTO v_m FROM public.residents r1 JOIN public.residents r2 ON r2.id = v_l2
       WHERE r1.id = v_l1 AND r1.profile_id = v_login_p AND r2.profile_id IS NULL;
      PERFORM pg_temp.p821('Q4: the duplicate''s login moves, its role kept', v_n = 1 AND v_m = 1, v_n || ', ' || v_m);
    EXCEPTION WHEN OTHERS THEN
      RESET ROLE;
      PERFORM pg_temp.p821('Q4: the duplicate''s login moves, its role kept', false, SQLSTATE || ' ' || SQLERRM);
    END;
  END IF;

  -- Migration C: new money for the archived record is refused.
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'payment_records_refuse_merged_resident') THEN
    PERFORM pg_temp.p821('guard: insert for a merged resident refused', NULL, 'SKIP: 20261024100200 not pasted');
  ELSE
    BEGIN
      INSERT INTO public.payment_records (resident_id, amount, status) VALUES (v_d, 1, 'pending'); v_state := 'inserted';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE;
    END;
    BEGIN
      INSERT INTO public.wallet_transactions (wallet_id, type, amount, balance_after) VALUES (v_dw, 'credit', 1, 1); v_txt := 'inserted';
    EXCEPTION WHEN OTHERS THEN v_txt := SQLSTATE;
    END;
    PERFORM pg_temp.p821('guard: payment and wallet row for the merged resident refused (23503)',
                         v_state = '23503' AND v_txt = '23503', v_state || ', ' || v_txt);
  END IF;

  -- The run-time safety net: an unknown foreign key holding a duplicate row blocks the merge.
  -- A real table, because a temporary table cannot reference residents; the probe rolls it back.
  BEGIN
    CREATE TABLE public.probe_821_unknown_ref (resident_id uuid REFERENCES public.residents(id));
    INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'R5 ' || v_tag, '+2340000000008') RETURNING id INTO v_r5;
    INSERT INTO public.residents (first_name, last_name, phone_primary) VALUES ('Probe', 'R6 ' || v_tag, '+2340000000009') RETURNING id INTO v_r6;
    INSERT INTO public.probe_821_unknown_ref VALUES (v_r6);
    SET LOCAL ROLE authenticated;
    v_pv := public.preview_resident_merge(v_r5, v_r6);
    BEGIN
      v_res := public.merge_residents(v_r5, v_r6, '{}'); v_state := 'returned';
    EXCEPTION WHEN OTHERS THEN v_state := SQLSTATE || ' ' || SQLERRM;
    END;
    RESET ROLE;
    PERFORM pg_temp.p821('unknown reference: blocker unhandled_reference, merge refused',
                         v_pv->'blockers' @> '[{"code": "unhandled_reference"}]' AND v_state LIKE 'P0001 %unhandled_reference%', v_state);
  EXCEPTION WHEN OTHERS THEN
    RESET ROLE;
    PERFORM pg_temp.p821('unknown reference: blocker unhandled_reference, merge refused', false, SQLSTATE || ' ' || SQLERRM);
  END;
END;
$probe$;

SELECT n, check_name, CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END AS result, detail
  FROM probe_821 ORDER BY n;

-- Repeats the report as an error, so a client that shows only the last statement still sees it,
-- and so nothing can be committed even if the ROLLBACK below is dropped.
DO $$
DECLARE v_report text;
BEGIN
  SELECT string_agg(n || ' ' || CASE WHEN ok IS NULL THEN 'SKIP' WHEN ok THEN 'PASS' ELSE 'FAIL' END || ' ' || check_name
                    || coalesce(' [' || detail || ']', ''), E'\n' ORDER BY n)
    INTO v_report FROM probe_821;
  RAISE EXCEPTION E'probe 821 rolled back (% FAIL of % checks)\n%',
    (SELECT count(*) FROM probe_821 WHERE ok IS FALSE), (SELECT count(*) FROM probe_821), v_report;
END;
$$;

ROLLBACK;
