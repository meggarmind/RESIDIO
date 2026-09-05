-- ============================================================================
-- Migration: 14 secrets / financial / billing RLS policies follow
--            has_permission(), not the legacy profiles.role column
-- ============================================================================
-- Purpose: Issue #186 (epic #180). Fourteen policies across fourteen tables
--          still authorize by reading `profiles.role` directly, bypassing the
--          RBAC system (app_roles / role_permissions / has_permission())
--          entirely. `profiles.role` is the dead vocabulary per ADR-0007:
--          get_my_role() stopped reading it, handle_new_user() writes NULL to
--          it, and epic #182 drops it. Any policy still reading it silently
--          changes meaning the moment that column goes.
--
--          Each policy below keeps its exact name and command and is rewritten
--          to a single public.has_permission('<name>') call. Names are kept so
--          the live policy set stays diffable by name against the #185
--          role-access matrix baseline.
--
-- Permission choice per table (each verified against role_permissions before
-- this migration was written -- do NOT re-derive it from the policy's old role
-- list, which is the very thing being retired):
--
--   estate_bank_account_passwords  ALL     email_imports.manage_passwords
--   gmail_oauth_credentials        ALL     email_imports.configure
--   whatsapp_provider_credentials  ALL     whatsapp.manage
--   email_imports                  ALL     email_imports.view
--   email_messages                 ALL     email_imports.view
--   email_transactions             ALL     email_imports.view
--   payment_records                ALL     payments.update
--   wallet_payment_batches         ALL     billing.manage_wallets
--   wallet_payment_batch_items     ALL     billing.manage_wallets
--   billing_profile_versions       SELECT  billing.manage_profiles
--   billing_profile_version_items  SELECT  billing.manage_profiles
--   invoice_generation_runs        SELECT  billing.create_invoice
--   invoice_generation_candidates  SELECT  billing.create_invoice
--   invoice_generation_approvals   SELECT  billing.create_invoice
--
-- Access change (deliberate -- this is a widening, not pure cleanup):
--
--   A role with no legacy equivalent holds `profiles.role = NULL` (see
--   LEGACY_ROLE_MAP in src/actions/roles/assign-role.ts, which maps only
--   super_admin, chairman, financial_officer and security_officer to a legacy
--   bucket). Such a role is therefore DENIED by all fourteen of these policies
--   today no matter what it holds in RBAC. Rewriting to has_permission()
--   grants it access wherever it holds the permission:
--
--     * vice_chairman gains all fourteen tables.
--     * project_manager gains read on billing_profile_versions and
--       billing_profile_version_items, because billing.manage_profiles
--       includes it. billing.create_invoice would have preserved the old set
--       exactly, but these two tables *are* billing profiles.
--     * financial_officer LOSES estate_bank_account_passwords.
--       email_imports.manage_passwords is held by super_admin and chairman
--       only. This is a deliberate narrowing: the table holds decryptable bank
--       credentials and that permission is the one named for it. Gating a
--       password vault on email_imports.view to preserve the old set would
--       carry forward exactly the defect ADR-0007 identifies.
--
--   payment_records is worth noting for the opposite reason: payments.update
--   is held by exactly the roles the legacy policy admitted, so this FOR ALL
--   policy keeps its shape with zero movement for the remaining roles.
--
--   Note this is the OPPOSITE direction from the bucket-collapse hazard in
--   #190, which concerns the get_my_role() policies where vice_chairman IS
--   collapsed into chairman. The two populations are disjoint; do not carry
--   reasoning from one to the other.
--
-- Three further matrix cells move that are NOT access changes -- read this
-- before adjudicating the post-apply diff:
--
--   In the #185 baseline, wallet_payment_batch_items reads `row-dependent` for
--   EVERY role, because both of its policies reference `batch_id` and the probe
--   resolves any column reference to `row-dependent` rather than deciding it.
--   Once the admin policy here becomes an unconditional has_permission() call,
--   that cell resolves to `allow` for super_admin, chairman AND
--   financial_officer as well as vice_chairman. Only the vice_chairman move is
--   a real grant; the other three are the probe finally able to prove what the
--   old policy already did. Expect four moved rows on that table, not one.
--
-- Post-apply verification. financial_officer:estate_bank_account_passwords goes
-- allow -> deny, and the diff tool exits non-zero on an undeclared narrowing,
-- so that one narrowing must be declared explicitly:
--
--   npm run rbac:matrix:diff -- fresh.json --expect financial_officer:estate_bank_account_passwords=deny
--
-- has_permission() is SECURITY DEFINER (20251222000000_create_rbac_system.sql)
-- and additionally requires profiles.approval_status = 'active'
-- (20260829100200_gate_auth_helpers_on_approval_status.sql). That matters
-- twice here: evaluating it inside these policies does not recurse through RLS
-- -- and every predicate it replaces reads `profiles`, the table whose own RLS
-- would otherwise be in the loop -- and a pending or suspended account is not
-- admitted even if its role holds the permission.
--
-- `TO authenticated` is required, not cosmetic: has_permission(text) has
-- EXECUTE revoked from `anon` (20260829100200), so a policy with no TO clause
-- applies to PUBLIC including anon, and an unauthenticated query would raise
-- "permission denied for function has_permission" (a 500) instead of returning
-- an empty set. Scoping to `authenticated` keeps the failure mode an empty
-- result set.
--
-- FOR ALL policies set BOTH USING and WITH CHECK. Postgres defaults WITH CHECK
-- to the USING expression when it is omitted, so stating it is not a behaviour
-- change -- it is stated so that a later hand-edit of one clause cannot leave
-- the read and write sides silently disagreeing.
--
-- Policies deliberately NOT touched. These are resident-scoped SELECT policies
-- on three of the same tables, not legacy-vocabulary readers; dropping them
-- would silently remove residents' access to their own records:
--   "Residents can view own payments"                   ON payment_records
--   "Residents can view own wallet payment batches"     ON wallet_payment_batches
--   "Residents can view own wallet payment batch items" ON wallet_payment_batch_items
-- audit_logs was migrated separately by #181 and is not touched here. The
-- unguarded storage.objects policies on the email-imports bucket are #206 --
-- they read bucket_id and nothing else, so they are not legacy readers, and
-- fixing them inside a refactor slice would hide a security fix behind one.
--
-- Written to be safely re-runnable: every policy name is dropped with
-- IF EXISTS immediately before its CREATE POLICY, and the names are unchanged,
-- so a second apply does not abort with 42710 (duplicate policy).
--
-- This migration is NOT applied by the authoring session. Apply and verify
-- manually, then check it into the applied-migrations record per
-- docs/agents/migrations-on-merge.md.
-- ============================================================================

