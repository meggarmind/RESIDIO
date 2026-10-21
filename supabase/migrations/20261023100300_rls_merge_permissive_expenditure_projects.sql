-- #956: one permissive policy per role and command on the expenditure and projects tables
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
--    WHERE schemaname = 'public' AND tablename = ANY (ARRAY['budgets', 'expense_categories', 'expenses', 'petty_cash_accounts', 'project_milestones', 'projects', 'vendors'])
--    ORDER BY tablename, cmd, policyname;
--
-- ROLLBACK (run as one transaction; restores every original definition):
--
-- BEGIN;
--
-- -- budgets
-- DROP POLICY "Manage Budgets - Authorized Roles (insert)" ON public.budgets;
-- DROP POLICY "Manage Budgets - Authorized Roles (update)" ON public.budgets;
-- DROP POLICY "Manage Budgets - Authorized Roles (delete)" ON public.budgets;
-- CREATE POLICY "Manage Budgets - Authorized Roles" ON public.budgets
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('manage_expenditure'::text)))
--   WITH CHECK ((select has_permission('manage_expenditure'::text)));
-- ALTER POLICY "View Budgets - Authorized Roles" ON public.budgets
--   USING ((select has_permission('view_expenditure'::text)));
--
-- -- expense_categories
-- DROP POLICY "Manage Categories - Authorized Roles (insert)" ON public.expense_categories;
-- DROP POLICY "Manage Categories - Authorized Roles (update)" ON public.expense_categories;
-- DROP POLICY "Manage Categories - Authorized Roles (delete)" ON public.expense_categories;
-- CREATE POLICY "Manage Categories - Authorized Roles" ON public.expense_categories
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('manage_expenditure'::text)))
--   WITH CHECK ((select has_permission('manage_expenditure'::text)));
-- ALTER POLICY "View Categories - Authorized Roles" ON public.expense_categories
--   USING ((select has_permission('view_expenditure'::text)));
--
-- -- expenses
-- DROP POLICY "Manage Expenditure - Authorized Roles (insert)" ON public.expenses;
-- DROP POLICY "Manage Expenditure - Authorized Roles (update)" ON public.expenses;
-- DROP POLICY "Manage Expenditure - Authorized Roles (delete)" ON public.expenses;
-- CREATE POLICY "Manage Expenditure - Authorized Roles" ON public.expenses
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('manage_expenditure'::text)))
--   WITH CHECK ((select has_permission('manage_expenditure'::text)));
-- ALTER POLICY "View Expenditure - Admins/Financial Secretary" ON public.expenses
--   USING ((select has_permission('view_expenditure'::text)));
--
-- -- petty_cash_accounts
-- DROP POLICY "Admins can manage petty cash accounts (insert)" ON public.petty_cash_accounts;
-- DROP POLICY "Admins can manage petty cash accounts (update)" ON public.petty_cash_accounts;
-- DROP POLICY "Admins can manage petty cash accounts (delete)" ON public.petty_cash_accounts;
-- CREATE POLICY "Admins can manage petty cash accounts" ON public.petty_cash_accounts
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('manage_expenditure'::text)))
--   WITH CHECK ((select has_permission('manage_expenditure'::text)));
-- ALTER POLICY "petty_cash_accounts_select" ON public.petty_cash_accounts
--   USING (((select has_permission('view_expenditure'::text)) OR (select has_permission('billing.view'::text))));
--
-- -- project_milestones
-- DROP POLICY "Manage Milestones - Admins/Project Manager (insert)" ON public.project_milestones;
-- DROP POLICY "Manage Milestones - Admins/Project Manager (update)" ON public.project_milestones;
-- DROP POLICY "Manage Milestones - Admins/Project Manager (delete)" ON public.project_milestones;
-- CREATE POLICY "Manage Milestones - Admins/Project Manager" ON public.project_milestones
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('manage_projects'::text)))
--   WITH CHECK ((select has_permission('manage_projects'::text)));
-- ALTER POLICY "View Milestones - Admins/EXCO" ON public.project_milestones
--   USING ((select has_permission('view_projects'::text)));
--
-- -- projects
-- DROP POLICY "Manage Projects - Admins/Project Manager (insert)" ON public.projects;
-- DROP POLICY "Manage Projects - Admins/Project Manager (update)" ON public.projects;
-- DROP POLICY "Manage Projects - Admins/Project Manager (delete)" ON public.projects;
-- CREATE POLICY "Manage Projects - Admins/Project Manager" ON public.projects
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('manage_projects'::text)))
--   WITH CHECK ((select has_permission('manage_projects'::text)));
-- ALTER POLICY "View Projects - Admins/EXCO" ON public.projects
--   USING ((select has_permission('view_projects'::text)));
--
-- -- vendors
-- DROP POLICY "Manage Vendors - Authorized Roles (insert)" ON public.vendors;
-- DROP POLICY "Manage Vendors - Authorized Roles (update)" ON public.vendors;
-- DROP POLICY "Manage Vendors - Authorized Roles (delete)" ON public.vendors;
-- CREATE POLICY "Manage Vendors - Authorized Roles" ON public.vendors
--   AS PERMISSIVE FOR ALL TO authenticated
--   USING ((select has_permission('manage_vendors'::text)))
--   WITH CHECK ((select has_permission('manage_vendors'::text)));
-- ALTER POLICY "View Vendors - Authorized Roles" ON public.vendors
--   USING ((select has_permission('view_vendors'::text)));
-- COMMIT;

