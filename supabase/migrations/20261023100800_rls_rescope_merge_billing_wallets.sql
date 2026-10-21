-- #956 part 2: one permissive policy per role and command on the invoice, wallet and payment
-- tables, by re-scoping their TO public policies to TO authenticated (owner decision 2026-10-21,
-- option A)
--
-- SIGNED-IN USERS SEE NO CHANGE. Part 1 left seven SELECT overlaps here between a TO public and a
-- TO authenticated policy. Each TO public policy is re-scoped to TO authenticated, keeping its
-- expressions, and then merged; for authenticated, the OR-ed expression Postgres evaluates is the
-- same before and after:
--
-- * A FOR ALL policy that overlapped a SELECT policy is split into INSERT, UPDATE and DELETE
--   policies TO authenticated with its own expressions (its USING stands in as the INSERT check
--   when it had no WITH CHECK, as Postgres did), and its SELECT part is ORed into the SELECT
--   policy. Where the ALL policy was TO public (invoices, invoice_items, resident_wallets), the
--   split policies are its re-scope. Where the SELECT policy was TO public (paystack_transactions,
--   wallet_payment_batches, wallet_payment_batch_items), it is re-scoped with ALTER POLICY ... TO
--   authenticated before the merge.
-- * wallet_transactions SELECT: "Residents can view own transactions" (public) is re-scoped and
--   absorbs "Residents can view own wallet transactions" (authenticated). Its INSERT, UPDATE and
--   DELETE policies overlap nothing and stay TO public.
--
-- anon (and authenticator and dashboard_user) no longer evaluate the re-scoped policies, so anon
-- reads and writes no row through them. What anon got before is measured by the probe
-- (docs/security/probe-956-permissive-merge.sql). No signed-out code path reads these tables
-- (docs/security/rls-policy-consolidation.md, part 2). service_role bypasses RLS.
--
-- The original definitions come from docs/security/rls-policy-consolidation.md (part 2), derived
-- from the migrations up to part 1. Residio_Stage must confirm them before this is applied.
-- Modelled multiple_permissive_policies findings on these tables: 7 before, 0 after.
--
-- GUARD: the DO block aborts the migration unless every table's full policy set (name, command,
-- roles, permissive flag) is exactly the expected state before this migration or exactly the state
-- after it. The first catches drift from the mapping; the second makes a re-run a no-op. Every
-- statement after it is idempotent.
--
-- VERIFY (after applying): the guard query below returns the "after" state for every table, and
-- the advisor's multiple_permissive_policies count drops by the difference above.
--
--   SELECT tablename, policyname, cmd, roles, permissive, qual, with_check FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['invoices', 'invoice_items', 'resident_wallets', 'paystack_transactions', 'wallet_payment_batches', 'wallet_payment_batch_items', 'wallet_transactions'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- invoices
-- DROP POLICY "Admins chairmen fin sec can manage all invoices (insert)" ON public.invoices;
-- DROP POLICY "Admins chairmen fin sec can manage all invoices (update)" ON public.invoices;
-- DROP POLICY "Admins chairmen fin sec can manage all invoices (delete)" ON public.invoices;
-- CREATE POLICY "Admins chairmen fin sec can manage all invoices" ON public.invoices
--   AS PERMISSIVE FOR ALL TO public
--   USING (((select has_permission('billing.create_invoice'::text))));
-- ALTER POLICY "Residents can view own invoices" ON public.invoices
--   USING ((resident_id = (select get_my_resident_id())));
--
-- -- invoice_items
-- DROP POLICY "Admins chairmen fin sec can manage all invoice items (insert)" ON public.invoice_items;
-- DROP POLICY "Admins chairmen fin sec can manage all invoice items (update)" ON public.invoice_items;
-- DROP POLICY "Admins chairmen fin sec can manage all invoice items (delete)" ON public.invoice_items;
-- CREATE POLICY "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items
--   AS PERMISSIVE FOR ALL TO public
--   USING (((select has_permission('billing.create_invoice'::text))));
-- ALTER POLICY "Residents can view own invoice items" ON public.invoice_items
--   USING ((invoice_id IN ( SELECT invoices.id FROM invoices WHERE (invoices.resident_id = (select get_my_resident_id())))));
--
-- -- resident_wallets
-- DROP POLICY "Admins chairmen fin sec can manage wallets (insert)" ON public.resident_wallets;
-- DROP POLICY "Admins chairmen fin sec can manage wallets (update)" ON public.resident_wallets;
-- DROP POLICY "Admins chairmen fin sec can manage wallets (delete)" ON public.resident_wallets;
-- CREATE POLICY "Admins chairmen fin sec can manage wallets" ON public.resident_wallets
--   AS PERMISSIVE FOR ALL TO public
--   USING (((select has_permission('billing.manage_wallets'::text))));
-- ALTER POLICY "Residents can view own wallet" ON public.resident_wallets
--   USING ((resident_id = (select get_my_resident_id())));
--
-- -- paystack_transactions
-- DROP POLICY "paystack_transactions_admin_all (insert)" ON public.paystack_transactions;
-- DROP POLICY "paystack_transactions_admin_all (update)" ON public.paystack_transactions;
-- DROP POLICY "paystack_transactions_admin_all (delete)" ON public.paystack_transactions;
-- CREATE POLICY paystack_transactions_admin_all ON public.paystack_transactions
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('payments.update'::text)))
--   WITH CHECK ((select has_permission('payments.update'::text)));
-- ALTER POLICY paystack_transactions_resident_select ON public.paystack_transactions
--   TO public
--   USING ((resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))));
--
-- -- wallet_payment_batches
-- DROP POLICY "Admin finance can manage wallet payment batches (insert)" ON public.wallet_payment_batches;
-- DROP POLICY "Admin finance can manage wallet payment batches (update)" ON public.wallet_payment_batches;
-- DROP POLICY "Admin finance can manage wallet payment batches (delete)" ON public.wallet_payment_batches;
-- CREATE POLICY "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('billing.manage_wallets'::text)))
--   WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
-- ALTER POLICY "Residents can view own wallet payment batches" ON public.wallet_payment_batches
--   TO public
--   USING ((resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))));
--
-- -- wallet_payment_batch_items
-- DROP POLICY "Admin finance can manage wallet payment batch items (insert)" ON public.wallet_payment_batch_items;
-- DROP POLICY "Admin finance can manage wallet payment batch items (update)" ON public.wallet_payment_batch_items;
-- DROP POLICY "Admin finance can manage wallet payment batch items (delete)" ON public.wallet_payment_batch_items;
-- CREATE POLICY "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('billing.manage_wallets'::text)))
--   WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
-- ALTER POLICY "Residents can view own wallet payment batch items" ON public.wallet_payment_batch_items
--   TO public
--   USING ((batch_id IN ( SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))));
--
-- -- wallet_transactions
-- CREATE POLICY "Residents can view own wallet transactions" ON public.wallet_transactions
--   AS PERMISSIVE FOR SELECT TO authenticated
--   USING ((wallet_id IN ( SELECT resident_wallets.id FROM resident_wallets WHERE (resident_wallets.resident_id = (select get_my_resident_id())))));
-- ALTER POLICY "Residents can view own transactions" ON public.wallet_transactions
--   TO public
--   USING (((wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))) OR (select has_permission('billing.manage_wallets'::text))));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "invoices": {
    "before": [
      "Admins chairmen fin sec can manage all invoices|ALL|public|PERMISSIVE",
      "Residents can view own invoices|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can manage all invoices (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage all invoices (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage all invoices (update)|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own invoices|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "invoice_items": {
    "before": [
      "Admins chairmen fin sec can manage all invoice items|ALL|public|PERMISSIVE",
      "Residents can view own invoice items|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can manage all invoice items (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage all invoice items (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage all invoice items (update)|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own invoice items|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "resident_wallets": {
    "before": [
      "Admins chairmen fin sec can manage wallets|ALL|public|PERMISSIVE",
      "Residents can view own wallet|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can manage wallets (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage wallets (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage wallets (update)|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own wallet|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "paystack_transactions": {
    "before": [
      "paystack_transactions_admin_all|ALL|authenticated|PERMISSIVE",
      "paystack_transactions_resident_select|SELECT|public|PERMISSIVE"
    ],
    "after": [
      "paystack_transactions_admin_all (delete)|DELETE|authenticated|PERMISSIVE",
      "paystack_transactions_admin_all (insert)|INSERT|authenticated|PERMISSIVE",
      "paystack_transactions_admin_all (update)|UPDATE|authenticated|PERMISSIVE",
      "paystack_transactions_resident_select|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "wallet_payment_batches": {
    "before": [
      "Admin finance can manage wallet payment batches|ALL|authenticated|PERMISSIVE",
      "Residents can view own wallet payment batches|SELECT|public|PERMISSIVE"
    ],
    "after": [
      "Admin finance can manage wallet payment batches (delete)|DELETE|authenticated|PERMISSIVE",
      "Admin finance can manage wallet payment batches (insert)|INSERT|authenticated|PERMISSIVE",
      "Admin finance can manage wallet payment batches (update)|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own wallet payment batches|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "wallet_payment_batch_items": {
    "before": [
      "Admin finance can manage wallet payment batch items|ALL|authenticated|PERMISSIVE",
      "Residents can view own wallet payment batch items|SELECT|public|PERMISSIVE"
    ],
    "after": [
      "Admin finance can manage wallet payment batch items (delete)|DELETE|authenticated|PERMISSIVE",
      "Admin finance can manage wallet payment batch items (insert)|INSERT|authenticated|PERMISSIVE",
      "Admin finance can manage wallet payment batch items (update)|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own wallet payment batch items|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "wallet_transactions": {
    "before": [
      "Admins chairmen fin sec can view all transactions (delete)|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all transactions (insert)|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can view all transactions (update)|UPDATE|public|PERMISSIVE",
      "Residents can view own transactions|SELECT|public|PERMISSIVE",
      "Residents can view own wallet transactions|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can view all transactions (delete)|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all transactions (insert)|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can view all transactions (update)|UPDATE|public|PERMISSIVE",
      "Residents can view own transactions|SELECT|authenticated|PERMISSIVE"
    ]
  }
}';
  v_table text;
  v_live text[];
  v_before text[];
  v_after text[];
BEGIN
  FOR v_table IN SELECT jsonb_object_keys(v_expected) LOOP
    SELECT coalesce(array_agg(format('%s|%s|%s|%s', p.policyname, p.cmd,
             (SELECT string_agg(r::text, ',' ORDER BY r::text) FROM unnest(p.roles) AS r), p.permissive)), '{}')
      INTO v_live
      FROM pg_policies p
     WHERE p.schemaname = 'public' AND p.tablename = v_table;
    v_before := ARRAY(SELECT jsonb_array_elements_text(v_expected -> v_table -> 'before'));
    v_after := ARRAY(SELECT jsonb_array_elements_text(v_expected -> v_table -> 'after'));
    IF NOT ((v_live @> v_before AND v_live <@ v_before) OR (v_live @> v_after AND v_live <@ v_after)) THEN
      RAISE EXCEPTION '#956: public.% policies match neither the expected before-state nor the after-state; live: %',
        v_table, v_live;
    END IF;
  END LOOP;
END
$guard$;

-- invoices
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoices (insert)" ON public.invoices;
CREATE POLICY "Admins chairmen fin sec can manage all invoices (insert)" ON public.invoices
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('billing.create_invoice'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoices (update)" ON public.invoices;
CREATE POLICY "Admins chairmen fin sec can manage all invoices (update)" ON public.invoices
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('billing.create_invoice'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoices (delete)" ON public.invoices;
CREATE POLICY "Admins chairmen fin sec can manage all invoices (delete)" ON public.invoices
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('billing.create_invoice'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoices" ON public.invoices;
ALTER POLICY "Residents can view own invoices" ON public.invoices
  USING (((resident_id = (select get_my_resident_id())) OR (select has_permission('billing.create_invoice'::text))));

-- invoice_items
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoice items (insert)" ON public.invoice_items;
CREATE POLICY "Admins chairmen fin sec can manage all invoice items (insert)" ON public.invoice_items
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('billing.create_invoice'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoice items (update)" ON public.invoice_items;
CREATE POLICY "Admins chairmen fin sec can manage all invoice items (update)" ON public.invoice_items
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('billing.create_invoice'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoice items (delete)" ON public.invoice_items;
CREATE POLICY "Admins chairmen fin sec can manage all invoice items (delete)" ON public.invoice_items
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('billing.create_invoice'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage all invoice items" ON public.invoice_items;
ALTER POLICY "Residents can view own invoice items" ON public.invoice_items
  USING (((invoice_id IN ( SELECT invoices.id FROM invoices WHERE (invoices.resident_id = (select get_my_resident_id())))) OR (select has_permission('billing.create_invoice'::text))));

-- resident_wallets
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage wallets (insert)" ON public.resident_wallets;
CREATE POLICY "Admins chairmen fin sec can manage wallets (insert)" ON public.resident_wallets
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage wallets (update)" ON public.resident_wallets;
CREATE POLICY "Admins chairmen fin sec can manage wallets (update)" ON public.resident_wallets
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage wallets (delete)" ON public.resident_wallets;
CREATE POLICY "Admins chairmen fin sec can manage wallets (delete)" ON public.resident_wallets
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage wallets" ON public.resident_wallets;
ALTER POLICY "Residents can view own wallet" ON public.resident_wallets
  USING (((resident_id = (select get_my_resident_id())) OR (select has_permission('billing.manage_wallets'::text))));

-- paystack_transactions
ALTER POLICY paystack_transactions_resident_select ON public.paystack_transactions
  TO authenticated;
DROP POLICY IF EXISTS "paystack_transactions_admin_all (insert)" ON public.paystack_transactions;
CREATE POLICY "paystack_transactions_admin_all (insert)" ON public.paystack_transactions
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('payments.update'::text)));
DROP POLICY IF EXISTS "paystack_transactions_admin_all (update)" ON public.paystack_transactions;
CREATE POLICY "paystack_transactions_admin_all (update)" ON public.paystack_transactions
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('payments.update'::text)))
  WITH CHECK ((select has_permission('payments.update'::text)));
DROP POLICY IF EXISTS "paystack_transactions_admin_all (delete)" ON public.paystack_transactions;
CREATE POLICY "paystack_transactions_admin_all (delete)" ON public.paystack_transactions
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('payments.update'::text)));
DROP POLICY IF EXISTS paystack_transactions_admin_all ON public.paystack_transactions;
ALTER POLICY paystack_transactions_resident_select ON public.paystack_transactions
  USING (((resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))) OR (select has_permission('payments.update'::text))));

-- wallet_payment_batches
ALTER POLICY "Residents can view own wallet payment batches" ON public.wallet_payment_batches
  TO authenticated;
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batches (insert)" ON public.wallet_payment_batches;
CREATE POLICY "Admin finance can manage wallet payment batches (insert)" ON public.wallet_payment_batches
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batches (update)" ON public.wallet_payment_batches;
CREATE POLICY "Admin finance can manage wallet payment batches (update)" ON public.wallet_payment_batches
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('billing.manage_wallets'::text)))
  WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batches (delete)" ON public.wallet_payment_batches;
CREATE POLICY "Admin finance can manage wallet payment batches (delete)" ON public.wallet_payment_batches
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches;
ALTER POLICY "Residents can view own wallet payment batches" ON public.wallet_payment_batches
  USING (((resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))) OR (select has_permission('billing.manage_wallets'::text))));