-- ============================================================================
-- ROLLBACK: restores all fourteen previous policy definitions
-- ============================================================================
-- Predicates transcribed from the live pg_policies definitions as they stood
-- before this migration, NOT from the original CREATE TABLE migrations. Those
-- files are not a reliable source for the predicate:
-- 20260107100000_create_email_import_schema.sql spells the legacy financial
-- role 'financial_officer', which is not a member of the `user_role` enum
-- ('chairman', 'financial_secretary', 'security_officer', 'admin'), so what is
-- live differs from what that file says.
--
-- The `TO` clauses below are NOT uniform, and the difference is faithful, not
-- an oversight. Live `pg_policies.roles` splits exactly the way the checked-in
-- source migrations imply:
--
--   {public} -- no TO clause at all -- on the nine FOR ALL policies:
--     estate_bank_account_passwords, gmail_oauth_credentials,
--     whatsapp_provider_credentials, email_imports, email_messages,
--     email_transactions, payment_records, wallet_payment_batches,
--     wallet_payment_batch_items.
--   {authenticated} on the five billing/invoice SELECT policies, which
--     20260812235852_invoice_generation_redesign.sql wrote with an explicit
--     TO authenticated.
--
-- The nine are restored with no TO clause because that is what they had. None
-- of them called has_permission(), so none needed a TO clause to avoid the
-- anon EXECUTE-denied failure mode described in the header above; adding one
-- on the way back would be a silent behaviour change dressed as a rollback.
-- #181's migration (20260904175458) makes the same point about the policy it
-- restores. That migration is referenced here by version rather than by
-- filename on purpose: its own guard test asserts that no other migration
-- names the permission its filename embeds.
--
-- These are SQL comments, not executable statements. The legacy-role migration
-- ratchet (src/__tests__/legacy-role-migration-ratchet.test.ts) strips comments
-- before scanning, so preserving the old predicates here does not put this file
-- on its allowlist.
--
-- BEGIN;
--
-- -- ---- secrets vaults -----------------------------------------------------
-- DROP POLICY IF EXISTS "Admin access for bank account passwords" ON public.estate_bank_account_passwords;
-- CREATE POLICY "Admin access for bank account passwords"
--   ON public.estate_bank_account_passwords FOR ALL
--   USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Admin access for gmail oauth credentials" ON public.gmail_oauth_credentials;
-- CREATE POLICY "Admin access for gmail oauth credentials"
--   ON public.gmail_oauth_credentials FOR ALL
--   USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','chairman']::user_role[])));
--
-- DROP POLICY IF EXISTS "Admin access for whatsapp provider credentials" ON public.whatsapp_provider_credentials;
-- CREATE POLICY "Admin access for whatsapp provider credentials"
--   ON public.whatsapp_provider_credentials FOR ALL
--   USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','chairman']::user_role[])));
--
-- -- ---- email import pipeline ---------------------------------------------
-- DROP POLICY IF EXISTS "Admin access for email imports" ON public.email_imports;
-- CREATE POLICY "Admin access for email imports"
--   ON public.email_imports FOR ALL
--   USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Admin access for email messages" ON public.email_messages;
-- CREATE POLICY "Admin access for email messages"
--   ON public.email_messages FOR ALL
--   USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Admin access for email transactions" ON public.email_transactions;
-- CREATE POLICY "Admin access for email transactions"
--   ON public.email_transactions FOR ALL
--   USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- -- ---- payments and wallet payment batches --------------------------------
-- DROP POLICY IF EXISTS "Admins and FinSec can manage all payments" ON public.payment_records;
-- CREATE POLICY "Admins and FinSec can manage all payments"
--   ON public.payment_records FOR ALL
--   USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches;
-- CREATE POLICY "Admin finance can manage wallet payment batches"
--   ON public.wallet_payment_batches FOR ALL
--   USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])))
--   WITH CHECK (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items;
-- CREATE POLICY "Admin finance can manage wallet payment batch items"
--   ON public.wallet_payment_batch_items FOR ALL
--   USING (batch_id IN (SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[]))))
--   WITH CHECK (batch_id IN (SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[]))));
--
-- -- ---- billing profiles and invoice generation ----------------------------
-- DROP POLICY IF EXISTS "Finance may read billing profile versions" ON public.billing_profile_versions;
-- CREATE POLICY "Finance may read billing profile versions"
--   ON public.billing_profile_versions FOR SELECT TO authenticated
--   USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Finance may read billing profile version items" ON public.billing_profile_version_items;
-- CREATE POLICY "Finance may read billing profile version items"
--   ON public.billing_profile_version_items FOR SELECT TO authenticated
--   USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Finance may read invoice generation runs" ON public.invoice_generation_runs;
-- CREATE POLICY "Finance may read invoice generation runs"
--   ON public.invoice_generation_runs FOR SELECT TO authenticated
--   USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Finance may read invoice generation candidates" ON public.invoice_generation_candidates;
-- CREATE POLICY "Finance may read invoice generation candidates"
--   ON public.invoice_generation_candidates FOR SELECT TO authenticated
--   USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- DROP POLICY IF EXISTS "Finance may read invoice generation approvals" ON public.invoice_generation_approvals;
-- CREATE POLICY "Finance may read invoice generation approvals"
--   ON public.invoice_generation_approvals FOR SELECT TO authenticated
--   USING (auth.uid() IN (SELECT profiles.id FROM profiles WHERE profiles.role = ANY (ARRAY['admin','chairman','financial_secretary']::user_role[])));
--
-- COMMIT;
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Secrets vaults
-- ---------------------------------------------------------------------------
-- estate_bank_account_passwords holds decryptable bank credentials, so it is
-- gated on the permission named for that vault rather than on the broad
-- email-import read access its old role list amounted to.
DROP POLICY IF EXISTS "Admin access for bank account passwords" ON public.estate_bank_account_passwords;
CREATE POLICY "Admin access for bank account passwords"
  ON public.estate_bank_account_passwords FOR ALL TO authenticated
  USING (public.has_permission('email_imports.manage_passwords'))
  WITH CHECK (public.has_permission('email_imports.manage_passwords'));

