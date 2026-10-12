-- Rolled-back probe for #471 and #473. NOT executed by the branch author.
-- Run on Residio_Stage (then Prod) AFTER applying
--   20261012200000_drop_forged_insert_policies.sql
--   20261012200100_late_fee_waivers_maker_checker.sql
-- Each block raises at the end, so nothing is ever committed. Read the NOTICE
-- lines; every line must say PASS. 23502 (NOT NULL) or any success means the
-- insert got past RLS = FAIL.

-- #471: anon and a profile-less signed-in user must get 42501 on all three tables.
DO $$
DECLARE
  r text; t text; res text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
    PERFORM set_config('request.jwt.claims',
      CASE WHEN r = 'anon' THEN '{"role":"anon"}'
           ELSE '{"role":"authenticated","sub":"00000000-0000-0000-0000-00000000dead"}' END, true);
    EXECUTE format('SET LOCAL ROLE %I', r);
    FOREACH t IN ARRAY ARRAY['audit_logs','late_fee_log','invoice_generation_log'] LOOP
      BEGIN
        -- Empty column list: any NOT NULL violation (23502) means RLS passed.
        EXECUTE format('INSERT INTO public.%I DEFAULT VALUES', t);
        res := 'FAIL (insert succeeded)';
      EXCEPTION
        WHEN insufficient_privilege THEN res := 'PASS (42501)';
        WHEN OTHERS THEN res := 'FAIL (' || SQLSTATE || ')';
      END;
      RAISE NOTICE '% as %: %', t, r, res;
    END LOOP;
    RESET ROLE;
  END LOOP;
  RAISE EXCEPTION 'probe 471 rolled back';
END $$;

-- #473: a request-only holder (financial_officer) must not approve a waiver.
-- Needs one existing late_fee_waivers row and one financial_officer profile.
DO $$
DECLARE
  fo uuid; w uuid; n int;
BEGIN
  SELECT p.id INTO fo FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
   WHERE r.name = 'financial_officer' LIMIT 1;
  SELECT id INTO w FROM public.late_fee_waivers WHERE status = 'pending' LIMIT 1;
  IF fo IS NULL OR w IS NULL THEN
    RAISE NOTICE 'SKIP 473: need a financial_officer profile and a pending waiver'; 
    RAISE EXCEPTION 'probe 473 rolled back';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',fo)::text, true);
  SET LOCAL ROLE authenticated;
  UPDATE public.late_fee_waivers SET status = 'approved' WHERE id = w;
  GET DIAGNOSTICS n = ROW_COUNT;
  -- USING filters the row out for a non-approver: 0 rows updated = PASS.
  RAISE NOTICE 'financial_officer approve: % rows updated (expect 0)', n;
  RESET ROLE;
  RAISE EXCEPTION 'probe 473 rolled back';
END $$;

-- #473 positive blocks. Fixtures (one waiver row) are created inside each block
-- as the migration owner, then the role is switched. Needs: a financial_officer
-- profile (maker), a chairman/super_admin profile (approver), and any invoice.
-- Every block ends in RAISE EXCEPTION, so the fixture is rolled back.

-- (a) approver who is NOT the requester: approve updates 1 row; and (b) the same
-- approver cannot re-point requested_by (trigger, 42501).
DO $$
DECLARE
  fo uuid; ap uuid; inv record; w uuid; n int;
BEGIN
  SELECT p.id INTO fo FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
   WHERE r.name = 'financial_officer' LIMIT 1;
  SELECT p.id INTO ap FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
   WHERE r.name IN ('chairman','super_admin') LIMIT 1;
  SELECT id, resident_id INTO inv FROM public.invoices LIMIT 1;
  IF fo IS NULL OR ap IS NULL OR inv.id IS NULL THEN
    RAISE NOTICE 'SKIP 473 (a,b): fixtures missing'; RAISE EXCEPTION 'probe rolled back';
  END IF;
  INSERT INTO public.late_fee_waivers
    (invoice_id, resident_id, requested_by, reason, waiver_type, original_late_fee, status)
  VALUES (inv.id, inv.resident_id, fo, 'probe', 'full', 100, 'pending') RETURNING id INTO w;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',ap)::text, true);
  SET LOCAL ROLE authenticated;

  BEGIN
    UPDATE public.late_fee_waivers SET requested_by = ap WHERE id = w;
    RAISE NOTICE '(b) FAIL: requested_by changed';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '(b) PASS: requested_by change refused (42501)';
  END;

  UPDATE public.late_fee_waivers SET status = 'approved' WHERE id = w;
  GET DIAGNOSTICS n = ROW_COUNT;
  RAISE NOTICE '(a) approver-not-requester approve: % rows (expect 1)', n;
  RESET ROLE;
  RAISE EXCEPTION 'probe rolled back';
