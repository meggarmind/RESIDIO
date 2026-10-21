-- Rolled-back access-delta probe for #956. NOT executed by the branch author.
-- Run on Residio_Stage BEFORE applying the migrations it tests, as the migration owner, in ONE
-- transaction:
--   part 1: 20261023100000..20261023100600 rls_merge_permissive_* (applied to Stage; expect no
--           difference for any subject);
--   part 2: 20261023100700..20261023100800 rls_rescope_merge_* (owner decision 2026-10-21,
--           option A). Expect no difference for any role:* subject or for resident. Every anon
--           row is a change to report, table by table; read houses select first. The 'before'
--           rows for anon are today's anon access on each table.
--
-- 1. Captures, for anon, one active profile per app role and one resident, how many rows each
--    touched table returns to SELECT, and how many rows an UPDATE and a DELETE would reach
--    (each write is undone at once by a subtransaction; any error is recorded by SQLSTATE).
-- 2. Applies the migration bodies (paste them at the marker, without their own BEGIN/COMMIT).
-- 3. Captures again and lists every difference. Zero rows = zero access delta (part 2: zero rows
--    other than subject anon).
-- 4. ROLLBACK. Nothing is committed.
--
-- INSERT is not probed here: no generic INSERT exercises a WITH CHECK. The WITH CHECK
-- equivalence is proved structurally by src/__tests__/rls-permissive-policy-merge-956.test.ts.
-- Run one table group at a time if the whole set is too slow.

BEGIN;

CREATE TEMP TABLE probe_956 (phase text, subject text, tbl text, op text, result text);

CREATE FUNCTION pg_temp.probe_956(p_phase text) RETURNS void LANGUAGE plpgsql AS $probe$
DECLARE
  v_tables CONSTANT text[] := ARRAY[
    'access_codes', 'security_contacts',
    'announcement_categories', 'announcement_read_receipts', 'announcements', 'message_templates',
    'notification_preferences', 'recipient_group_members', 'recipient_groups', 'report_subscriptions',
    'billing_items', 'billing_profiles', 'estate_bank_accounts', 'payment_records', 'wallet_transactions',
    'budgets', 'expense_categories', 'expenses', 'petty_cash_accounts', 'project_milestones', 'projects', 'vendors',
    'document_categories', 'document_custom_field_values', 'document_custom_fields', 'document_tags',
    'approval_requests', 'hierarchical_settings', 'impersonation_sessions', 'profiles', 'role_assignment_rules',
    'two_factor_audit_log',
    'resident_houses', 'residents',
    -- part 2 (resident_houses, residents and wallet_transactions are listed above)
    'houses', 'invoices', 'invoice_items', 'resident_wallets', 'paystack_transactions',
    'wallet_payment_batches', 'wallet_payment_batch_items'];
  s record; t text; op text; n bigint; res text;
BEGIN
  FOR s IN
    SELECT 'anon' AS subject, NULL::uuid AS sub
    UNION ALL
    SELECT DISTINCT ON (r.name) 'role:' || r.name, p.id
      FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
     WHERE p.approval_status = 'active'
    UNION ALL
    (SELECT 'resident', rs.profile_id FROM public.residents rs
      WHERE rs.profile_id IS NOT NULL AND rs.account_status = 'active' LIMIT 1)
  LOOP
    FOREACH t IN ARRAY v_tables LOOP
      FOREACH op IN ARRAY ARRAY['select', 'update', 'delete'] LOOP
        BEGIN
          PERFORM set_config('request.jwt.claims', CASE WHEN s.sub IS NULL THEN '{"role":"anon"}'
            ELSE json_build_object('role', 'authenticated', 'sub', s.sub)::text END, true);
          EXECUTE format('SET LOCAL ROLE %I', CASE WHEN s.sub IS NULL THEN 'anon' ELSE 'authenticated' END);
          IF op = 'select' THEN
            EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
          ELSIF op = 'update' THEN
            EXECUTE format('UPDATE public.%I SET id = id', t);
            GET DIAGNOSTICS n = ROW_COUNT;
          ELSE
            EXECUTE format('DELETE FROM public.%I', t);
            GET DIAGNOSTICS n = ROW_COUNT;
          END IF;
          RAISE EXCEPTION USING ERRCODE = 'P0956', MESSAGE = n::text; -- undo the write
        EXCEPTION
          WHEN SQLSTATE 'P0956' THEN res := SQLERRM;
          WHEN OTHERS THEN res := 'error ' || SQLSTATE;
        END;
        RESET ROLE;
        INSERT INTO probe_956 VALUES (p_phase, s.subject, t, op, res);
      END LOOP;
    END LOOP;
  END LOOP;
END
$probe$;

SELECT pg_temp.probe_956('before');

-- ===== paste the migration bodies here (everything between their BEGIN; and COMMIT;) =====

SELECT pg_temp.probe_956('after');

-- Every difference between the phases. Expect zero rows (part 2: only subject anon).
SELECT coalesce(b.subject, a.subject) AS subject, coalesce(b.tbl, a.tbl) AS tbl, coalesce(b.op, a.op) AS op,
       b.result AS before, a.result AS after
  FROM (SELECT * FROM probe_956 WHERE phase = 'before') b
  FULL JOIN (SELECT * FROM probe_956 WHERE phase = 'after') a USING (subject, tbl, op)
 WHERE b.result IS DISTINCT FROM a.result;

-- Coverage: rows probed per phase (equal counts; subjects = anon + roles + resident).
SELECT phase, count(DISTINCT subject) AS subjects, count(*) AS probes FROM probe_956 GROUP BY phase;

-- anon, before and after, on the part 2 tables (the owner asked for each table to be reported).
SELECT b.tbl, b.op, b.result AS before, a.result AS after
  FROM (SELECT * FROM probe_956 WHERE phase = 'before' AND subject = 'anon') b
  JOIN (SELECT * FROM probe_956 WHERE phase = 'after' AND subject = 'anon') a USING (tbl, op)
 WHERE b.tbl IN ('houses', 'invoices', 'invoice_items', 'resident_wallets', 'paystack_transactions',
                 'wallet_payment_batches', 'wallet_payment_batch_items', 'residents',
                 'resident_houses', 'wallet_transactions')
 ORDER BY b.tbl, b.op;

ROLLBACK;

-- Cost evidence (#63 rule): in a separate transaction, run each representative query as an
-- admin and as a resident, once before and once after pasting the migration bodies, then
-- ROLLBACK. Compare execution time and buffers.
--
--   BEGIN;
--   SELECT set_config('request.jwt.claims', json_build_object('role','authenticated','sub','<profile id>')::text, true);
--   SET LOCAL ROLE authenticated;
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.residents;
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.security_contacts;
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.wallet_transactions;
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.houses;          -- part 2
--   EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.invoices;        -- part 2
--   RESET ROLE;
--   -- paste the migration bodies, then repeat the EXPLAINs as the same subject
--   ROLLBACK;
