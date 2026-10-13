-- Rolled-back probe for #215 (get_dashboard_payment_metrics). NOT executed by the branch author.
-- Run on Residio_Stage AFTER applying 20261013100000_dashboard_payment_metrics.sql.
-- The block creates its own fixtures and ends in RAISE EXCEPTION, so nothing is ever committed.
-- Read the NOTICE lines: every line must start with PASS.
--
-- Identities: needs one existing ACTIVE profile whose role holds payments.update (the permission
-- the payment_records RLS policy keys on; a finance/wallet-manager/admin profile) and any resident.
--
-- Boundary month is February 2031 (far from real data, 28 days): fixtures sit on 2031-02-01 and
-- 2031-02-28 (both must count), 2031-01-31 and 2031-03-01 (must not), a verified and an unverified
-- row in the month, and non-paid rows (must never count). The collected metric is therefore
-- compared as an exact delta of the fixtures; the all-time unverified metric is compared against a
-- direct SUM/COUNT with the same filters, run as the same caller, before and after the fixtures.

DO $$
DECLARE
  caller uuid; res uuid;
  m jsonb; d_cnt bigint; d_tot numeric;
  base_unv_cnt bigint; base_unv_tot numeric;
  after_unv_cnt bigint; after_unv_tot numeric;
BEGIN
  SELECT p.id INTO caller
    FROM public.profiles p
    JOIN public.role_permissions rp ON rp.role_id = p.role_id
    JOIN public.app_permissions ap ON ap.id = rp.permission_id
   WHERE p.approval_status = 'active' AND ap.name = 'payments.update' AND ap.is_active
   LIMIT 1;
  SELECT id INTO res FROM public.residents LIMIT 1;

  IF caller IS NULL OR res IS NULL THEN
    RAISE NOTICE 'SKIP: need an active profile holding payments.update and one resident';
    RAISE EXCEPTION 'probe 215 rolled back';
  END IF;

  -- Baseline unverified, as the caller, via a direct query with the action's old filters.
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',caller)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT count(*), COALESCE(sum(amount), 0) INTO base_unv_cnt, base_unv_tot
    FROM public.payment_records WHERE is_verified = false AND status = 'paid';
  RESET ROLE;

  -- Fixtures (as the migration owner).
  INSERT INTO public.payment_records (resident_id, amount, payment_date, status, is_verified) VALUES
    (res, 100.10, '2031-02-01', 'paid',    true),   -- first day, verified    : collected
    (res, 200.20, '2031-02-28', 'paid',    false),  -- last day, unverified    : collected + unverified
    (res, 300.30, '2031-02-14', 'paid',    false),  -- mid month, unverified   : collected + unverified
    (res,  50.00, '2031-01-31', 'paid',    false),  -- previous month          : unverified only
    (res,  60.00, '2031-03-01', 'paid',    true),   -- next month              : neither
    (res,  70.00, '2031-02-10', 'pending', false),  -- not paid                : neither
    (res,  80.00, '2031-02-11', 'failed',  false);  -- not paid                : neither

  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',caller)::text, true);
  SET LOCAL ROLE authenticated;

  SELECT public.get_dashboard_payment_metrics('2031-02-01', '2031-02-28') INTO m;

  SELECT count(*), COALESCE(sum(amount), 0) INTO d_cnt, d_tot
    FROM public.payment_records
   WHERE status = 'paid' AND payment_date >= '2031-02-01' AND payment_date <= '2031-02-28';
  RAISE NOTICE '% collected matches direct query (rpc % / %, direct % / %)',
    CASE WHEN (m->>'collected_count')::bigint = d_cnt AND (m->>'collected_total')::numeric = d_tot THEN 'PASS' ELSE 'FAIL' END,
    m->>'collected_count', m->>'collected_total', d_cnt, d_tot;

  RAISE NOTICE '% collected = 3 rows / 600.60 (first day, last day, mid month; neighbours and non-paid excluded)',
    CASE WHEN (m->>'collected_count')::bigint = 3 AND (m->>'collected_total')::numeric = 600.60 THEN 'PASS' ELSE 'FAIL' END;

  -- verified_total: is_verified OR import_id OR email_import_id (the enhanced dashboard's
  -- definition). Fixture rows have no import ids, so only the is_verified rows (100.10 in window)
  -- count; compare against a direct SUM with the same predicate.
  SELECT COALESCE(sum(amount), 0) INTO d_tot
    FROM public.payment_records
   WHERE status = 'paid' AND payment_date >= '2031-02-01' AND payment_date <= '2031-02-28'
     AND (is_verified = true OR import_id IS NOT NULL OR email_import_id IS NOT NULL);
  RAISE NOTICE '% verified_total matches direct query and equals 100.10 (rpc %, direct %)',
    CASE WHEN (m->>'verified_total')::numeric = d_tot AND d_tot = 100.10 THEN 'PASS' ELSE 'FAIL' END,
    m->>'verified_total', d_tot;

  SELECT count(*), COALESCE(sum(amount), 0) INTO after_unv_cnt, after_unv_tot
    FROM public.payment_records WHERE is_verified = false AND status = 'paid';
  RAISE NOTICE '% unverified matches direct query (rpc % / %, direct % / %)',
    CASE WHEN (m->>'unverified_count')::bigint = after_unv_cnt AND (m->>'unverified_total')::numeric = after_unv_tot THEN 'PASS' ELSE 'FAIL' END,
    m->>'unverified_count', m->>'unverified_total', after_unv_cnt, after_unv_tot;

  RAISE NOTICE '% unverified delta over baseline = 3 rows / 550.50 (all-time, no date bound; verified and non-paid excluded)',
    CASE WHEN after_unv_cnt - base_unv_cnt = 3 AND after_unv_tot - base_unv_tot = 550.50 THEN 'PASS' ELSE 'FAIL' END;

  -- A different month sees none of the February fixtures in the collected metric.
  SELECT public.get_dashboard_payment_metrics('2031-04-01', '2031-04-30') INTO m;
  RAISE NOTICE '% empty month collects nothing',
    CASE WHEN (m->>'collected_count')::bigint = 0 AND (m->>'collected_total')::numeric = 0 THEN 'PASS' ELSE 'FAIL' END;

  RESET ROLE;

  -- anon must not be able to execute.
  BEGIN
    SET LOCAL ROLE anon;
    PERFORM public.get_dashboard_payment_metrics('2031-02-01', '2031-02-28');
    RESET ROLE;
    RAISE NOTICE 'FAIL anon can execute the function';
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RAISE NOTICE 'PASS anon is refused';
  END;

  RAISE EXCEPTION 'probe 215 rolled back (read the NOTICE lines above)';
END $$;
