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

-- Expectation for chairman / super_admin approving a waiver they did not
-- request: 1 row. Approving one they requested: 42501 (WITH CHECK). Repeat the
-- block above with sub = such a user and requested_by = that user to confirm.
