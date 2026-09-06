-- ============================================================================
-- Migration: 21 finance / projects / reports / storage RLS policies follow
--            has_permission(), not hardcoded app_roles.name lists
-- ============================================================================
-- Purpose: Issue #213. Twenty-one policies across fourteen tables still
--          authorize by comparing `app_roles.name` against a literal array of
--          role names -- the RBAC catalogue (app_permissions /
--          role_permissions / has_permission()) is bypassed entirely. Granting
--          a role a permission therefore does nothing for these tables, and
--          every new role is denied by default no matter what it holds. Each
--          policy is rewritten to a single public.has_permission('<name>')
--          call.
--
--          Companion slice: #237 covers the remaining 16 tables that still
--          carry an open-read `USING (true)` policy. This slice closes six of
--          those (see "Open-read siblings dropped" below) because they sit on
--          the same tables as the policies rewritten here and would otherwise
--          make the rewrite a no-op.
--
--          Each rewritten policy keeps its exact name and command, so the live
--          policy set stays diffable by name against
--          docs/validation/role-access-matrix.baseline.json.
--
-- *** THE 21st POLICY IS IN THE `storage` SCHEMA, NOT `public`. ***
-- "Admins can view all payment proofs" on storage.objects
-- (20260118090000_add_hybrid_payments.sql) is the same defect class and denies
-- vice_chairman, which is issue #213's headline complaint. The issue's own
-- reproduce query filters `schemaname = 'public'` and therefore cannot see it.
-- If you are re-running that query to check this migration's work, drop the
-- schema filter or you will conclude this file touched a policy that does not
-- exist.
--
-- ---------------------------------------------------------------------------
-- THE FINDING THAT GOVERNS THIS WHOLE MIGRATION -- read before adjudicating
-- any moved access cell
-- ---------------------------------------------------------------------------
-- Eight of these policies do not merely list role names. They read:
--
--     ((r.name)::text = ANY (ARRAY['super_admin','admin','financial_secretary',
--                                  'chairman','financial_officer'])
--      OR (r.category)::text = 'exco')
--
-- There are 8 active roles. SEVEN of them are category `exco`: super_admin,
-- chairman, vice_chairman, financial_officer, secretary, project_manager,
-- security_officer. The eighth is the resident role. So the `exco` branch
-- admits EVERY non-resident role, and it -- not the name list -- is what
-- actually governs those policies today. `admin` and `financial_secretary` in
-- the name lists are legacy `user_role` enum values with no matching row in
-- app_roles at all; they match nobody.
--
-- Consequence: a policy named "Manage Budgets - Authorized Roles" is, live,
-- "Manage Budgets - Anyone On Staff". This migration is therefore
-- predominantly a NARROWING, even though its name lists look restrictive.
-- Do NOT re-derive intent from the old role list. It is decoration.
--
-- ---------------------------------------------------------------------------
-- Permission chosen per policy, and why
-- ---------------------------------------------------------------------------
-- Verified against role_permissions on 2026-09-06 before this file was
-- written. Do NOT re-derive these from the policies' old role lists.
--
--   budgets                "Manage Budgets - Authorized Roles"        ALL
--   expense_categories     "Manage Categories - Authorized Roles"     ALL
--   expenses               "Manage Expenditure - Authorized Roles"    ALL
--   personnel_engagements  "Manage Personnel Engagements - ..."       ALL
--       -> manage_expenditure
--       Budgets, expense categories, expenses and personnel engagements are
--       all expenditure records. `manage_expenditure` is the write permission
--       named for them. These are FOR ALL policies, so the permission they
--       name must be the write one -- `view_expenditure` would hand write
--       access on the estate's spending to every viewer.
--
--   budgets                "View Budgets - Authorized Roles"          SELECT
--   expense_categories     "View Categories - Authorized Roles"       SELECT
--   expenses               "View Expenditure - Admins/Financial ..."  SELECT
--       -> view_expenditure
--
--   vendors                "Manage Vendors - Authorized Roles"        ALL
--       -> manage_vendors
--   vendors                "View Vendors - Authorized Roles"          SELECT
--       -> view_vendors
--
--   projects               "Manage Projects - Admins/Project Manager" ALL
--   project_milestones     "Manage Milestones - Admins/Project ..."   ALL
--       -> manage_projects
--
--   projects               "View Projects - Admins/EXCO"              SELECT
--   project_milestones     "View Milestones - Admins/EXCO"            SELECT
--       -> view_projects
--
--   *** SIX PERMISSION NAMES IN THIS MIGRATION CARRY NO CATEGORY PREFIX. ***
--   `manage_expenditure`, `view_expenditure`, `manage_vendors`,
--   `view_vendors`, `manage_projects`, `view_projects` are stored in
--   app_permissions exactly like that. There is NO `finance.manage_expenditure`
--   and no `projects.manage_projects`. has_permission() on a name that does
--   not exist returns FALSE silently, so a "corrected" prefix here produces a
--   perfectly well-formed policy that denies everyone. Verified against
--   app_permissions, not inferred from the other names in this file.
--
--   report_schedules       report_schedules_select                    SELECT
--   report_schedules       report_schedules_insert                    INSERT
--   report_schedules       report_schedules_update                    UPDATE
--   report_schedules       report_schedules_delete                    DELETE
--   generated_reports      generated_reports_delete                   DELETE
--       -> reports.manage_schedules  (CREATED BY THIS MIGRATION, see below)
--
--   generated_reports      generated_reports_select                   SELECT
--       -> reports.view_financial
--       The generated artefacts are read output; the existing financial-report
--       read permission is the closest fit and already exists.
--
--   invoice_generation_log invoice_generation_log_select              SELECT
--       -> billing.create_invoice
--       The log records invoice generation runs; whoever may generate invoices
--       may read the record of having done so. Same choice #186 made for
--       invoice_generation_runs / _candidates / _approvals.
--
--   paystack_transactions  paystack_transactions_admin_all            ALL
--   storage.objects        "Admins can view all payment proofs"       SELECT
--       -> payments.update
--       paystack_transactions is FOR ALL, so the write permission.
--       `payments.view` would hand write access on the payment-gateway ledger
--       to project_manager and secretary. Same choice #186 made for
--       payment_records.
--
--       The storage policy gates the `payment-proofs` bucket, which holds the
--       same data class -- resident payment evidence -- so it takes the same
--       permission. `payments.view` is deliberately NOT used there either: it
--       would additionally admit project_manager and secretary to every
--       resident's uploaded proof of payment. The bucket_id predicate is
--       preserved; only the role test is replaced.
--
--   two_factor_audit_log   "Admins can view all audit logs"           SELECT
--       -> two_factor.view_audit_log
--
--   impersonation_sessions super_admin_read_all_impersonation_...     SELECT
--       -> impersonation.view_sessions
--
-- ---------------------------------------------------------------------------
-- New permission: reports.manage_schedules
-- ---------------------------------------------------------------------------
-- The entire `reports` category is read-shaped -- view_financial,
-- view_occupancy, view_security, export. Nothing in it covers *managing*
-- report schedules, which is what report_schedules and the deletion of
-- generated_reports rows actually are.
--
-- `report_subscriptions.manage` is NOT a substitute and must not be
-- substituted later. `report_subscriptions` is a resident-facing email-digest
-- table (resident_id, receive_monthly_summary, ...) and has nothing to do with
-- `report_schedules`, which is the admin scheduled-report engine. The name
-- similarity is a trap.
--
-- Seeded to super_admin, chairman, financial_officer and vice_chairman --
-- the three roles the old policy admitted, plus vice_chairman per the grant
-- decision below. Category `reports` already exists in permission_category, so
-- no ALTER TYPE is needed.
--
-- ---------------------------------------------------------------------------
-- Catalogue changes: seven grants, all deliberate
-- ---------------------------------------------------------------------------
-- DELIBERATE, USER-APPROVED WIDENINGS IN THE CATALOGUE.
--
-- (a) vice_chairman is granted manage_expenditure, view_expenditure,
--     manage_vendors, view_vendors, manage_projects and view_projects.
--
--     This makes the policy rewrite ACCESS-PRESERVING for vice_chairman.
--     vice_chairman is category `exco`, so it holds expenses,
--     expense_categories, budgets, vendors, projects and project_milestones
--     TODAY via the `exco` branch described at the top of this header. Without
--     these six grants the rewrite would strip it of all of them. The grants
--     restore in the catalogue what the `exco` branch was granting in the
--     policy.
--
-- (b) financial_officer is granted view_vendors.
--
--     This one closes a defect the per-policy view hides and only the NET read
--     matrix exposes. financial_officer does not hold `manage_vendors` and
--     never did -- it reads `vendors` today solely through the open
--     "View Vendors - Admins/Financial Secretary" policy that step 4 drops. So
--     without this grant, dropping the open policy takes `vendors` from Y to
--     `.` for financial_officer.
--
--     That is not a self-contained loss. src/actions/expenses/get-expenses.ts
--     (lines 18-22) embeds `vendor:vendors(name)` in its select, and PostgREST
--     applies the embedded table's own RLS. A financial_officer -- who CAN
--     read `expenses` via view_expenditure -- would get blank vendor names on
--     every vendor-paid expense, with no error. That is the "Payee/context"
--     failure named in CORE.md section 13.
--
-- These grants are seeded BEFORE the policies are rewritten, inside the same
-- transaction. Order matters: every delta stated below is the delta AFTER
-- these grants have applied.
--
-- ---------------------------------------------------------------------------
-- Three NEW SELECT policies: the view-only trap, closed prospectively
-- ---------------------------------------------------------------------------
-- budgets, vendors and expense_categories had NO permission-keyed SELECT
-- policy at all. Their reads were served entirely by the open `USING (true)`
-- policy plus the FOR ALL manage policy. Dropping the open policy (step 4)
-- without adding a read policy would leave reads coming from the manage policy
-- alone -- i.e. anyone holding `view_expenditure` or `view_vendors` who cannot
-- also *manage* would silently see three empty tables.
--
-- So this migration adds:
--
--   budgets             "View Budgets - Authorized Roles"    view_expenditure
--   expense_categories  "View Categories - Authorized Roles" view_expenditure
--   vendors             "View Vendors - Authorized Roles"    view_vendors
--
-- The `vendors` one is load-bearing today: it is what carries grant (b) above
-- and keeps financial_officer's expense list populated.
--
-- The two `view_expenditure` policies move NO cell today -- view_expenditure
-- and manage_expenditure are currently held by exactly the same four roles
-- (chairman, financial_officer, super_admin, and vice_chairman via grant (a)),
-- so every role that gains read through them already had it through the manage
-- policy. They are added anyway, so that the first time someone is given
-- view-only finance access the tables are not mysteriously blank. Do not
-- delete them as dead code: they are dead only for as long as nobody holds
-- view_expenditure without manage_expenditure.
--
-- ---------------------------------------------------------------------------
-- Open-read siblings dropped (step 4) -- without this the SELECT rewrites
-- above move no access at all
-- ---------------------------------------------------------------------------
-- Six PERMISSIVE `USING (true)` SELECT policies are dropped and NOT recreated.
-- RLS policies are OR-ed, so each of these was overriding every other policy
-- on its table for reads. Measured against the live database on 2026-09-06: an
-- active `resident` account currently reads 15/15 expense categories, 7/7
-- generated reports and 1/1 report schedule.
--
--   budgets                "View Budgets - Admins/Financial Secretary"
--   expense_categories     "View Categories - Admins/Financial Secretary"
--   vendors                "View Vendors - Admins/Financial Secretary"
--   generated_reports      "Authenticated users can view generated reports"
--   report_schedules       "Authenticated users can view report schedules"
--   personnel_engagements  "View Personnel Engagements - Internal"
--
-- The first three are replaced by the permission-keyed SELECT policies
-- described in the section above -- note the replacements are named
-- "... - Authorized Roles", NOT "... - Admins/Financial Secretary", so the two
-- generations do not collide by name. The other three are not replaced; the
-- sibling policies rewritten above are the intended read path.
--
-- report_schedules also carries a RESTRICTIVE policy, "Approved accounts only
-- can read" (is_approved()). It is deliberately left alone: RESTRICTIVE
-- policies AND with the permissive set, so it is orthogonal to this work and
-- removing it would widen access.
--
-- ---------------------------------------------------------------------------
-- EVERY MOVED ACCESS CELL
-- ---------------------------------------------------------------------------
-- All deltas below are stated AFTER the catalogue grants above have applied,
-- and cover the 8 active roles only. `admin` and `financial_secretary` appear
-- in the old predicates but match no app_roles row, so they move nothing.
--
-- These were measured, not predicted: the migration was applied inside a
-- transaction, admission was probed for every policy against all 8 roles, and
-- the transaction was rolled back.
--
-- WIDENINGS (deliberate):
--
--   projects                "Manage Projects - Admins/Project Manager"
--       + chairman, + financial_officer, + vice_chairman
--   project_milestones      "Manage Milestones - Admins/Project Manager"
--       + chairman, + financial_officer, + vice_chairman
--       (Both were super_admin + project_manager only. manage_projects is held
--       by chairman, financial_officer, project_manager and super_admin, plus
--       vice_chairman from the grants above.)
--
--   report_schedules        select / insert / update / delete
--       + vice_chairman
--   generated_reports       generated_reports_delete
--       + vice_chairman
--   generated_reports       generated_reports_select
--       + project_manager, + vice_chairman
--       (reports.view_financial is held by chairman, financial_officer,
--       project_manager, super_admin and vice_chairman.)
--
--   invoice_generation_log  invoice_generation_log_select
--       + vice_chairman
--   paystack_transactions   paystack_transactions_admin_all
--       + vice_chairman
--   storage.objects         "Admins can view all payment proofs"
--       + vice_chairman
--       (Was super_admin, chairman, financial_officer by name. payments.update
--       is held by exactly those three plus vice_chairman.)
--
--   impersonation_sessions  super_admin_read_all_impersonation_sessions
--       + chairman
--       DELIBERATE, USER-APPROVED. The policy was super_admin-only by name;
--       impersonation.view_sessions is held by chairman and super_admin. This
--       is not an oversight and should not be "corrected" back.
--
-- NARROWINGS (the bulk of this migration -- all of them are the `exco` branch
-- being retired):
--
--   budgets                 "Manage Budgets - Authorized Roles"
--       - secretary, - project_manager, - security_officer
--   expense_categories      "Manage Categories - Authorized Roles"
--       - secretary, - project_manager, - security_officer
--   expenses                "Manage Expenditure - Authorized Roles"
--       - secretary, - project_manager, - security_officer
--   expenses                "View Expenditure - Admins/Financial Secretary"
--       - secretary, - project_manager, - security_officer
--   vendors                 "Manage Vendors - Authorized Roles"
--       - financial_officer, - secretary, - project_manager,
--       - security_officer
--       (manage_vendors is held by chairman and super_admin only, plus
--       vice_chairman from the grants above. financial_officer loses vendor
--       *management* here -- but KEEPS vendor reads through the new
--       "View Vendors - Authorized Roles" policy and grant (b). Net on the
--       table: still Y. Do not read this line in isolation.)
--   projects                "View Projects - Admins/EXCO"
--       - secretary, - security_officer
--   project_milestones      "View Milestones - Admins/EXCO"
--       - secretary, - security_officer
--   personnel_engagements   "Manage Personnel Engagements - Authorized Roles"
--       - secretary, - project_manager, - security_officer *on paper only*;
--       nothing observable moves. See the note below.
--
--   Plus the six dropped open-read policies, which remove SELECT for every
--   role that does not hold the relevant permission -- including the
--   `resident` role -- on budgets, expense_categories, vendors,
--   generated_reports, report_schedules and personnel_engagements.
--
-- NET READ ACCESS on the three tables whose read path this migration
-- restructures -- this is the number that matters, not the per-policy view:
--
--   budgets             Y: super_admin, chairman, vice_chairman,
--                          financial_officer
--   expense_categories  Y: super_admin, chairman, vice_chairman,
--                          financial_officer
--   vendors             Y: super_admin, chairman, vice_chairman,
--                          financial_officer
--   all three           .: secretary, project_manager, security_officer,
--                          resident
--
-- NO MOVEMENT AT ALL:
--
--   two_factor_audit_log    "Admins can view all audit logs"
--       Exact 1:1. The old list was super_admin, chairman, security_officer;
--       two_factor.view_audit_log is held by exactly those three.
--
-- ---------------------------------------------------------------------------
-- personnel_engagements is currently unreachable -- do not be misled
-- ---------------------------------------------------------------------------
-- personnel_engagements has NO table-level grants at all: neither `anon` nor
-- `authenticated` holds SELECT/INSERT/UPDATE/DELETE on it. Table grants are
-- checked BEFORE RLS, so its policies are dead code and nothing on this table
-- is reachable from PostgREST today whatever the policies say. That is why its
-- narrowing above is "on paper only".
--
-- No grants are added here (user decision). Its policies are rewritten for
-- consistency so that whoever does grant the table later inherits the
-- permission-based rule rather than the `exco`-branch one. If you are reading
-- this because the table looks broken: it is not the policies, it is the
-- missing GRANT.
--
-- ---------------------------------------------------------------------------
-- invoice_generation_log: the anon branch is deleted, not preserved
-- ---------------------------------------------------------------------------
-- invoice_generation_log_select currently reads
-- `((auth.uid() IS NULL) OR (EXISTS (...)))`, and `anon` holds table-level
-- SELECT on the table. The first branch is an unconditional allow for any
-- caller with no JWT.
--
-- Anon is denied today only INCIDENTALLY: evaluating the second branch reads
-- `profiles` and raises `permission denied for function get_my_role_name`,
-- which aborts the query. That is an error, not an authorization decision, and
-- it depends on Postgres choosing not to short-circuit the OR. Reverse that
-- evaluation order and the table is world-readable. The whole expression is
-- therefore replaced by the single has_permission() call; the anon branch is
-- deleted outright and must not be restored.
--
-- ---------------------------------------------------------------------------
-- Every rewritten policy is scoped TO authenticated -- including 14 that were
-- not, which is a fix and not a drive-by
-- ---------------------------------------------------------------------------
-- Fourteen of these policies were live on the PUBLIC database role, with no
-- TO clause at all: expenses (both), projects (both), project_milestones
-- (both), generated_reports (both), report_schedules (all four),
-- invoice_generation_log, paystack_transactions. All fourteen are re-scoped
-- `TO authenticated` here. Measured on the live database on 2026-09-06:
--
--   * EXECUTE on has_permission(text): anon = FALSE, authenticated = true
--     (revoked from anon by
--     20260829100200_gate_auth_helpers_on_approval_status.sql).
--   * `anon` holds a table-level SELECT grant on ALL SEVEN of the tables
--     involved, so RLS is genuinely reached for an unauthenticated caller.
--   * `service_role` and `postgres` both have rolbypassrls = true, so
--     narrowing a policy to `authenticated` cannot affect service traffic.
--
-- Left on PUBLIC, these policies would raise `42501: permission denied for
-- function has_permission` -- an HTTP 500 -- for an unauthenticated caller,
-- instead of returning an empty result set. #186's header calls
-- `TO authenticated` "required, not cosmetic" for exactly this reason.
--
-- This is NOT a regression introduced here. All seven tables already error for
-- anon today, because the predicate being replaced reads `profiles` and trips
-- `permission denied for function get_my_role_name`. It is 500-before and
-- 500-after if nothing is done -- a pre-existing defect this migration is in a
-- position to close, which is why it is closed here rather than deferred to
-- #237. Either way anon is DENIED; the change is to the failure mode, not to
-- access.
--
-- The remaining rewritten policies were already {authenticated} and stay that
-- way: budgets, expense_categories and vendors (re-scoped by #212's
-- 20260905003000), personnel_engagements, two_factor_audit_log,
-- impersonation_sessions, and the storage.objects policy. The three NEW SELECT
-- policies are created TO authenticated for the same reason.
--
-- The ROLLBACK block deliberately does NOT carry the TO clause on those
-- fourteen. See its own note.
--
-- ---------------------------------------------------------------------------
-- Mechanics
-- ---------------------------------------------------------------------------
-- has_permission() is SECURITY DEFINER
-- (20251222000000_create_rbac_system.sql) and additionally requires
-- profiles.approval_status = 'active'
-- (20260829100200_gate_auth_helpers_on_approval_status.sql). That matters
-- twice: evaluating it inside these policies does not recurse through RLS --
-- and every predicate it replaces reads `profiles`, the table whose own RLS
-- would otherwise be in the loop -- and a pending or suspended account is not
-- admitted even if its role holds the permission.
--
-- FOR ALL and FOR UPDATE policies set BOTH USING and WITH CHECK. Postgres
-- defaults WITH CHECK to the USING expression when it is omitted, so stating
-- it is not a behaviour change -- it is stated so that a later hand-edit of
-- one clause cannot leave the read and write sides silently disagreeing.
--
-- Written to be safely re-runnable: every policy name is dropped with
-- IF EXISTS immediately before its CREATE POLICY, the names are unchanged, and
-- every catalogue insert is ON CONFLICT DO NOTHING.
--
-- This migration is NOT applied by the authoring session. Apply and verify
-- manually, then check it into the applied-migrations record per
-- docs/agents/migrations-on-merge.md and CORE.md section 11.
-- ============================================================================