BEGIN;

DO $guard$
DECLARE
  v_expected CONSTANT jsonb := '{
  "budgets": {
    "before": [
      "Manage Budgets - Authorized Roles|ALL|authenticated|PERMISSIVE",
      "View Budgets - Authorized Roles|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Manage Budgets - Authorized Roles (delete)|DELETE|authenticated|PERMISSIVE",
      "Manage Budgets - Authorized Roles (insert)|INSERT|authenticated|PERMISSIVE",
      "Manage Budgets - Authorized Roles (update)|UPDATE|authenticated|PERMISSIVE",
      "View Budgets - Authorized Roles|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "expense_categories": {
    "before": [
      "Manage Categories - Authorized Roles|ALL|authenticated|PERMISSIVE",
      "View Categories - Authorized Roles|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Manage Categories - Authorized Roles (delete)|DELETE|authenticated|PERMISSIVE",
      "Manage Categories - Authorized Roles (insert)|INSERT|authenticated|PERMISSIVE",
      "Manage Categories - Authorized Roles (update)|UPDATE|authenticated|PERMISSIVE",
      "View Categories - Authorized Roles|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "expenses": {
    "before": [
      "Manage Expenditure - Authorized Roles|ALL|authenticated|PERMISSIVE",
      "View Expenditure - Admins/Financial Secretary|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Manage Expenditure - Authorized Roles (delete)|DELETE|authenticated|PERMISSIVE",
      "Manage Expenditure - Authorized Roles (insert)|INSERT|authenticated|PERMISSIVE",
      "Manage Expenditure - Authorized Roles (update)|UPDATE|authenticated|PERMISSIVE",
      "View Expenditure - Admins/Financial Secretary|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "petty_cash_accounts": {
    "before": [
      "Admins can manage petty cash accounts|ALL|authenticated|PERMISSIVE",
      "petty_cash_accounts_select|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Admins can manage petty cash accounts (delete)|DELETE|authenticated|PERMISSIVE",
      "Admins can manage petty cash accounts (insert)|INSERT|authenticated|PERMISSIVE",
      "Admins can manage petty cash accounts (update)|UPDATE|authenticated|PERMISSIVE",
      "petty_cash_accounts_select|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "project_milestones": {
    "before": [
      "Manage Milestones - Admins/Project Manager|ALL|authenticated|PERMISSIVE",
      "View Milestones - Admins/EXCO|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Manage Milestones - Admins/Project Manager (delete)|DELETE|authenticated|PERMISSIVE",
      "Manage Milestones - Admins/Project Manager (insert)|INSERT|authenticated|PERMISSIVE",
      "Manage Milestones - Admins/Project Manager (update)|UPDATE|authenticated|PERMISSIVE",
      "View Milestones - Admins/EXCO|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "projects": {
    "before": [
      "Manage Projects - Admins/Project Manager|ALL|authenticated|PERMISSIVE",
      "View Projects - Admins/EXCO|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Manage Projects - Admins/Project Manager (delete)|DELETE|authenticated|PERMISSIVE",
      "Manage Projects - Admins/Project Manager (insert)|INSERT|authenticated|PERMISSIVE",
      "Manage Projects - Admins/Project Manager (update)|UPDATE|authenticated|PERMISSIVE",
      "View Projects - Admins/EXCO|SELECT|authenticated|PERMISSIVE"
    ]
  },
  "vendors": {
    "before": [
      "Manage Vendors - Authorized Roles|ALL|authenticated|PERMISSIVE",
      "View Vendors - Authorized Roles|SELECT|authenticated|PERMISSIVE"
    ],
    "after": [
      "Manage Vendors - Authorized Roles (delete)|DELETE|authenticated|PERMISSIVE",
      "Manage Vendors - Authorized Roles (insert)|INSERT|authenticated|PERMISSIVE",
      "Manage Vendors - Authorized Roles (update)|UPDATE|authenticated|PERMISSIVE",
      "View Vendors - Authorized Roles|SELECT|authenticated|PERMISSIVE"
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

-- budgets
ALTER POLICY "View Budgets - Authorized Roles" ON public.budgets
  USING (((select has_permission('view_expenditure'::text)) OR (select has_permission('manage_expenditure'::text))));
DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles (insert)" ON public.budgets;
CREATE POLICY "Manage Budgets - Authorized Roles (insert)" ON public.budgets
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles (update)" ON public.budgets;
CREATE POLICY "Manage Budgets - Authorized Roles (update)" ON public.budgets
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)))
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles (delete)" ON public.budgets;
CREATE POLICY "Manage Budgets - Authorized Roles (delete)" ON public.budgets
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles" ON public.budgets;

-- expense_categories
ALTER POLICY "View Categories - Authorized Roles" ON public.expense_categories
  USING (((select has_permission('view_expenditure'::text)) OR (select has_permission('manage_expenditure'::text))));
DROP POLICY IF EXISTS "Manage Categories - Authorized Roles (insert)" ON public.expense_categories;
CREATE POLICY "Manage Categories - Authorized Roles (insert)" ON public.expense_categories
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Categories - Authorized Roles (update)" ON public.expense_categories;
CREATE POLICY "Manage Categories - Authorized Roles (update)" ON public.expense_categories
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)))
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Categories - Authorized Roles (delete)" ON public.expense_categories;
CREATE POLICY "Manage Categories - Authorized Roles (delete)" ON public.expense_categories
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Categories - Authorized Roles" ON public.expense_categories;

-- expenses
ALTER POLICY "View Expenditure - Admins/Financial Secretary" ON public.expenses
  USING (((select has_permission('view_expenditure'::text)) OR (select has_permission('manage_expenditure'::text))));
DROP POLICY IF EXISTS "Manage Expenditure - Authorized Roles (insert)" ON public.expenses;
CREATE POLICY "Manage Expenditure - Authorized Roles (insert)" ON public.expenses
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Expenditure - Authorized Roles (update)" ON public.expenses;
CREATE POLICY "Manage Expenditure - Authorized Roles (update)" ON public.expenses
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)))
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Expenditure - Authorized Roles (delete)" ON public.expenses;
CREATE POLICY "Manage Expenditure - Authorized Roles (delete)" ON public.expenses
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Manage Expenditure - Authorized Roles" ON public.expenses;