-- wallet_payment_batch_items
ALTER POLICY "Residents can view own wallet payment batch items" ON public.wallet_payment_batch_items
  TO authenticated;
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batch items (insert)" ON public.wallet_payment_batch_items;
CREATE POLICY "Admin finance can manage wallet payment batch items (insert)" ON public.wallet_payment_batch_items
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batch items (update)" ON public.wallet_payment_batch_items;
CREATE POLICY "Admin finance can manage wallet payment batch items (update)" ON public.wallet_payment_batch_items
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('billing.manage_wallets'::text)))
  WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batch items (delete)" ON public.wallet_payment_batch_items;
CREATE POLICY "Admin finance can manage wallet payment batch items (delete)" ON public.wallet_payment_batch_items
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items;
ALTER POLICY "Residents can view own wallet payment batch items" ON public.wallet_payment_batch_items
  USING (((batch_id IN ( SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))) OR (select has_permission('billing.manage_wallets'::text))));

-- wallet_transactions
ALTER POLICY "Residents can view own transactions" ON public.wallet_transactions
  TO authenticated;
ALTER POLICY "Residents can view own transactions" ON public.wallet_transactions
  USING (((wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))) OR (select has_permission('billing.manage_wallets'::text)) OR (wallet_id IN ( SELECT resident_wallets.id FROM resident_wallets WHERE (resident_wallets.resident_id = (select get_my_resident_id()))))));
DROP POLICY IF EXISTS "Residents can view own wallet transactions" ON public.wallet_transactions;

COMMIT;