DROP POLICY IF EXISTS "Admin access for gmail oauth credentials" ON public.gmail_oauth_credentials;
CREATE POLICY "Admin access for gmail oauth credentials"
  ON public.gmail_oauth_credentials FOR ALL TO authenticated
  USING (public.has_permission('email_imports.configure'))
  WITH CHECK (public.has_permission('email_imports.configure'));

DROP POLICY IF EXISTS "Admin access for whatsapp provider credentials" ON public.whatsapp_provider_credentials;
CREATE POLICY "Admin access for whatsapp provider credentials"
  ON public.whatsapp_provider_credentials FOR ALL TO authenticated
  USING (public.has_permission('whatsapp.manage'))
  WITH CHECK (public.has_permission('whatsapp.manage'));

-- ---------------------------------------------------------------------------
-- Email import pipeline
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admin access for email imports" ON public.email_imports;
CREATE POLICY "Admin access for email imports"
  ON public.email_imports FOR ALL TO authenticated
  USING (public.has_permission('email_imports.view'))
  WITH CHECK (public.has_permission('email_imports.view'));

DROP POLICY IF EXISTS "Admin access for email messages" ON public.email_messages;
CREATE POLICY "Admin access for email messages"
  ON public.email_messages FOR ALL TO authenticated
  USING (public.has_permission('email_imports.view'))
  WITH CHECK (public.has_permission('email_imports.view'));

