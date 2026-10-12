-- Rolled-back probe for #458 (atomic wallet payment RPCs). NOT executed by the branch author.
-- Run on Residio_Stage AFTER applying 20261012220000_atomic_wallet_payment_rpcs.sql.
-- The block creates its own fixtures (invoices, wallet balances) and ends in RAISE EXCEPTION,
-- so nothing is ever committed. Read the NOTICE lines: every line must start with PASS.
--
-- Identities: needs two existing ACTIVE profiles that have DIFFERENT non-null resident_id and
-- whose role does NOT hold billing.manage_wallets (ordinary resident accounts), plus one active
-- profile that holds billing.manage_wallets (admin). Fixtures are invoices + wallet balances only.

DO $$
DECLARE
  owner_p uuid; owner_r uuid;      -- resident A (the payer)
  other_p uuid; other_r uuid;      -- resident B (must be refused on A's invoices)
  admin_p uuid;
  inv1 uuid; inv2 uuid; inv_bad uuid; inv_b uuid;
  w uuid; res jsonb; msg text; bal numeric; cnt int;
  lo uuid; hi uuid; lo_after numeric; hi_after numeric; lo_amt numeric; hi_amt numeric;
  bal_before numeric;
BEGIN
  SELECT p.id, p.resident_id INTO owner_p, owner_r
    FROM public.profiles p
   WHERE p.approval_status = 'active' AND p.resident_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                       JOIN public.app_permissions ap ON ap.id = rp.permission_id
                      WHERE rp.role_id = p.role_id AND ap.name = 'billing.manage_wallets' AND ap.is_active)
   LIMIT 1;
  SELECT p.id, p.resident_id INTO other_p, other_r
    FROM public.profiles p
   WHERE p.approval_status = 'active' AND p.resident_id IS NOT NULL AND p.resident_id <> owner_r
     AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp
                       JOIN public.app_permissions ap ON ap.id = rp.permission_id
                      WHERE rp.role_id = p.role_id AND ap.name = 'billing.manage_wallets' AND ap.is_active)
   LIMIT 1;
  SELECT p.id INTO admin_p
    FROM public.profiles p
    JOIN public.role_permissions rp ON rp.role_id = p.role_id
    JOIN public.app_permissions ap ON ap.id = rp.permission_id
   WHERE p.approval_status = 'active' AND ap.name = 'billing.manage_wallets' AND ap.is_active
   LIMIT 1;

  IF owner_p IS NULL OR other_p IS NULL OR admin_p IS NULL THEN
    RAISE NOTICE 'SKIP: need two resident profiles with different resident_id and one wallet manager';
    RAISE EXCEPTION 'probe 458 rolled back';
  END IF;

  -- Fixtures (as the migration owner): wallet for A with balance 100.00, three payable invoices
  -- for A (30.00, 50.00, 500.00) and one invoice for B.
  INSERT INTO public.resident_wallets (resident_id, balance) VALUES (owner_r, 0)
    ON CONFLICT (resident_id) DO NOTHING;
  UPDATE public.resident_wallets SET balance = 100 WHERE resident_id = owner_r RETURNING id INTO w;

  INSERT INTO public.invoices (resident_id, invoice_number, amount_due, amount_paid, status, due_date)
    VALUES (owner_r, 'PROBE458-' || gen_random_uuid(), 30, 0, 'unpaid', current_date) RETURNING id INTO inv1;
  INSERT INTO public.invoices (resident_id, invoice_number, amount_due, amount_paid, status, due_date)
    VALUES (owner_r, 'PROBE458-' || gen_random_uuid(), 50, 0, 'unpaid', current_date) RETURNING id INTO inv2;
  INSERT INTO public.invoices (resident_id, invoice_number, amount_due, amount_paid, status, due_date)
    VALUES (owner_r, 'PROBE458-' || gen_random_uuid(), 500, 0, 'unpaid', current_date) RETURNING id INTO inv_bad;
  INSERT INTO public.invoices (resident_id, invoice_number, amount_due, amount_paid, status, due_date)
    VALUES (other_r, 'PROBE458-' || gen_random_uuid(), 40, 0, 'unpaid', current_date) RETURNING id INTO inv_b;

  -- 1. Another resident cannot pay A's invoice (expect 42501, nothing changes).
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',other_p)::text, true);
  SET LOCAL ROLE authenticated;
  BEGIN
    res := public.pay_invoice_with_wallet(inv1, 10);
    RAISE NOTICE 'FAIL 1 other resident paid owner invoice: %', res;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 1 other resident refused (42501)';
  END;
  BEGIN
    res := public.pay_invoices_with_wallet(jsonb_build_array(jsonb_build_object('invoice_id', inv1)));
    RAISE NOTICE 'FAIL 1b other resident bulk-paid owner invoice: %', res;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 1b other resident bulk refused (42501)';
  END;
  BEGIN
    res := public.reverse_invoice_payment_allocation(inv1, 1);
    RAISE NOTICE 'FAIL 1c non-admin reversed an allocation: %', res;
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS 1c non-admin reverse refused (42501)';
  END;
  RESET ROLE;

  -- Owner session for the rest.
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',owner_p)::text, true);
  SET LOCAL ROLE authenticated;

  -- 2. amount > wallet balance (200 > 100) and 3. overpay (40 > 30 remaining) are rejected with no writes.
  res := public.pay_invoice_with_wallet(inv_bad, 200);
  RAISE NOTICE '% 2 amount > balance: %', CASE WHEN (res->>'success')::bool = false THEN 'PASS' ELSE 'FAIL' END, res->>'error';
  res := public.pay_invoice_with_wallet(inv1, 40);
  RAISE NOTICE '% 3 overpay: %', CASE WHEN (res->>'success')::bool = false THEN 'PASS' ELSE 'FAIL' END, res->>'error';
  res := public.pay_invoice_with_wallet(inv1, -5);
  RAISE NOTICE '% 3b negative amount: %', CASE WHEN (res->>'success')::bool = false THEN 'PASS' ELSE 'FAIL' END, res->>'error';
  res := public.pay_invoice_with_wallet(inv1, 1.005);
  RAISE NOTICE '% 3c three decimals: %', CASE WHEN (res->>'success')::bool = false THEN 'PASS' ELSE 'FAIL' END, res->>'error';
  RESET ROLE;
  SELECT balance INTO bal FROM public.resident_wallets WHERE id = w;
  RAISE NOTICE '% 3d wallet untouched by rejections (balance %)', CASE WHEN bal = 100 THEN 'PASS' ELSE 'FAIL' END, bal;

  -- 4. Two-item call is all-or-nothing when the second item is invalid (inv2 ok, inv_bad 500 > balance).
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',owner_p)::text, true);
  SET LOCAL ROLE authenticated;
  res := public.pay_invoices_with_wallet(jsonb_build_array(
           jsonb_build_object('invoice_id', inv2), jsonb_build_object('invoice_id', inv_bad)));
  RESET ROLE;
  SELECT balance INTO bal FROM public.resident_wallets WHERE id = w;
  SELECT count(*) INTO cnt FROM public.invoices WHERE id IN (inv2, inv_bad) AND amount_paid <> 0;
  RAISE NOTICE '% 4 all-or-nothing: success=%, wallet=% (expect 100), invoices touched=% (expect 0)',
    CASE WHEN (res->>'success')::bool = false AND bal = 100 AND cnt = 0 THEN 'PASS' ELSE 'FAIL' END,
    res->>'success', bal, cnt;

  -- 5. Owner pays own invoice (single, partial 10 of 30), then both invoices in one bulk call.
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',owner_p)::text, true);
  SET LOCAL ROLE authenticated;
  res := public.pay_invoice_with_wallet(inv1, 10);
  RAISE NOTICE '% 5 owner single payment: amount=% new_balance=% (expect 10 / 90)',
    CASE WHEN (res->>'success')::bool AND (res->>'amount_paid')::numeric = 10 AND (res->>'new_wallet_balance')::numeric = 90 THEN 'PASS' ELSE 'FAIL' END,
    res->>'amount_paid', res->>'new_wallet_balance';

  -- Bulk: inv1 has 20 remaining, inv2 50 -> total 70 from 90 -> 20 left.
  res := public.pay_invoices_with_wallet(jsonb_build_array(
           jsonb_build_object('invoice_id', inv1), jsonb_build_object('invoice_id', inv2)));
  RESET ROLE;
  RAISE NOTICE '% 5b owner bulk payment: total=% count=% new_balance=% (expect 70 / 2 / 20)',
    CASE WHEN (res->>'success')::bool AND (res->>'total_paid')::numeric = 70 AND (res->>'count_paid')::int = 2
              AND (res->>'new_wallet_balance')::numeric = 20 THEN 'PASS' ELSE 'FAIL' END,
    res->>'total_paid', res->>'count_paid', res->>'new_wallet_balance';

  -- 6. Ledger chain: the bulk rows run in invoice-id order, so the first row's balance_after is
  -- 90 - its amount, the second's is 90 - total; the wallet balance equals the last row.
  lo := LEAST(inv1, inv2); hi := GREATEST(inv1, inv2);
  lo_amt := CASE WHEN lo = inv1 THEN 20 ELSE 50 END;
  hi_amt := CASE WHEN hi = inv1 THEN 20 ELSE 50 END;
  SELECT balance_after INTO lo_after FROM public.wallet_transactions
   WHERE wallet_id = w AND reference_id = lo AND description LIKE 'Bulk payment%';
  SELECT balance_after INTO hi_after FROM public.wallet_transactions
   WHERE wallet_id = w AND reference_id = hi AND description LIKE 'Bulk payment%';
  SELECT balance INTO bal FROM public.resident_wallets WHERE id = w;
  RAISE NOTICE '% 6 ledger chain: first=% (expect %), second=% (expect %), wallet=% (expect 20)',
    CASE WHEN lo_after = 90 - lo_amt AND hi_after = 90 - lo_amt - hi_amt AND bal = hi_after THEN 'PASS' ELSE 'FAIL' END,
    lo_after, 90 - lo_amt, hi_after, 90 - lo_amt - hi_amt, bal;

  SELECT count(*) INTO cnt FROM public.invoices WHERE id IN (inv1, inv2) AND status = 'paid';
  RAISE NOTICE '% 6b both invoices paid (count %)', CASE WHEN cnt = 2 THEN 'PASS' ELSE 'FAIL' END, cnt;

  -- 7. An already-paid invoice is not payable again; a wallet manager can reverse; chain stays consistent.
  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',owner_p)::text, true);
  SET LOCAL ROLE authenticated;
  res := public.pay_invoice_with_wallet(inv2, 1);
  RAISE NOTICE '% 7 paid invoice not payable: %', CASE WHEN (res->>'success')::bool = false THEN 'PASS' ELSE 'FAIL' END, res->>'error';
  RESET ROLE;

  PERFORM set_config('request.jwt.claims', json_build_object('role','authenticated','sub',admin_p)::text, true);
  SET LOCAL ROLE authenticated;
  SELECT balance INTO bal_before FROM public.resident_wallets WHERE id = w;
  res := public.reverse_invoice_payment_allocation(inv2, 50);
  RESET ROLE;
  SELECT balance INTO bal FROM public.resident_wallets WHERE id = w;
  SELECT balance_after INTO hi_after FROM public.wallet_transactions
   WHERE wallet_id = w AND reference_id = inv2 AND reference_type = 'invoice_reversal';
  RAISE NOTICE '% 8 admin reversal: status=% wallet=% (expect 70) ledger balance_after=% (expect 70)',
    CASE WHEN (res->>'success')::bool AND res->>'new_invoice_status' = 'unpaid'
              AND bal = bal_before + 50 AND hi_after = bal THEN 'PASS' ELSE 'FAIL' END,
    res->>'new_invoice_status', bal, hi_after;

  RAISE EXCEPTION 'probe 458 rolled back';
END $$;
