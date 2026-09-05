-- ============================================================================
-- Migration: close anonymous (unauthenticated) reads on six finance/settings
--            tables by scoping their RLS policies to `authenticated`
-- ============================================================================
-- Purpose: Issue #212, first half. Confirmed by real unauthenticated HTTP
--          request against the live database, not by reading policies:
--          `system_settings` (62 rows), `billing_profiles` (5),
--          `billing_items` (5) and `expense_categories` (15) return live data
--          to a caller holding only the publishable anon key. `budgets` and
--          `vendors` are exposed by the identical mechanism and return 200
--          with zero rows only because they are currently empty -- they leak
--          nothing today only by accident of having no rows yet.
--
-- Mechanism: each affected policy is PERMISSIVE, USING (true), and granted
--          to the PUBLIC database role instead of `authenticated`. Supabase
--          grants `anon` SELECT on these tables by default, and a
--          public-role policy applies to every role including `anon`, so
--          USING (true) resolves to unconditional public read.
--
-- Access change (the only one this migration makes): `anon` loses SELECT on
--          all six tables below. No authenticated role's access changes at
--          all -- every predicate is copied through byte for byte, only the
--          grantee moves from `public` to `authenticated`.
--
-- Scope: 11 policies across 6 tables, not 6. Five of these tables also carry
--          a second, FOR ALL policy granted to `public` whose predicate calls
--          `get_my_role()` or reads `profiles` directly. Changing only the
--          six SELECT policies would not be a smaller, safer version of this
--          fix -- it introduces a new outage. Once the SELECT policy no
--          longer admits `anon`, an anonymous SELECT falls through to
--          Postgres's next applicable PERMISSIVE policy on the table: the
--          FOR ALL policy, still granted to `public`. Verified against the
--          live database inside a rolled-back transaction:
--
--            SELECT policy alone scoped to `authenticated`
--              -> anon gets ERROR 42501: permission denied for function
--                 get_my_role()  (an HTTP 500, worse than the leak)
--            SELECT and ALL policy both scoped to `authenticated`
--              -> anon gets 0 rows, no error (the fix actually wanted)
--
--          `anon` has no EXECUTE on `get_my_role()`, so the first shape does
--          not deny the read quietly -- it raises inside policy evaluation
--          before RLS can filter anything. Every FOR ALL policy sharing a
--          table with one of the six SELECT policies is therefore in scope
--          too, so that anonymous callers fail closed (0 rows) instead of
--          raising.
--
-- system_settings is the one table with only a single `public` policy in
--          scope here (its INSERT/UPDATE/DELETE policies are already scoped
--          to `authenticated` and are not touched). It must stay readable by
--          ALL authenticated users, not just admins: src/middleware.ts:92
--          reads the `maintenance_mode` key on essentially every request,
--          for every signed-in account. USING (true) is kept exactly as it
--          was -- this migration does not gate system_settings on
--          has_permission() or any other permission, which would break
--          maintenance mode for every non-admin on every request. The same
--          "keep every predicate exactly as it is" rule applies to the other
--          five tables.
--
-- Policy names are deliberately not corrected even though two of them are
--          misleading about who they actually admit: "All authenticated can
--          view billing profiles" was, before this migration, granted to
--          `public`; "View Categories - Admins/Financial Secretary" restricts
--          to nobody (USING (true)). Renaming either changes the policy's
--          identity, and the naming problem is a separate concern from
--          closing anonymous access -- it belongs in its own change, not
--          buried inside a security fix. This migration changes WHO each
--          policy applies to, not WHAT it is called or WHAT it checks.
--
-- Written to be safely re-runnable: every policy name is dropped with
--          IF EXISTS immediately before its CREATE POLICY, and the names are
--          unchanged, so a second apply does not abort with 42710
--          (duplicate policy).
--
-- This migration is NOT applied by the authoring session. Apply and verify
--          manually, then check it into the applied-migrations record per
--          docs/agents/migrations-on-merge.md.
-- ============================================================================