-- petty_cash_accounts
ALTER POLICY "petty_cash_accounts_select" ON public.petty_cash_accounts
  USING (((select has_permission('view_expenditure'::text)) OR (select has_permission('billing.view'::text)) OR (select has_permission('manage_expenditure'::text))));
DROP POLICY IF EXISTS "Admins can manage petty cash accounts (insert)" ON public.petty_cash_accounts;
CREATE POLICY "Admins can manage petty cash accounts (insert)" ON public.petty_cash_accounts
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Admins can manage petty cash accounts (update)" ON public.petty_cash_accounts;
CREATE POLICY "Admins can manage petty cash accounts (update)" ON public.petty_cash_accounts
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)))
  WITH CHECK ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Admins can manage petty cash accounts (delete)" ON public.petty_cash_accounts;
CREATE POLICY "Admins can manage petty cash accounts (delete)" ON public.petty_cash_accounts
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('manage_expenditure'::text)));
DROP POLICY IF EXISTS "Admins can manage petty cash accounts" ON public.petty_cash_accounts;

-- project_milestones
ALTER POLICY "View Milestones - Admins/EXCO" ON public.project_milestones
  USING (((select has_permission('view_projects'::text)) OR (select has_permission('manage_projects'::text))));
DROP POLICY IF EXISTS "Manage Milestones - Admins/Project Manager (insert)" ON public.project_milestones;
CREATE POLICY "Manage Milestones - Admins/Project Manager (insert)" ON public.project_milestones
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('manage_projects'::text)));
DROP POLICY IF EXISTS "Manage Milestones - Admins/Project Manager (update)" ON public.project_milestones;
CREATE POLICY "Manage Milestones - Admins/Project Manager (update)" ON public.project_milestones
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('manage_projects'::text)))
  WITH CHECK ((select has_permission('manage_projects'::text)));
