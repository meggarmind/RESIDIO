-- #956: one permissive policy per role and command on the billing, payments and wallets tables
--
-- THIS CHANGES NO ACCESS. Where two or more permissive policies applied to the same role and
-- command, Postgres evaluated every one for every row and ORed them. Each such set becomes one
-- policy whose expression is the OR of the originals (a disjunct that appears in more than one
-- original is written once; OR is idempotent):
--
-- * Overlapping policies of the same command: one is ALTERed to the combined expression, keeping
--   its name, command and roles; the others are dropped.
-- * A FOR ALL policy that overlapped a SELECT policy is split into INSERT, UPDATE and DELETE
--   policies with its own expressions (its USING stands in as the INSERT check when it had no
--   WITH CHECK, as Postgres did), and its SELECT part is ORed into the SELECT policy.
-- * Only policies granted to the same role are merged. Overlaps between a TO public and a TO
--   authenticated policy are left alone: merging them changes which roles a predicate applies to,
--   which needs an owner decision (docs/security/rls-policy-consolidation.md).
--
-- The original definitions come from docs/security/rls-policy-consolidation.md, derived from the
-- migrations. Residio_Stage must confirm them before this is applied (that document's query).
-- Modelled multiple_permissive_policies findings on these tables: 13 before, 1 after.
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
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['billing_items', 'billing_profiles', 'estate_bank_accounts', 'payment_records', 'wallet_transactions'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- billing_items
-- DROP POLICY "Admins chairmen fin sec can manage billing items (insert)" ON public.billing_items;
-- DROP POLICY "Admins chairmen fin sec can manage billing items (update)" ON public.billing_items;
-- DROP POLICY "Admins chairmen fin sec can manage billing items (delete)" ON public.billing_items;
-- CREATE POLICY "Admins chairmen fin sec can manage billing items" ON public.billing_items
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING (((select has_permission('billing.write_profiles'::text))));
--
-- -- billing_profiles
-- DROP POLICY "Admins chairmen fin sec can manage billing profiles (insert)" ON public.billing_profiles;
-- DROP POLICY "Admins chairmen fin sec can manage billing profiles (update)" ON public.billing_profiles;
-- DROP POLICY "Admins chairmen fin sec can manage billing profiles (delete)" ON public.billing_profiles;
-- CREATE POLICY "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING (((select has_permission('billing.write_profiles'::text))));
--
-- -- estate_bank_accounts
-- DROP POLICY "Admins chairmen fin sec can manage bank accounts (insert)" ON public.estate_bank_accounts;
-- DROP POLICY "Admins chairmen fin sec can manage bank accounts (update)" ON public.estate_bank_accounts;
-- DROP POLICY "Admins chairmen fin sec can manage bank accounts (delete)" ON public.estate_bank_accounts;
-- CREATE POLICY "Admins chairmen fin sec can manage bank accounts" ON public.estate_bank_accounts
--   AS PERMISSIVE FOR ALL TO public
--   USING (((select has_permission('payments.manage_reference_records'::text))));
--
-- -- payment_records
-- DROP POLICY "Admins and FinSec can manage all payments (insert)" ON public.payment_records;
-- DROP POLICY "Admins and FinSec can manage all payments (update)" ON public.payment_records;
-- DROP POLICY "Admins and FinSec can manage all payments (delete)" ON public.payment_records;
-- CREATE POLICY "Admins and FinSec can manage all payments" ON public.payment_records
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('payments.update'::text)))
--   WITH CHECK ((select has_permission('payments.update'::text)));
-- ALTER POLICY "Residents can view own payments" ON public.payment_records
--   USING ((resident_id = (select get_my_resident_id())));
--
-- -- wallet_transactions
-- DROP POLICY "Admins chairmen fin sec can view all transactions (insert)" ON public.wallet_transactions;
-- DROP POLICY "Admins chairmen fin sec can view all transactions (update)" ON public.wallet_transactions;
-- DROP POLICY "Admins chairmen fin sec can view all transactions (delete)" ON public.wallet_transactions;
-- CREATE POLICY "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions
--   AS PERMISSIVE FOR ALL TO public
--   USING (((select has_permission('billing.manage_wallets'::text))));
-- ALTER POLICY "Residents can view own transactions" ON public.wallet_transactions
--   USING ((wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "billing_items": {
    "before": [
      "Admins chairmen fin sec can manage billing items|ALL|authenticated|PERMISSIVE",
      "All authenticated can view billing items|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can manage billing items (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage billing items (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage billing items (update)|UPDATE|authenticated|PERMISSIVE",
      "All authenticated can view billing items|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "billing_profiles": {
    "before": [
      "Admins chairmen fin sec can manage billing profiles|ALL|authenticated|PERMISSIVE",
      "All authenticated can view billing profiles|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can manage billing profiles (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage billing profiles (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins chairmen fin sec can manage billing profiles (update)|UPDATE|authenticated|PERMISSIVE",
      "All authenticated can view billing profiles|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "estate_bank_accounts": {
    "before": [
      "Admins chairmen fin sec can manage bank accounts|ALL|public|PERMISSIVE",
      "All authenticated can view active bank accounts|SELECT|public|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can manage bank accounts (delete)|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can manage bank accounts (insert)|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can manage bank accounts (update)|UPDATE|public|PERMISSIVE",
      "All authenticated can view active bank accounts|SELECT|public|PERMISSIVE"
    ]
  },
  "payment_records": {
    "before": [
      "Admins and FinSec can manage all payments|ALL|authenticated|PERMISSIVE",
      "Residents can view own payments|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins and FinSec can manage all payments (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins and FinSec can manage all payments (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins and FinSec can manage all payments (update)|UPDATE|authenticated|PERMISSIVE",
      "Residents can view own payments|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "wallet_transactions": {
    "before": [
      "Admins chairmen fin sec can view all transactions|ALL|public|PERMISSIVE",
      "Residents can view own transactions|SELECT|public|PERMISSIVE",
      "Residents can view own wallet transactions|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins chairmen fin sec can view all transactions (delete)|DELETE|public|PERMISSIVE",
      "Admins chairmen fin sec can view all transactions (insert)|INSERT|public|PERMISSIVE",
      "Admins chairmen fin sec can view all transactions (update)|UPDATE|public|PERMISSIVE",
      "Residents can view own transactions|SELECT|public|PERMISSIVE",
      "Residents can view own wallet transactions|SELECT|authenticated|PERMISSIVE"
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

-- billing_items
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing items (insert)" ON public.billing_items;
CREATE POLICY "Admins chairmen fin sec can manage billing items (insert)" ON public.billing_items
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('billing.write_profiles'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing items (update)" ON public.billing_items;
CREATE POLICY "Admins chairmen fin sec can manage billing items (update)" ON public.billing_items
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('billing.write_profiles'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing items (delete)" ON public.billing_items;
CREATE POLICY "Admins chairmen fin sec can manage billing items (delete)" ON public.billing_items
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('billing.write_profiles'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing items" ON public.billing_items;

-- billing_profiles
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing profiles (insert)" ON public.billing_profiles;
CREATE POLICY "Admins chairmen fin sec can manage billing profiles (insert)" ON public.billing_profiles
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('billing.write_profiles'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing profiles (update)" ON public.billing_profiles;
CREATE POLICY "Admins chairmen fin sec can manage billing profiles (update)" ON public.billing_profiles
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('billing.write_profiles'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing profiles (delete)" ON public.billing_profiles;
CREATE POLICY "Admins chairmen fin sec can manage billing profiles (delete)" ON public.billing_profiles
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('billing.write_profiles'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles;

-- estate_bank_accounts
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage bank accounts (insert)" ON public.estate_bank_accounts;
CREATE POLICY "Admins chairmen fin sec can manage bank accounts (insert)" ON public.estate_bank_accounts
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select has_permission('payments.manage_reference_records'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage bank accounts (update)" ON public.estate_bank_accounts;
CREATE POLICY "Admins chairmen fin sec can manage bank accounts (update)" ON public.estate_bank_accounts
  AS PERMISSIVE FOR UPDATE TO public
  USING ((select has_permission('payments.manage_reference_records'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage bank accounts (delete)" ON public.estate_bank_accounts;
CREATE POLICY "Admins chairmen fin sec can manage bank accounts (delete)" ON public.estate_bank_accounts
  AS PERMISSIVE FOR DELETE TO public
  USING ((select has_permission('payments.manage_reference_records'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can manage bank accounts" ON public.estate_bank_accounts;

-- payment_records
ALTER POLICY "Residents can view own payments" ON public.payment_records
  USING (((resident_id = (select get_my_resident_id())) OR (select has_permission('payments.update'::text))));
DROP POLICY IF EXISTS "Admins and FinSec can manage all payments (insert)" ON public.payment_records;
CREATE POLICY "Admins and FinSec can manage all payments (insert)" ON public.payment_records
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('payments.update'::text)));
DROP POLICY IF EXISTS "Admins and FinSec can manage all payments (update)" ON public.payment_records;
CREATE POLICY "Admins and FinSec can manage all payments (update)" ON public.payment_records
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('payments.update'::text)))
  WITH CHECK ((select has_permission('payments.update'::text)));
DROP POLICY IF EXISTS "Admins and FinSec can manage all payments (delete)" ON public.payment_records;
CREATE POLICY "Admins and FinSec can manage all payments (delete)" ON public.payment_records
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('payments.update'::text)));
DROP POLICY IF EXISTS "Admins and FinSec can manage all payments" ON public.payment_records;

-- wallet_transactions
ALTER POLICY "Residents can view own transactions" ON public.wallet_transactions
  USING (((wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))) OR (select has_permission('billing.manage_wallets'::text))));
DROP POLICY IF EXISTS "Admins chairmen fin sec can view all transactions (insert)" ON public.wallet_transactions;
CREATE POLICY "Admins chairmen fin sec can view all transactions (insert)" ON public.wallet_transactions
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can view all transactions (update)" ON public.wallet_transactions;
CREATE POLICY "Admins chairmen fin sec can view all transactions (update)" ON public.wallet_transactions
  AS PERMISSIVE FOR UPDATE TO public
  USING ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can view all transactions (delete)" ON public.wallet_transactions;
CREATE POLICY "Admins chairmen fin sec can view all transactions (delete)" ON public.wallet_transactions
  AS PERMISSIVE FOR DELETE TO public
  USING ((select has_permission('billing.manage_wallets'::text)));
DROP POLICY IF EXISTS "Admins chairmen fin sec can view all transactions" ON public.wallet_transactions;

COMMIT;