END $$;

-- (c) approver who IS the requester gets 42501 setting approved.
DO $$
DECLARE
  ap uuid; inv record; w uuid;
BEGIN
  SELECT p.id INTO ap FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
   WHERE r.name IN ('chairman','super_admin') LIMIT 1;
  SELECT id, resident_id INTO inv FROM public.invoices LIMIT 1;
  IF ap IS NULL OR inv.id IS NULL THEN
    RAISE NOTICE 'SKIP 473 (c): fixtures missing'; RAISE EXCEPTION 'probe rolled back';
  END IF;
  INSERT INTO public.late_fee_waivers
    (invoice_id, resident_id, requested_by, reason, waiver_type, original_late_fee, status)
  VALUES (inv.id, inv.resident_id, ap, 'probe', 'full', 100, 'pending') RETURNING id INTO w;

  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',ap)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    UPDATE public.late_fee_waivers SET status = 'approved' WHERE id = w;
    RAISE NOTICE '(c) FAIL: self-approval succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '(c) PASS: self-approval refused (42501)';
  END;
  RESET ROLE;
  RAISE EXCEPTION 'probe rolled back';
END $$;

-- (d) request-holder INSERT with requested_by = self and status pending succeeds;
-- (e) INSERT as someone else, or already approved, is refused (42501).
DO $$
DECLARE
  fo uuid; other uuid; inv record;
BEGIN
  SELECT p.id INTO fo FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
   WHERE r.name = 'financial_officer' LIMIT 1;
  SELECT id INTO other FROM public.profiles WHERE id <> fo LIMIT 1;
  SELECT id, resident_id INTO inv FROM public.invoices LIMIT 1;
  IF fo IS NULL OR other IS NULL OR inv.id IS NULL THEN
    RAISE NOTICE 'SKIP 473 (d,e): fixtures missing'; RAISE EXCEPTION 'probe rolled back';
  END IF;
  PERFORM set_config('request.jwt.claims',
    json_build_object('role','authenticated','sub',fo)::text, true);
  SET LOCAL ROLE authenticated;

  INSERT INTO public.late_fee_waivers
    (invoice_id, resident_id, requested_by, reason, waiver_type, original_late_fee, status)
  VALUES (inv.id, inv.resident_id, fo, 'probe', 'full', 100, 'pending');
  RAISE NOTICE '(d) PASS: own pending request inserted';

  BEGIN
    INSERT INTO public.late_fee_waivers
      (invoice_id, resident_id, requested_by, reason, waiver_type, original_late_fee, status)
    VALUES (inv.id, inv.resident_id, other, 'probe', 'full', 100, 'pending');
    RAISE NOTICE '(e1) FAIL: inserted as another requester';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '(e1) PASS: requested_by <> caller refused (42501)';
  END;
  BEGIN
    INSERT INTO public.late_fee_waivers
      (invoice_id, resident_id, requested_by, reason, waiver_type, original_late_fee, status)
    VALUES (inv.id, inv.resident_id, fo, 'probe', 'full', 100, 'approved');
    RAISE NOTICE '(e2) FAIL: inserted pre-approved';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE '(e2) PASS: pre-approved insert refused (42501)';
  END;
  RESET ROLE;
  RAISE EXCEPTION 'probe rolled back';
END $$;

-- KNOWN LIMITS (for the PR summary): approval_requests UPDATE policies still allow
-- self-approval through the Data API (enforced in the action layer only), and
-- approvers can edit other late_fee_waivers columns (reason, amounts) in the
-- same UPDATE; only status and requested_by are constrained.