DROP POLICY IF EXISTS "Admin access for email transactions" ON public.email_transactions;
CREATE POLICY "Admin access for email transactions"
  ON public.email_transactions FOR ALL TO authenticated
  USING (public.has_permission('email_imports.view'))
  WITH CHECK (public.has_permission('email_imports.view'));

-- ---------------------------------------------------------------------------
-- Payments and wallet payment batches
-- ---------------------------------------------------------------------------
-- payments.update, not payments.view: this is a FOR ALL policy, so the
-- permission it names is the one authorizing writes. payments.view would hand
-- write access on every payment record to project_manager and secretary.
DROP POLICY IF EXISTS "Admins and FinSec can manage all payments" ON public.payment_records;
CREATE POLICY "Admins and FinSec can manage all payments"
  ON public.payment_records FOR ALL TO authenticated
  USING (public.has_permission('payments.update'))
  WITH CHECK (public.has_permission('payments.update'));

DROP POLICY IF EXISTS "Admin finance can manage wallet payment batches" ON public.wallet_payment_batches;
CREATE POLICY "Admin finance can manage wallet payment batches"
  ON public.wallet_payment_batches FOR ALL TO authenticated
  USING (public.has_permission('billing.manage_wallets'))
  WITH CHECK (public.has_permission('billing.manage_wallets'));

-- The old item predicate reached through wallet_payment_batches purely to find
-- the caller's row in profiles -- the join carried no per-batch condition. A
-- permission is a property of the caller, not of the parent batch, so the join
-- is dropped rather than preserved around the new call.
DROP POLICY IF EXISTS "Admin finance can manage wallet payment batch items" ON public.wallet_payment_batch_items;
CREATE POLICY "Admin finance can manage wallet payment batch items"
  ON public.wallet_payment_batch_items FOR ALL TO authenticated
  USING (public.has_permission('billing.manage_wallets'))
  WITH CHECK (public.has_permission('billing.manage_wallets'));

-- ---------------------------------------------------------------------------
-- Billing profile versions
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Finance may read billing profile versions" ON public.billing_profile_versions;
CREATE POLICY "Finance may read billing profile versions"
  ON public.billing_profile_versions FOR SELECT TO authenticated
  USING (public.has_permission('billing.manage_profiles'));

DROP POLICY IF EXISTS "Finance may read billing profile version items" ON public.billing_profile_version_items;
CREATE POLICY "Finance may read billing profile version items"
  ON public.billing_profile_version_items FOR SELECT TO authenticated
  USING (public.has_permission('billing.manage_profiles'));

-- ---------------------------------------------------------------------------
-- Invoice generation
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Finance may read invoice generation runs" ON public.invoice_generation_runs;
CREATE POLICY "Finance may read invoice generation runs"
  ON public.invoice_generation_runs FOR SELECT TO authenticated
  USING (public.has_permission('billing.create_invoice'));

DROP POLICY IF EXISTS "Finance may read invoice generation candidates" ON public.invoice_generation_candidates;
CREATE POLICY "Finance may read invoice generation candidates"
  ON public.invoice_generation_candidates FOR SELECT TO authenticated
  USING (public.has_permission('billing.create_invoice'));

DROP POLICY IF EXISTS "Finance may read invoice generation approvals" ON public.invoice_generation_approvals;
CREATE POLICY "Finance may read invoice generation approvals"
  ON public.invoice_generation_approvals FOR SELECT TO authenticated
  USING (public.has_permission('billing.create_invoice'));

COMMIT;