DROP POLICY IF EXISTS "Manage Milestones - Admins/Project Manager (delete)" ON public.project_milestones;
CREATE POLICY "Manage Milestones - Admins/Project Manager (delete)" ON public.project_milestones
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('manage_projects'::text)));
DROP POLICY IF EXISTS "Manage Milestones - Admins/Project Manager" ON public.project_milestones;

-- projects
ALTER POLICY "View Projects - Admins/EXCO" ON public.projects
  USING (((select has_permission('view_projects'::text)) OR (select has_permission('manage_projects'::text))));
DROP POLICY IF EXISTS "Manage Projects - Admins/Project Manager (insert)" ON public.projects;
CREATE POLICY "Manage Projects - Admins/Project Manager (insert)" ON public.projects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('manage_projects'::text)));
DROP POLICY IF EXISTS "Manage Projects - Admins/Project Manager (update)" ON public.projects;
CREATE POLICY "Manage Projects - Admins/Project Manager (update)" ON public.projects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('manage_projects'::text)))
  WITH CHECK ((select has_permission('manage_projects'::text)));
DROP POLICY IF EXISTS "Manage Projects - Admins/Project Manager (delete)" ON public.projects;
CREATE POLICY "Manage Projects - Admins/Project Manager (delete)" ON public.projects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('manage_projects'::text)));
DROP POLICY IF EXISTS "Manage Projects - Admins/Project Manager" ON public.projects;

-- vendors
ALTER POLICY "View Vendors - Authorized Roles" ON public.vendors
  USING (((select has_permission('view_vendors'::text)) OR (select has_permission('manage_vendors'::text))));
DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles (insert)" ON public.vendors;
CREATE POLICY "Manage Vendors - Authorized Roles (insert)" ON public.vendors
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((select has_permission('manage_vendors'::text)));
DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles (update)" ON public.vendors;
CREATE POLICY "Manage Vendors - Authorized Roles (update)" ON public.vendors
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((select has_permission('manage_vendors'::text)))
  WITH CHECK ((select has_permission('manage_vendors'::text)));
DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles (delete)" ON public.vendors;
CREATE POLICY "Manage Vendors - Authorized Roles (delete)" ON public.vendors
  AS PERMISSIVE FOR DELETE TO authenticated
  USING ((select has_permission('manage_vendors'::text)));
DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles" ON public.vendors;

COMMIT;