-- ============================================================================
-- ROLLBACK: restores all 27 previous policy definitions, drops the 3 policies
--           this migration creates, and removes the catalogue rows it adds
-- ============================================================================
-- The 27 CREATE POLICY statements below are transcribed VERBATIM from live
-- pg_policies as it stood on 2026-09-06 -- 21 rewritten policies plus the 6
-- open-read siblings dropped in step 4. They are not reconstructed from the
-- original CREATE TABLE migrations, which do not match live: several of these
-- policies were altered in place by later migrations (#212's 20260905003000
-- re-scoped three of them from {public} to {authenticated}), and the legacy
-- role names in the source files spell values that were never in the
-- `user_role` enum.
--
-- The storage.objects entry is rendered the way Postgres normalises it, which
-- is not character-identical to the source migration that created it:
-- 20260118090000_add_hybrid_payments.sql:41-51 writes `(SELECT name FROM ...)
-- IN ('super_admin', 'chairman', 'financial_officer')`, and live pg_policy
-- reports the same predicate as `(SELECT ar.name FROM ...)::text = ANY
-- (ARRAY[...]::text[])`. The live rendering is used, per the rule above. Its
-- `TO authenticated` is from the source file, where it is explicit.
--
-- *** The `TO` clauses below are NOT uniform, and that is faithful, not an
-- oversight. *** Fourteen of these statements say `TO public` and twelve say
-- `TO authenticated`, because that is what was live. (`TO public` is the
-- explicit spelling of what those fourteen policies show in pg_policies;
-- PUBLIC is also what Postgres assumes when the clause is omitted entirely, so
-- the two forms are equivalent and either restores the same privilege state.)
-- The migration body re-scopes those fourteen to `authenticated` -- see the
-- header section on that -- so restoring them here as `TO authenticated` would
-- quietly keep half of this migration's effect while claiming to undo it. A
-- rollback that restores the policy but not the privilege state is not a
-- rollback.
--
-- The storage.objects entry's `TO authenticated` sits on its second line
-- rather than inline, because that statement is wrapped; it is a real grantee,
-- not a missing one.
--
-- No table-level GRANT/REVOKE is issued by this migration in either direction,
-- so none is undone here. personnel_engagements is left with no grants, which
-- is the state it was in before.
--
-- The DROP statements for the three new SELECT policies, and the DELETE
-- statements for the catalogue rows, are as much a part of the rollback as the
-- policies. Restoring the policies without removing the catalogue rows would
-- leave vice_chairman holding six finance/projects permissions and
-- financial_officer holding view_vendors, none of which they had, and would
-- leave an orphaned reports.manage_schedules that nothing gates on. Order is
-- deliberate: role_permissions rows go before the app_permissions row they
-- reference.
--
-- These are SQL comments, not executable statements. The legacy-role migration
-- ratchet (src/__tests__/legacy-role-migration-ratchet.test.ts) strips comments
-- before scanning, so preserving the old predicates here does not put this file
-- on its allowlist.
--
-- BEGIN;
--
-- DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles" ON public.budgets;
-- CREATE POLICY "Manage Budgets - Authorized Roles" ON public.budgets AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('admin'::character varying)::text, ('financial_secretary'::character varying)::text, ('chairman'::character varying)::text, ('financial_officer'::character varying)::text])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "View Budgets - Admins/Financial Secretary" ON public.budgets;
-- CREATE POLICY "View Budgets - Admins/Financial Secretary" ON public.budgets AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--
-- DROP POLICY IF EXISTS "Manage Categories - Authorized Roles" ON public.expense_categories;
-- CREATE POLICY "Manage Categories - Authorized Roles" ON public.expense_categories AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('admin'::character varying)::text, ('financial_secretary'::character varying)::text, ('chairman'::character varying)::text, ('financial_officer'::character varying)::text])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "View Categories - Admins/Financial Secretary" ON public.expense_categories;
-- CREATE POLICY "View Categories - Admins/Financial Secretary" ON public.expense_categories AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--
-- DROP POLICY IF EXISTS "Manage Expenditure - Authorized Roles" ON public.expenses;
-- CREATE POLICY "Manage Expenditure - Authorized Roles" ON public.expenses AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "View Expenditure - Admins/Financial Secretary" ON public.expenses;
-- CREATE POLICY "View Expenditure - Admins/Financial Secretary" ON public.expenses AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying])::text[])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "Authenticated users can view generated reports" ON public.generated_reports;
-- CREATE POLICY "Authenticated users can view generated reports" ON public.generated_reports AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--
-- DROP POLICY IF EXISTS generated_reports_delete ON public.generated_reports;
-- CREATE POLICY generated_reports_delete ON public.generated_reports AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((p.role_id = ar.id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS generated_reports_select ON public.generated_reports;
-- CREATE POLICY generated_reports_select ON public.generated_reports AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((p.role_id = ar.id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS super_admin_read_all_impersonation_sessions ON public.impersonation_sessions;
-- CREATE POLICY super_admin_read_all_impersonation_sessions ON public.impersonation_sessions AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((ar.id = p.role_id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = 'super_admin'::text)))));
--
-- DROP POLICY IF EXISTS invoice_generation_log_select ON public.invoice_generation_log;
-- CREATE POLICY invoice_generation_log_select ON public.invoice_generation_log AS PERMISSIVE FOR SELECT TO public USING (((auth.uid() IS NULL) OR (EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((p.role_id = ar.id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])))))));
--
-- DROP POLICY IF EXISTS paystack_transactions_admin_all ON public.paystack_transactions;
-- CREATE POLICY paystack_transactions_admin_all ON public.paystack_transactions AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((r.id = p.role_id)))
--   WHERE ((p.id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS "Manage Personnel Engagements - Authorized Roles" ON public.personnel_engagements;
-- CREATE POLICY "Manage Personnel Engagements - Authorized Roles" ON public.personnel_engagements AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((r.id = p.role_id)))
--   WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text)))))) WITH CHECK ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((r.id = p.role_id)))
--   WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "View Personnel Engagements - Internal" ON public.personnel_engagements;
-- CREATE POLICY "View Personnel Engagements - Internal" ON public.personnel_engagements AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--
-- DROP POLICY IF EXISTS "Manage Milestones - Admins/Project Manager" ON public.project_milestones;
-- CREATE POLICY "Manage Milestones - Admins/Project Manager" ON public.project_milestones AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'project_manager'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS "View Milestones - Admins/EXCO" ON public.project_milestones;
-- CREATE POLICY "View Milestones - Admins/EXCO" ON public.project_milestones AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'project_manager'::character varying])::text[])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "Manage Projects - Admins/Project Manager" ON public.projects;
-- CREATE POLICY "Manage Projects - Admins/Project Manager" ON public.projects AS PERMISSIVE FOR ALL TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'project_manager'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS "View Projects - Admins/EXCO" ON public.projects;
-- CREATE POLICY "View Projects - Admins/EXCO" ON public.projects AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'admin'::character varying, 'financial_secretary'::character varying, 'project_manager'::character varying])::text[])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "Authenticated users can view report schedules" ON public.report_schedules;
-- CREATE POLICY "Authenticated users can view report schedules" ON public.report_schedules AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--
-- DROP POLICY IF EXISTS report_schedules_delete ON public.report_schedules;
-- CREATE POLICY report_schedules_delete ON public.report_schedules AS PERMISSIVE FOR DELETE TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((p.role_id = ar.id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS report_schedules_insert ON public.report_schedules;
-- CREATE POLICY report_schedules_insert ON public.report_schedules AS PERMISSIVE FOR INSERT TO public WITH CHECK ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((p.role_id = ar.id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS report_schedules_select ON public.report_schedules;
-- CREATE POLICY report_schedules_select ON public.report_schedules AS PERMISSIVE FOR SELECT TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((p.role_id = ar.id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS report_schedules_update ON public.report_schedules;
-- CREATE POLICY report_schedules_update ON public.report_schedules AS PERMISSIVE FOR UPDATE TO public USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles ar ON ((p.role_id = ar.id)))
--   WHERE ((p.id = auth.uid()) AND ((ar.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'financial_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.two_factor_audit_log;
-- CREATE POLICY "Admins can view all audit logs" ON public.two_factor_audit_log AS PERMISSIVE FOR SELECT TO authenticated USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND ((r.name)::text = ANY ((ARRAY['super_admin'::character varying, 'chairman'::character varying, 'security_officer'::character varying])::text[]))))));
--
-- DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles" ON public.vendors;
-- CREATE POLICY "Manage Vendors - Authorized Roles" ON public.vendors AS PERMISSIVE FOR ALL TO authenticated USING ((EXISTS ( SELECT 1
--    FROM (profiles p
--      JOIN app_roles r ON ((p.role_id = r.id)))
--   WHERE ((p.id = auth.uid()) AND (((r.name)::text = ANY (ARRAY[('super_admin'::character varying)::text, ('admin'::character varying)::text, ('financial_secretary'::character varying)::text, ('chairman'::character varying)::text, ('financial_officer'::character varying)::text])) OR ((r.category)::text = 'exco'::text))))));
--
-- DROP POLICY IF EXISTS "View Vendors - Admins/Financial Secretary" ON public.vendors;
-- CREATE POLICY "View Vendors - Admins/Financial Secretary" ON public.vendors AS PERMISSIVE FOR SELECT TO authenticated USING (true);
--
-- -- ---- storage schema (missed by any `schemaname = 'public'` query) -------
-- DROP POLICY IF EXISTS "Admins can view all payment proofs" ON storage.objects;
-- CREATE POLICY "Admins can view all payment proofs"
--   ON storage.objects AS PERMISSIVE FOR SELECT TO authenticated
--   USING (((bucket_id = 'payment-proofs') AND
--          ((SELECT ar.name FROM app_roles ar JOIN profiles pr ON pr.role_id = ar.id WHERE pr.id = auth.uid())::text
--            = ANY (ARRAY['super_admin','chairman','financial_officer']::text[]))));
--
-- -- ---- remove the three SELECT policies this migration creates ------------
-- DROP POLICY IF EXISTS "View Budgets - Authorized Roles" ON public.budgets;
-- DROP POLICY IF EXISTS "View Categories - Authorized Roles" ON public.expense_categories;
-- DROP POLICY IF EXISTS "View Vendors - Authorized Roles" ON public.vendors;
--
-- -- ---- catalogue: undo the six vice_chairman grants ----------------------
-- DELETE FROM role_permissions rp
-- USING app_roles r, app_permissions p
-- WHERE rp.role_id = r.id
--   AND rp.permission_id = p.id
--   AND r.name = 'vice_chairman'
--   AND p.name IN (
--     'manage_expenditure', 'view_expenditure',
--     'manage_vendors', 'view_vendors',
--     'manage_projects', 'view_projects'
--   );
--
-- -- ---- catalogue: undo the financial_officer view_vendors grant -----------
-- DELETE FROM role_permissions rp
-- USING app_roles r, app_permissions p
-- WHERE rp.role_id = r.id
--   AND rp.permission_id = p.id
--   AND r.name = 'financial_officer'
--   AND p.name = 'view_vendors';
--
-- -- ---- catalogue: undo reports.manage_schedules ---------------------------
-- DELETE FROM role_permissions rp
-- USING app_roles r, app_permissions p
-- WHERE rp.role_id = r.id
--   AND rp.permission_id = p.id
--   AND r.name IN ('super_admin', 'chairman', 'financial_officer', 'vice_chairman')
--   AND p.name = 'reports.manage_schedules';
--
-- DELETE FROM app_permissions WHERE name = 'reports.manage_schedules';
--
-- COMMIT;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. New permission: reports.manage_schedules
-- ---------------------------------------------------------------------------
-- The `reports` category is entirely read-shaped; nothing in it covers
-- managing report schedules. See the header for why report_subscriptions.manage
-- is not a substitute. Category `reports` already exists in
-- permission_category, so no ALTER TYPE is required.
INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  (
    'reports.manage_schedules',
    'Manage Report Schedules',
    'Can create, edit and delete scheduled reports and delete generated report artefacts',
    'reports',
    true
  )
ON CONFLICT (name) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'financial_officer', 'vice_chairman')
  AND p.name = 'reports.manage_schedules'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Catalogue grants
-- ---------------------------------------------------------------------------
-- (a) vice_chairman gains the six unprefixed finance/projects permissions.
--
-- Deliberate, user-approved catalogue widening. It makes step 3
-- access-preserving for vice_chairman, which holds all six of those tables
-- today only through the `exco` branch the rewrite retires. This MUST run
-- before the policies below, or the migration narrows vice_chairman off
-- expenses, vendors, projects and project_milestones.
--
-- These six names have NO category prefix in app_permissions. That is correct
-- and must not be "fixed" -- has_permission() on a name that does not exist
-- returns FALSE silently.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'vice_chairman'
  AND p.name IN (
    'manage_expenditure', 'view_expenditure',
    'manage_vendors', 'view_vendors',
    'manage_projects', 'view_projects'
  )
ON CONFLICT DO NOTHING;

-- (b) financial_officer gains view_vendors.
--
-- financial_officer does NOT hold manage_vendors and never did -- it reads
-- `vendors` today only through the open policy dropped in step 4. Without this
-- grant, `vendors` goes from Y to `.` for financial_officer, and because
-- src/actions/expenses/get-expenses.ts embeds `vendor:vendors(name)` (PostgREST
-- applies the embedded table's RLS), the expense list silently renders blank
-- vendor names for that role. See the header.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'financial_officer'
  AND p.name = 'view_vendors'
ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3. Rewrite the 21 policies
-- ---------------------------------------------------------------------------
-- Every policy below is scoped TO authenticated. Fourteen of them were
-- previously on the PUBLIC role with no TO clause; has_permission() has
-- EXECUTE revoked from `anon`, and `anon` holds table-level SELECT on all
-- seven tables involved, so leaving them on PUBLIC turns an unauthenticated
-- read into a 42501 error instead of an empty set. See the header.

-- ---- budgets --------------------------------------------------------------
DROP POLICY IF EXISTS "Manage Budgets - Authorized Roles" ON public.budgets;
CREATE POLICY "Manage Budgets - Authorized Roles"
  ON public.budgets FOR ALL TO authenticated
  USING (public.has_permission('manage_expenditure'))
  WITH CHECK (public.has_permission('manage_expenditure'));

-- ---- expense_categories ---------------------------------------------------
DROP POLICY IF EXISTS "Manage Categories - Authorized Roles" ON public.expense_categories;
CREATE POLICY "Manage Categories - Authorized Roles"
  ON public.expense_categories FOR ALL TO authenticated
  USING (public.has_permission('manage_expenditure'))
  WITH CHECK (public.has_permission('manage_expenditure'));

-- ---- expenses -------------------------------------------------------------
DROP POLICY IF EXISTS "Manage Expenditure - Authorized Roles" ON public.expenses;
CREATE POLICY "Manage Expenditure - Authorized Roles"
  ON public.expenses FOR ALL TO authenticated
  USING (public.has_permission('manage_expenditure'))
  WITH CHECK (public.has_permission('manage_expenditure'));

DROP POLICY IF EXISTS "View Expenditure - Admins/Financial Secretary" ON public.expenses;
CREATE POLICY "View Expenditure - Admins/Financial Secretary"
  ON public.expenses FOR SELECT TO authenticated
  USING (public.has_permission('view_expenditure'));

-- ---- vendors --------------------------------------------------------------
-- financial_officer does NOT hold manage_vendors and loses vendor *management*
-- here. That is the `exco` branch being retired. It keeps vendor *reads*
-- through the new SELECT policy in step 3b plus grant (b) above -- do not read
-- this policy in isolation and conclude the role lost the table.
DROP POLICY IF EXISTS "Manage Vendors - Authorized Roles" ON public.vendors;
CREATE POLICY "Manage Vendors - Authorized Roles"
  ON public.vendors FOR ALL TO authenticated
  USING (public.has_permission('manage_vendors'))
  WITH CHECK (public.has_permission('manage_vendors'));

-- ---- personnel_engagements ------------------------------------------------
-- This table has no table-level grants, so its policies are dead code and
-- nothing observable moves. Rewritten for consistency only. See the header
-- before concluding the table is broken.
DROP POLICY IF EXISTS "Manage Personnel Engagements - Authorized Roles" ON public.personnel_engagements;
CREATE POLICY "Manage Personnel Engagements - Authorized Roles"
  ON public.personnel_engagements FOR ALL TO authenticated
  USING (public.has_permission('manage_expenditure'))
  WITH CHECK (public.has_permission('manage_expenditure'));

-- ---- projects -------------------------------------------------------------
DROP POLICY IF EXISTS "Manage Projects - Admins/Project Manager" ON public.projects;
CREATE POLICY "Manage Projects - Admins/Project Manager"
  ON public.projects FOR ALL TO authenticated
  USING (public.has_permission('manage_projects'))
  WITH CHECK (public.has_permission('manage_projects'));

DROP POLICY IF EXISTS "View Projects - Admins/EXCO" ON public.projects;
CREATE POLICY "View Projects - Admins/EXCO"
  ON public.projects FOR SELECT TO authenticated
  USING (public.has_permission('view_projects'));

-- ---- project_milestones ---------------------------------------------------
DROP POLICY IF EXISTS "Manage Milestones - Admins/Project Manager" ON public.project_milestones;
CREATE POLICY "Manage Milestones - Admins/Project Manager"
  ON public.project_milestones FOR ALL TO authenticated
  USING (public.has_permission('manage_projects'))
  WITH CHECK (public.has_permission('manage_projects'));

DROP POLICY IF EXISTS "View Milestones - Admins/EXCO" ON public.project_milestones;
CREATE POLICY "View Milestones - Admins/EXCO"
  ON public.project_milestones FOR SELECT TO authenticated
  USING (public.has_permission('view_projects'));

-- ---- report_schedules -----------------------------------------------------
-- The RESTRICTIVE "Approved accounts only can read" policy on this table is
-- left in place; it ANDs with these and is orthogonal.
DROP POLICY IF EXISTS report_schedules_select ON public.report_schedules;
CREATE POLICY report_schedules_select
  ON public.report_schedules FOR SELECT TO authenticated
  USING (public.has_permission('reports.manage_schedules'));

DROP POLICY IF EXISTS report_schedules_insert ON public.report_schedules;
CREATE POLICY report_schedules_insert
  ON public.report_schedules FOR INSERT TO authenticated
  WITH CHECK (public.has_permission('reports.manage_schedules'));

DROP POLICY IF EXISTS report_schedules_update ON public.report_schedules;
CREATE POLICY report_schedules_update
  ON public.report_schedules FOR UPDATE TO authenticated
  USING (public.has_permission('reports.manage_schedules'))
  WITH CHECK (public.has_permission('reports.manage_schedules'));

DROP POLICY IF EXISTS report_schedules_delete ON public.report_schedules;
CREATE POLICY report_schedules_delete
  ON public.report_schedules FOR DELETE TO authenticated
  USING (public.has_permission('reports.manage_schedules'));

-- ---- generated_reports ----------------------------------------------------
-- Read is the financial-report read permission; deleting a generated artefact
-- is schedule management, not reading.
DROP POLICY IF EXISTS generated_reports_select ON public.generated_reports;
CREATE POLICY generated_reports_select
  ON public.generated_reports FOR SELECT TO authenticated
  USING (public.has_permission('reports.view_financial'));

DROP POLICY IF EXISTS generated_reports_delete ON public.generated_reports;
CREATE POLICY generated_reports_delete
  ON public.generated_reports FOR DELETE TO authenticated
  USING (public.has_permission('reports.manage_schedules'));

-- ---- invoice_generation_log -----------------------------------------------
-- The `auth.uid() IS NULL` branch is deleted, not preserved. `anon` holds a
-- table-level SELECT grant here, and that branch was an unconditional allow
-- for any caller with no JWT; it survived only because evaluating the other
-- branch happened to error first. See the header.
DROP POLICY IF EXISTS invoice_generation_log_select ON public.invoice_generation_log;
CREATE POLICY invoice_generation_log_select
  ON public.invoice_generation_log FOR SELECT TO authenticated
  USING (public.has_permission('billing.create_invoice'));

-- ---- paystack_transactions ------------------------------------------------
DROP POLICY IF EXISTS paystack_transactions_admin_all ON public.paystack_transactions;
CREATE POLICY paystack_transactions_admin_all
  ON public.paystack_transactions FOR ALL TO authenticated
  USING (public.has_permission('payments.update'))
  WITH CHECK (public.has_permission('payments.update'));

-- ---- two_factor_audit_log -------------------------------------------------
-- Exact 1:1 with the old role list. No access moves on this one.
DROP POLICY IF EXISTS "Admins can view all audit logs" ON public.two_factor_audit_log;
CREATE POLICY "Admins can view all audit logs"
  ON public.two_factor_audit_log FOR SELECT TO authenticated
  USING (public.has_permission('two_factor.view_audit_log'));

-- ---- impersonation_sessions -----------------------------------------------
-- Deliberate, user-approved widening: chairman gains read on the impersonation
-- session log, because impersonation.view_sessions is held by chairman and
-- super_admin. Do not narrow this back to super_admin.
DROP POLICY IF EXISTS super_admin_read_all_impersonation_sessions ON public.impersonation_sessions;
CREATE POLICY super_admin_read_all_impersonation_sessions
  ON public.impersonation_sessions FOR SELECT TO authenticated
  USING (public.has_permission('impersonation.view_sessions'));

-- ---- storage.objects (the 21st policy -- NOT in the public schema) ---------
-- Gates the `payment-proofs` bucket. The bucket_id test is preserved verbatim;
-- only the role-name subquery is replaced. payments.update, not payments.view:
-- the latter would admit project_manager and secretary to every resident's
-- uploaded proof of payment. Same permission as paystack_transactions above,
-- which holds the same data class.
--
-- The two resident-scoped policies on this bucket ("Residents can upload their
-- own payment proofs", "Residents can view their own payment proofs",
-- 20260118090000_add_hybrid_payments.sql:22-38) are deliberately NOT touched:
-- they key on storage.foldername(name)[1] = auth.uid()::text, which is
-- ownership, not a role name, and dropping them would remove residents' access
-- to their own uploads.
DROP POLICY IF EXISTS "Admins can view all payment proofs" ON storage.objects;
CREATE POLICY "Admins can view all payment proofs"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'payment-proofs'
    AND public.has_permission('payments.update')
  );

-- ---------------------------------------------------------------------------
-- 3b. Three NEW SELECT policies: budgets, expense_categories, vendors
-- ---------------------------------------------------------------------------
-- These tables had no permission-keyed read policy at all -- reads came from
-- the open `USING (true)` policy dropped in step 4, plus the FOR ALL manage
-- policy. Without these, a holder of view_expenditure / view_vendors who
-- cannot also *manage* would see three silently empty tables.
--
-- The vendors one is load-bearing today (it is what keeps financial_officer's
-- expense list populated -- see grant (b)). The two view_expenditure ones move
-- no cell today, because view_expenditure and manage_expenditure are held by
-- the same four roles; they exist so the trap cannot reappear the moment
-- someone is given view-only finance access. Do not delete them as dead code.
--
-- Named "... - Authorized Roles" rather than "... - Admins/Financial
-- Secretary", so they do not collide with the dropped generation by name.
DROP POLICY IF EXISTS "View Budgets - Authorized Roles" ON public.budgets;
CREATE POLICY "View Budgets - Authorized Roles"
  ON public.budgets FOR SELECT TO authenticated
  USING (public.has_permission('view_expenditure'));

DROP POLICY IF EXISTS "View Categories - Authorized Roles" ON public.expense_categories;
CREATE POLICY "View Categories - Authorized Roles"
  ON public.expense_categories FOR SELECT TO authenticated
  USING (public.has_permission('view_expenditure'));

DROP POLICY IF EXISTS "View Vendors - Authorized Roles" ON public.vendors;
CREATE POLICY "View Vendors - Authorized Roles"
  ON public.vendors FOR SELECT TO authenticated
  USING (public.has_permission('view_vendors'));

-- ---------------------------------------------------------------------------
-- 4. Drop the six `USING (true)` open-read siblings
-- ---------------------------------------------------------------------------
-- Not recreated. RLS policies are OR-ed, so leaving any of these in place
-- would make the SELECT rewrites above move no access at all. Measured on
-- 2026-09-06: an active `resident` reads 15/15 expense categories, 7/7
-- generated reports and 1/1 report schedule through these.
--
-- The first three are superseded by the step-3b policies above; the last three
-- by the sibling policies rewritten in step 3.
DROP POLICY IF EXISTS "View Budgets - Admins/Financial Secretary" ON public.budgets;
DROP POLICY IF EXISTS "View Categories - Admins/Financial Secretary" ON public.expense_categories;
DROP POLICY IF EXISTS "View Vendors - Admins/Financial Secretary" ON public.vendors;
DROP POLICY IF EXISTS "Authenticated users can view generated reports" ON public.generated_reports;
DROP POLICY IF EXISTS "Authenticated users can view report schedules" ON public.report_schedules;
DROP POLICY IF EXISTS "View Personnel Engagements - Internal" ON public.personnel_engagements;

COMMIT;