-- ============================================================================
-- ROLLBACK: restores all eleven previous policy definitions
-- ============================================================================
-- Predicates transcribed from the live pg_policies definitions as they stood
-- before this migration, not from the original CREATE TABLE migrations. None
-- of the eleven had a WITH CHECK clause live, so none is restored here --
-- Postgres defaults WITH CHECK to the USING expression when omitted, and
-- stating one explicitly on the way back would not be what was live.
--
-- These are SQL comments, not executable statements.
--
-- BEGIN;
--
-- -- ---- billing_items ---------------------------------------------------
-- DROP POLICY IF EXISTS "All authenticated can view billing items" ON public.billing_items;
-- CREATE POLICY "All authenticated can view billing items"
--   ON public.billing_items FOR SELECT TO public
--   USING (true);
--
-- DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing items" ON public.billing_items;
-- CREATE POLICY "Admins chairmen fin sec can manage billing items"
--   ON public.billing_items FOR ALL TO public
--   USING (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role]));
--
-- -- ---- billing_profiles ------------------------------------------------
-- DROP POLICY IF EXISTS "All authenticated can view billing profiles" ON public.billing_profiles;
-- CREATE POLICY "All authenticated can view billing profiles"
--   ON public.billing_profiles FOR SELECT TO public
--   USING (true);
--
-- DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles;
-- CREATE POLICY "Admins chairmen fin sec can manage billing profiles"
--   ON public.billing_profiles FOR ALL TO public
--   USING (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role]));
--
-- -- ---- budgets -----------------------------------------------------------
-- DROP POLICY IF EXISTS "View Budgets - Admins/Financial Secretary" ON public.budgets;
-- CREATE POLICY "View Budgets - Admins/Financial Secretary"
--   ON public.budgets FOR SELECT TO public
--   USING (true);
--
-- DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles" ON public.budgets;
-- CREATE POLICY "Manage Budgets - Authorized Roles"
--   ON public.budgets FOR ALL TO public
--   USING (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))));
--
-- -- ---- expense_categories -------------------------------------------------
-- DROP POLICY IF EXISTS "View Categories - Admins/Financial Secretary" ON public.expense_categories;
-- CREATE POLICY "View Categories - Admins/Financial Secretary"
--   ON public.expense_categories FOR SELECT TO public
--   USING (true);
--
-- DROP POLICY IF EXISTS "Manage Categories - Authorized Roles" ON public.expense_categories;
-- CREATE POLICY "Manage Categories - Authorized Roles"
--   ON public.expense_categories FOR ALL TO public
--   USING (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))));
--
-- -- ---- system_settings ----------------------------------------------------
-- DROP POLICY IF EXISTS "system_settings_select_policy" ON public.system_settings;
-- CREATE POLICY "system_settings_select_policy"
--   ON public.system_settings FOR SELECT TO public
--   USING (true);
--
-- -- ---- vendors -------------------------------------------------------------
-- DROP POLICY IF EXISTS "View Vendors - Admins/Financial Secretary" ON public.vendors;
-- CREATE POLICY "View Vendors - Admins/Financial Secretary"
--   ON public.vendors FOR SELECT TO public
--   USING (true);
--
-- DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles" ON public.vendors;
-- CREATE POLICY "Manage Vendors - Authorized Roles"
--   ON public.vendors FOR ALL TO public
--   USING (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))));
--
-- COMMIT;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- billing_items
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "All authenticated can view billing items" ON public.billing_items;
CREATE POLICY "All authenticated can view billing items"
  ON public.billing_items FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing items" ON public.billing_items;
CREATE POLICY "Admins chairmen fin sec can manage billing items"
  ON public.billing_items FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role]));

-- ---------------------------------------------------------------------------
-- billing_profiles
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "All authenticated can view billing profiles" ON public.billing_profiles;
CREATE POLICY "All authenticated can view billing profiles"
  ON public.billing_profiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins chairmen fin sec can manage billing profiles" ON public.billing_profiles;
CREATE POLICY "Admins chairmen fin sec can manage billing profiles"
  ON public.billing_profiles FOR ALL TO authenticated
  USING (get_my_role() = ANY (ARRAY['admin'::user_role, 'chairman'::user_role, 'financial_secretary'::user_role]));

-- ---------------------------------------------------------------------------
-- budgets (no reader anywhere in src/** today; empty table; still exposed
-- by the same public-role mechanism, so it is closed alongside the rest)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "View Budgets - Admins/Financial Secretary" ON public.budgets;
CREATE POLICY "View Budgets - Admins/Financial Secretary"
  ON public.budgets FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles" ON public.budgets;
CREATE POLICY "Manage Budgets - Authorized Roles"
  ON public.budgets FOR ALL TO authenticated
  USING (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))));

-- ---------------------------------------------------------------------------
-- expense_categories
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "View Categories - Admins/Financial Secretary" ON public.expense_categories;
CREATE POLICY "View Categories - Admins/Financial Secretary"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Manage Categories - Authorized Roles" ON public.expense_categories;
CREATE POLICY "Manage Categories - Authorized Roles"
  ON public.expense_categories FOR ALL TO authenticated
  USING (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))));

-- ---------------------------------------------------------------------------
-- system_settings (only one `public` policy on this table -- its
-- INSERT/UPDATE/DELETE policies are already scoped to `authenticated` and
-- are not touched here). USING (true) is unchanged: this table must stay
-- readable by every signed-in account, not just admins, because
-- src/middleware.ts:92 reads maintenance_mode on essentially every request.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "system_settings_select_policy" ON public.system_settings;
CREATE POLICY "system_settings_select_policy"
  ON public.system_settings FOR SELECT TO authenticated
  USING (true);

-- ---------------------------------------------------------------------------
-- vendors (no reader currently sees non-empty data anonymously either --
-- exposed by the same mechanism, closed alongside the rest)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "View Vendors - Admins/Financial Secretary" ON public.vendors;
CREATE POLICY "View Vendors - Admins/Financial Secretary"
  ON public.vendors FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles" ON public.vendors;
CREATE POLICY "Manage Vendors - Authorized Roles"
  ON public.vendors FOR ALL TO authenticated
  USING (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles r ON ((p.role_id = r.id))) WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))));

COMMIT;
