# RLS permissive-policy consolidation (#956)

The Supabase performance advisor reports `multiple_permissive_policies` 73 times across 41 tables on
Residio_Stage (rerun 2026-10-21). Where two or more permissive policies apply to the same role and
command, Postgres evaluates every one of them for every row and combines them with OR. This document
is the read-only mapping pass that #956 requires before any migration: for each of the 41 tables, its
permissive policies per role and command, and the combined expression Postgres evaluates today.

## Source and confidence

**Stage must confirm this mapping before any migration based on it is applied.** It was derived without
database access:

- Every file in `supabase/migrations/` was replayed in filename order (`CREATE`, `ALTER` and
  `DROP POLICY`, including statements inside `DO` blocks, and `DROP TABLE`). The latest definition of
  each policy wins.
- The result was checked against `docs/validation/policy-definitions.baseline.json` (Residio_Stage
  capture, 2026-10-16). All 256 public-schema policies in that capture are present with the same
  table, name, command, roles and permissive flag, and no other policy exists on those tables. The
  only policies not in the capture are those created by migrations after 2026-10-16 (`admin_titles`,
  `recipient_groups`, `recipient_group_members`, the document taxonomy tables and the WhatsApp
  `service_role` tables).
- The seven restrictive `Approved accounts only can read` policies are created by dynamic SQL in
  `20260830090000_restrict_reference_reads_to_approved.sql`. They are taken from the capture. They
  are restrictive, so they are not part of this lint and nothing here changes them.
- The expressions shown are the migration source text (the latest `CREATE POLICY` or `ALTER POLICY`),
  not Postgres's normalised `pg_get_expr` output. The capture holds only hashes of the live text, so
  the expressions themselves cannot be checked without the database.
- The model finds the same 41 tables as the advisor. It counts 68 role-and-command overlaps, against
  the advisor's 73, because the advisor also counts a database role this model does not list. A
  `TO public` policy applies to every role; the model expands it to `anon`, `authenticated`,
  `authenticator`, `dashboard_user` and `service_role`.

Confirm the live definitions with:

```sql
SELECT tablename, policyname, permissive, roles, cmd, qual, with_check
  FROM pg_policies
 WHERE schemaname = 'public' AND tablename = ANY (ARRAY[<the 41 tables below>])
 ORDER BY tablename, cmd, policyname;
```

## How Postgres combines policies

For one role and one command, Postgres ORs the `USING` expressions of every applicable permissive
policy, and separately ORs their `WITH CHECK` expressions. A policy without `WITH CHECK` uses its
`USING` expression as its check. A `FOR ALL` policy applies to `SELECT`, `INSERT`, `UPDATE` and
`DELETE`, so an `ALL` policy and a `SELECT` policy on the same role overlap on `SELECT`. A `TO public`
policy applies to every role, including `authenticated`, so it overlaps with a `TO authenticated`
policy on the same command.

## Outcome

Seven migrations, one per table group, merge every overlap whose policies are granted to the
**same role**. They change no access: each merged expression is the OR of the originals, and a
disjunct that appears in more than one original is written once. They cover 34 of the 41 tables.
The modelled finding count on those tables goes from 61 to 4, and from 68 to 11 overall. Expect
the advisor's 73 to fall by a similar proportion; Firstmate records the real rerun.

Overlaps between a `TO public` policy and a `TO authenticated` policy are not merged by these
seven migrations: merging them changes which roles a predicate applies to. They account for the 11
modelled findings that remain, and part 2 (below) resolves them under the owner's option A.

These seven migrations are merged (PR 969) and applied to Residio_Stage; Residio_Prod gets them at the next release.

## Zero-delta merges (written)

Two shapes, both exact:

- **Same command.** One policy is `ALTER`ed to the OR of the set, keeping its name, command and
  roles. The others are dropped. `ALTER` rather than drop-and-create keeps the policy names that
  `src/__tests__/authenticated-read-closure.test.ts` pins (`notification_preferences_select`,
  `role_assignment_rules_select`, `petty_cash_accounts_select`).
- **`FOR ALL` overlapping `SELECT`.** The `ALL` policy is replaced by `INSERT`, `UPDATE` and
  `DELETE` policies named `"<original name> (insert)"` and so on, with its own expressions. Where it
  had no `WITH CHECK`, its `USING` becomes the `INSERT` check, which is what Postgres applied, and
  the `UPDATE` policy keeps no `WITH CHECK`, so it still checks with its `USING`. Its `SELECT` part is
  ORed into the table's `SELECT` policy. `UPDATE` and `DELETE` still see only rows the `SELECT`
  policies admit, and those are unchanged.

`billing_items` and `billing_profiles` keep their `USING (true)` read policy unchanged; it already
admits every row, so the admin `SELECT` part adds nothing. They stay on the #237 allowlist.

Each migration:

- opens with a `DO $guard$` block that aborts unless every touched table's full policy set (name,
  command, roles, permissive flag) is exactly the expected before-state or exactly the after-state.
  The first catches drift from this mapping. The second makes a re-run a no-op, and every statement
  after the guard is idempotent;
- carries its rollback in its header, restoring every original definition;
- runs in one transaction.

`src/__tests__/rls-permissive-policy-merge-956.test.ts` replays all migrations with an independent
parser and proves, for every touched table, role and command, that the OR-ed `USING` and `WITH
CHECK` disjuncts are identical before and after, that restrictive policies are untouched, that the
only overlaps left are the public-versus-authenticated ones (part 2 resolves them), and that the rollback blocks
restore every original definition.

### `20261023100000_rls_merge_permissive_security_contacts.sql`

- `access_codes`: SELECT (authenticated): "Residents can view own access codes" becomes the OR of itself and "access_codes_select_policy".
- `security_contacts`: SELECT (authenticated): "Residents can view own security contacts" becomes the OR of itself and "security_contacts_select_policy"; INSERT (authenticated): "Residents can create own security contacts" becomes the OR of itself and "security_contacts_insert_policy"; UPDATE (authenticated): "Residents can update own security contacts" becomes the OR of itself and "security_contacts_update_policy"; DELETE (authenticated): "Residents can delete own security contacts" becomes the OR of itself and "security_contacts_delete_policy".

### `20261023100100_rls_merge_permissive_announcements.sql`

- `announcement_categories`: SELECT (authenticated): "announcement_categories_select_policy" becomes the OR of itself and "announcement_categories_admin_all"; FOR ALL "announcement_categories_admin_all" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `announcement_read_receipts`: SELECT (authenticated): "read_receipts_admin_select" becomes the OR of itself and "read_receipts_own_select".
- `announcements`: SELECT (authenticated): "announcements_admin_select" becomes the OR of itself and "announcements_resident_select".
- `message_templates`: SELECT (authenticated): "message_templates_select_policy" becomes the OR of itself and "message_templates_admin_all"; FOR ALL "message_templates_admin_all" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `notification_preferences`: "Residents can view own notification preferences" dropped: "notification_preferences_select" already states every disjunct it adds; UPDATE (authenticated): "Residents can update own notification preferences" becomes the OR of itself and "notification_preferences_update".
- `recipient_group_members`: SELECT (authenticated): "recipient_group_members_select" becomes the OR of itself and "recipient_group_members_write"; FOR ALL "recipient_group_members_write" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `recipient_groups`: SELECT (authenticated): "recipient_groups_select" becomes the OR of itself and "recipient_groups_write"; FOR ALL "recipient_groups_write" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `report_subscriptions`: SELECT (authenticated): "report_subscriptions_admin_select" becomes the OR of itself and "report_subscriptions_own_select"; INSERT (authenticated): "report_subscriptions_admin_insert" becomes the OR of itself and "report_subscriptions_own_insert"; UPDATE (authenticated): "report_subscriptions_admin_update" becomes the OR of itself and "report_subscriptions_own_update".

### `20261023100200_rls_merge_permissive_billing_payments.sql`

- `billing_items`: FOR ALL "Admins chairmen fin sec can manage billing items" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `billing_profiles`: FOR ALL "Admins chairmen fin sec can manage billing profiles" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `estate_bank_accounts`: FOR ALL "Admins chairmen fin sec can manage bank accounts" (public) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `payment_records`: SELECT (authenticated): "Residents can view own payments" becomes the OR of itself and "Admins and FinSec can manage all payments"; FOR ALL "Admins and FinSec can manage all payments" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `wallet_transactions`: SELECT (public): "Residents can view own transactions" becomes the OR of itself and "Admins chairmen fin sec can view all transactions"; FOR ALL "Admins chairmen fin sec can view all transactions" (public) split into per-command policies; its SELECT part is carried by the table's SELECT policy.

### `20261023100300_rls_merge_permissive_expenditure_projects.sql`

- `budgets`: SELECT (authenticated): "View Budgets - Authorized Roles" becomes the OR of itself and "Manage Budgets - Authorized Roles"; FOR ALL "Manage Budgets - Authorized Roles" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `expense_categories`: SELECT (authenticated): "View Categories - Authorized Roles" becomes the OR of itself and "Manage Categories - Authorized Roles"; FOR ALL "Manage Categories - Authorized Roles" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `expenses`: SELECT (authenticated): "View Expenditure - Admins/Financial Secretary" becomes the OR of itself and "Manage Expenditure - Authorized Roles"; FOR ALL "Manage Expenditure - Authorized Roles" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `petty_cash_accounts`: SELECT (authenticated): "petty_cash_accounts_select" becomes the OR of itself and "Admins can manage petty cash accounts"; FOR ALL "Admins can manage petty cash accounts" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `project_milestones`: SELECT (authenticated): "View Milestones - Admins/EXCO" becomes the OR of itself and "Manage Milestones - Admins/Project Manager"; FOR ALL "Manage Milestones - Admins/Project Manager" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `projects`: SELECT (authenticated): "View Projects - Admins/EXCO" becomes the OR of itself and "Manage Projects - Admins/Project Manager"; FOR ALL "Manage Projects - Admins/Project Manager" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `vendors`: SELECT (authenticated): "View Vendors - Authorized Roles" becomes the OR of itself and "Manage Vendors - Authorized Roles"; FOR ALL "Manage Vendors - Authorized Roles" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.

### `20261023100400_rls_merge_permissive_documents.sql`

- `document_categories`: SELECT (authenticated): "Authenticated users can view active categories" becomes the OR of itself and "Admins can manage categories"; FOR ALL "Admins can manage categories" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `document_custom_field_values`: SELECT (authenticated): "Custom field values follow document visibility" becomes the OR of itself and "Editors can write custom field values"; FOR ALL "Editors can write custom field values" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `document_custom_fields`: SELECT (authenticated): "Document viewers can view active custom fields" becomes the OR of itself and "Custom field managers can manage custom fields"; FOR ALL "Custom field managers can manage custom fields" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `document_tags`: SELECT (authenticated): "Document viewers can view active tags" becomes the OR of itself and "Tag managers can manage tags"; FOR ALL "Tag managers can manage tags" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.

### `20261023100500_rls_merge_permissive_admin_identity.sql`

- `approval_requests`: SELECT (authenticated): "Admin and chairman can view all approval requests" becomes the OR of itself and "Users can view their own approval requests".
- `hierarchical_settings`: SELECT (authenticated): "hierarchical_settings_read_estate" becomes the OR of itself and "hierarchical_settings_admin_all", "hierarchical_settings_read_house", "hierarchical_settings_read_own_resident"; FOR ALL "hierarchical_settings_admin_all" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `impersonation_sessions`: SELECT (authenticated): "admins_read_own_impersonation_sessions" becomes the OR of itself and "super_admin_read_all_impersonation_sessions".
- `profiles`: SELECT (public): "Admins and chairmen can view all profiles" becomes the OR of itself and "Users can view own profile".
- `role_assignment_rules`: SELECT (authenticated): "role_assignment_rules_select" becomes the OR of itself and "Admins can manage role assignment rules"; FOR ALL "Admins can manage role assignment rules" (authenticated) split into per-command policies; its SELECT part is carried by the table's SELECT policy.
- `two_factor_audit_log`: SELECT (authenticated): "Admins can view all audit logs" becomes the OR of itself and "Users can view own audit log".

### `20261023100600_rls_merge_permissive_residents_houses.sql`

- `resident_houses`: SELECT (authenticated): "Residents can view housemates house assignments" becomes the OR of itself and "Residents can view own house assignments"; SELECT (public): "Admins chairmen fin sec can view all resident houses" becomes the OR of itself and "Security officers can view active resident houses".
- `residents`: SELECT (authenticated): "Residents can view housemates" becomes the OR of itself and "Residents can view own record"; SELECT (public): "Admins chairmen fin sec can view all residents" becomes the OR of itself and "Security officers can view active residents".


## Needs owner decision

**Decided 2026-10-21: option A.** Part 2 below maps and merges these overlaps.

These overlaps mix a `TO public` policy with a `TO authenticated` policy on the same command. A
`TO public` policy also applies to `anon`, `authenticator`, `dashboard_user` and `service_role`
(which bypasses RLS). One policy per role and command is only possible if the two policies are
granted to the same role, and that changes the roles one of the predicates applies to.

| Table | Command | `TO public` | `TO authenticated` |
| --- | --- | --- | --- |
| `houses` | SELECT | All authenticated users can view active houses | Residents can view assigned houses |
| `invoices` | SELECT | Admins chairmen fin sec can manage all invoices (ALL) | Residents can view own invoices |
| `invoice_items` | SELECT | Admins chairmen fin sec can manage all invoice items (ALL) | Residents can view own invoice items |
| `resident_wallets` | SELECT | Admins chairmen fin sec can manage wallets (ALL) | Residents can view own wallet |
| `paystack_transactions` | SELECT | paystack_transactions_resident_select | paystack_transactions_admin_all (ALL) |
| `wallet_payment_batches` | SELECT | Residents can view own wallet payment batches | Admin finance can manage wallet payment batches (ALL) |
| `wallet_payment_batch_items` | SELECT | Residents can view own wallet payment batch items | Admin finance can manage wallet payment batch items (ALL) |
| `residents` | SELECT | Admins chairmen fin sec can view all residents (merged here with the security-officer policy) | Residents can view housemates (merged here with own record) |
| `residents` | UPDATE | Admins chairmen fin sec can update residents | Residents can update own contact info |
| `resident_houses` | SELECT | Admins chairmen fin sec can view all resident houses (merged here with the security-officer policy) | Residents can view housemates house assignments (merged here with own assignments) |
| `wallet_transactions` | SELECT | Residents can view own transactions (merged here with the admin ALL policy) | Residents can view own wallet transactions |

Options:

- **A (recommended): re-scope the `TO public` policies on these ten tables to `TO authenticated`,
  then merge.** After the change `anon` evaluates no policy on these tables and reads nothing,
  which is the direction #212 and #237 took. What `anon` gets today depends on the predicate:
  where a `TO public` policy calls `has_permission()`, an `anon` read fails with 42501, because
  `anon` has had no `EXECUTE` on it since `20260824200000`; where it calls only `auth.uid()` or
  `get_my_resident_id()` (`paystack_transactions`, the two wallet payment batch tables), it returns
  no rows. Note that `houses`' public policy is `(is_active = true) OR has_permission(...)`, so its
  `is_active` disjunct is not tied to a signed-in user. Measure each table with the probe's `anon`
  subject before deciding.
- **B: re-scope the `TO authenticated` policies to `TO public`, then merge.** `anon` would then
  evaluate the resident predicates too. They should return no rows for `anon`, but it widens the
  roles each predicate applies to, so it is the weaker option.
- **C: leave them.** 11 modelled findings remain, each costing one extra policy evaluation per row
  for signed-in users.

## Applying and verifying (Firstmate, on Residio_Stage)

1. Confirm the live definitions match this mapping (the query under "Source and confidence"). A
   mismatch in any name, command or role makes the migration's guard abort, which is the intent.
2. Run `docs/security/probe-956-permissive-merge.sql`: it counts what `anon`, one profile per app
   role and a resident can select, update and delete on all 34 tables, applies the migration
   bodies, counts again, lists every difference (expect none) and rolls back.
3. Capture `EXPLAIN (ANALYZE, BUFFERS)` before and after for the representative queries at the end
   of the probe file (#63's evidence rule).
4. Apply the seven migrations in filename order after the merge, verify by name in the applied
   list (`CORE.md` §11), rerun the advisor and record the new `multiple_permissive_policies` count.
5. Recapture `docs/validation/policy-definitions.baseline.json`: the merged and split policies no
   longer match the 2026-10-16 capture, so `npm run rbac:policies:diff` reports them until it is
   recaptured.

## Part 2: the public-versus-authenticated overlaps (option A)

Owner decision, 2026-10-21: **option A** for the 11 overlaps that part 1 left. Re-scope the
`TO public` policy in each overlap to `TO authenticated`, keep its expressions, then merge it with
the matching `TO authenticated` policy, so each table has one permissive policy per role and
command. Signed-in users must see no change. Visitors (`anon`) read and change nothing.

### The 11 overlaps as they stand on Residio_Stage

Part 1 (#969) is applied to Residio_Stage, so the starting point is part 1's after-state. It was
derived the same way as part 1: every migration replayed in filename order and checked against
`docs/validation/policy-definitions.baseline.json`. The live definitions still need confirming
with the query under "Source and confidence", and each part 2 migration's guard aborts if a name,
command or role differs.

| # | Table | Command | `TO public` policy (re-scoped) | `TO authenticated` policy |
| --- | --- | --- | --- | --- |
| 1 | `houses` | SELECT | All authenticated users can view active houses | Residents can view assigned houses |
| 2 | `invoices` | SELECT | Admins chairmen fin sec can manage all invoices (ALL) | Residents can view own invoices |
| 3 | `invoice_items` | SELECT | Admins chairmen fin sec can manage all invoice items (ALL) | Residents can view own invoice items |
| 4 | `resident_wallets` | SELECT | Admins chairmen fin sec can manage wallets (ALL) | Residents can view own wallet |
| 5 | `paystack_transactions` | SELECT | paystack_transactions_resident_select | paystack_transactions_admin_all (ALL) |
| 6 | `wallet_payment_batches` | SELECT | Residents can view own wallet payment batches | Admin finance can manage wallet payment batches (ALL) |
| 7 | `wallet_payment_batch_items` | SELECT | Residents can view own wallet payment batch items | Admin finance can manage wallet payment batch items (ALL) |
| 8 | `residents` | SELECT | Admins chairmen fin sec can view all residents | Residents can view housemates |
| 9 | `residents` | UPDATE | Admins chairmen fin sec can update residents | Residents can update own contact info |
| 10 | `resident_houses` | SELECT | Admins chairmen fin sec can view all resident houses | Residents can view housemates house assignments |
| 11 | `wallet_transactions` | SELECT | Residents can view own transactions | Residents can view own wallet transactions |

The expressions, as part 1 left them:

| Table | Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- | --- |
| `houses` | All authenticated users can view active houses | SELECT | public | `((is_active = true) OR ((select has_permission('houses.manage_records'::text))))` | — |
| `houses` | Residents can view assigned houses | SELECT | authenticated | `(id IN ( SELECT resident_houses.house_id FROM resident_houses WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true))))` | — |
| `invoices` | Admins chairmen fin sec can manage all invoices | ALL | public | `((select has_permission('billing.create_invoice'::text)))` | — |
| `invoices` | Residents can view own invoices | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| `invoice_items` | Admins chairmen fin sec can manage all invoice items | ALL | public | `((select has_permission('billing.create_invoice'::text)))` | — |
| `invoice_items` | Residents can view own invoice items | SELECT | authenticated | `(invoice_id IN ( SELECT invoices.id FROM invoices WHERE (invoices.resident_id = (select get_my_resident_id()))))` | — |
| `resident_wallets` | Admins chairmen fin sec can manage wallets | ALL | public | `((select has_permission('billing.manage_wallets'::text)))` | — |
| `resident_wallets` | Residents can view own wallet | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| `paystack_transactions` | paystack_transactions_admin_all | ALL | authenticated | `(select has_permission('payments.update'::text))` | `(select has_permission('payments.update'::text))` |
| `paystack_transactions` | paystack_transactions_resident_select | SELECT | public | `(resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))` | — |
| `wallet_payment_batches` | Admin finance can manage wallet payment batches | ALL | authenticated | `(select has_permission('billing.manage_wallets'::text))` | `(select has_permission('billing.manage_wallets'::text))` |
| `wallet_payment_batches` | Residents can view own wallet payment batches | SELECT | public | `(resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))` | — |
| `wallet_payment_batch_items` | Admin finance can manage wallet payment batch items | ALL | authenticated | `(select has_permission('billing.manage_wallets'::text))` | `(select has_permission('billing.manage_wallets'::text))` |
| `wallet_payment_batch_items` | Residents can view own wallet payment batch items | SELECT | public | `(batch_id IN ( SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))))` | — |
| `residents` | Admins chairmen fin sec can view all residents | SELECT | public | `((select has_permission('residents.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status)))` | — |
| `residents` | Residents can view housemates | SELECT | authenticated | `((id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true)))) OR (id = (select get_my_resident_id())))` | — |
| `residents` | Admins chairmen fin sec can update residents | UPDATE | public | `((select has_permission('residents.manage_records'::text)))` | — |
| `residents` | Residents can update own contact info | UPDATE | authenticated | `(id = (select get_my_resident_id()))` | `(id = (select get_my_resident_id()))` |
| `resident_houses` | Admins chairmen fin sec can view all resident houses | SELECT | public | `((select has_permission('houses.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true)))` | — |
| `resident_houses` | Residents can view housemates house assignments | SELECT | authenticated | `((house_id IN (SELECT get_my_house_ids())) OR (resident_id = (select get_my_resident_id())))` | — |
| `wallet_transactions` | Residents can view own transactions | SELECT | public | `((wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))) OR (select has_permission('billing.manage_wallets'::text)))` | — |
| `wallet_transactions` | Residents can view own wallet transactions | SELECT | authenticated | `(wallet_id IN ( SELECT resident_wallets.id FROM resident_wallets WHERE (resident_wallets.resident_id = (select get_my_resident_id()))))` | — |

`houses` also carries the restrictive `Approved accounts only can read` (SELECT, `authenticated`,
`public.is_approved()`). It is not part of the lint, and nothing here changes it.

### The merges

The same two shapes as part 1, with one extra step: the `TO public` policy is re-scoped with
`ALTER POLICY ... TO authenticated` before its expression is merged. No expression changes meaning.
For `authenticated`, each merged expression is the OR of the two policies it replaces, so signed-in
users see exactly what they saw before.

- **Same command** (`houses`, `residents` SELECT and UPDATE, `resident_houses`,
  `wallet_transactions`). The `TO public` policy is re-scoped and `ALTER`ed to the OR of both; the
  `TO authenticated` policy is dropped. On `residents` UPDATE the admin policy had no `WITH CHECK`,
  so Postgres checked with its `USING`; the merged policy states `WITH CHECK` as the same OR as its
  `USING`.
- **`FOR ALL` overlapping `SELECT`** (`invoices`, `invoice_items`, `resident_wallets`,
  `paystack_transactions`, the two wallet payment batch tables). The `ALL` policy is split into
  `"<name> (insert)"`, `"(update)"` and `"(delete)"` policies `TO authenticated` with its own
  expressions, and its `SELECT` part is ORed into the table's `SELECT` policy, which is
  `TO authenticated` (re-scoped first where it was `TO public`).

Two migrations, each guarded, idempotent, one transaction, with its rollback in its header:

- `20261023100700_rls_rescope_merge_residents_houses.sql`: `houses`, `residents`,
  `resident_houses` (overlaps 1, 8, 9 and 10).
- `20261023100800_rls_rescope_merge_billing_wallets.sql`: `invoices`, `invoice_items`,
  `resident_wallets`, `paystack_transactions`, `wallet_payment_batches`,
  `wallet_payment_batch_items`, `wallet_transactions` (overlaps 2 to 7 and 11).

Modelled `multiple_permissive_policies` findings on the ten tables: 11 before, 0 after.

`src/__tests__/rls-permissive-policy-merge-956.test.ts` replays them too. For every table, command
and permissive flag it proves that `authenticated` evaluates the same `USING` and `WITH CHECK`
disjuncts before and after, that `anon` and `service_role` lose exactly the re-scoped policies and
nothing else, that no overlap is left on any table either part touched, and that the rollback
blocks restore part 1's definitions.

**Left `TO public`, by design.** These policies on the same tables overlap nothing, so option A does
not reach them: `houses` INSERT, UPDATE and DELETE; `residents` INSERT and DELETE;
`resident_houses` INSERT, UPDATE and DELETE; and the `wallet_transactions` `(insert)`, `(update)` and
`(delete)` policies part 1 split out. Each calls `has_permission()`, which `anon` cannot execute, so
an `anon` write fails with 42501 today and still does.

### What changes for `anon`

`anon` evaluates no permissive policy for the re-scoped commands after part 2, so it reads no row
and writes none. What it gets today is predicted below; the probe's `anon` subject measures it, and
the measured result is what counts.

| Table | Commands that lose their `anon` policy | `anon` today (predicted) | After |
| --- | --- | --- | --- |
| `houses` | SELECT | `is_active = true` is not tied to a user. Where Postgres reaches the `has_permission()` call, the read fails with 42501; where it does not, `anon` may read active houses. | no rows |
| `invoices`, `invoice_items`, `resident_wallets` | SELECT, INSERT, UPDATE, DELETE (the `ALL` policy) | 42501 (`has_permission()`) | no rows; an INSERT is refused by RLS |
| `paystack_transactions`, `wallet_payment_batches`, `wallet_payment_batch_items` | SELECT | no rows (`auth.uid()` is null), unless a nested read of `residents` fails first | no rows |
| `residents` | SELECT, UPDATE | 42501 | no rows |
| `resident_houses` | SELECT | 42501 | no rows |
| `wallet_transactions` | SELECT | 42501 | no rows |

### No signed-out code path reads these tables

`src/` was searched for every read of the ten tables, and each was traced to its client:

- **Sign-up and sign-in.** `src/app/(auth)/register/page.tsx` reads only `streets` with the browser
  client before sign-up (step 5). It never reads `houses`. `src/app/(auth)/login/page.tsx` reads
  `profiles` after sign-in. The pre-auth server actions `checkEmailAvailability` and
  `registerResidentPortal` read `residents` through the service-role client, which bypasses RLS.
- **Public routes.** `src/middleware.ts` serves only `/login`, `/register`, `/forgot-password`,
  `/reset-password`, `/pending-approval`, `/auth`, `/maintenance`, `/privacy-policy`, `/` (a
  redirect) and `/api` without a session. None of those pages reads the ten tables.
- **`/api` routes without a session.** The cron routes, the Paystack and WhatsApp webhooks and
  `src/lib/whatsapp/**` use the service-role client. `/api/search`, `/api/statements`,
  `/api/receipts/[id]` and `/api/admin/generate-invoices` call `auth.getUser()` and refuse a
  request with no user before they read anything.
- **Session client in shared code.** `runLateFeeApplication` uses the session client only for the
  signed-in manual trigger; cron uses the service-role client. `verifyPaystackPayment` runs from the
  resident portal callback page, which middleware requires a session for.

So no public page or sign-up flow needs `anon` to list houses, or to read any of the other nine
tables.

### Applying and verifying part 2 (Firstmate, on Residio_Stage)

1. Confirm the live definitions match the tables above (the query under "Source and confidence").
2. Run `docs/security/probe-956-permissive-merge.sql` with the two part 2 migration bodies pasted at
   the marker. Expect no difference for any `role:*` subject or for `resident`. Every `anon` row it
   lists is a change to report; `houses` SELECT is the one to read first.
3. Capture `EXPLAIN (ANALYZE, BUFFERS)` before and after, as for part 1.
4. Apply the two migrations in filename order after the merge, verify them by name in the applied
   list, rerun the advisor and record the `multiple_permissive_policies` count.
5. Recapture `docs/validation/policy-definitions.baseline.json`.

## Mapping, per table

### `access_codes`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Residents can view own access codes | SELECT | authenticated | `(contact_id IN ( SELECT security_contacts.id FROM security_contacts WHERE (security_contacts.resident_id = (select get_my_resident_id()))))` | — |
| access_codes_delete_policy | DELETE | authenticated | `((select has_permission('security.suspend_revoke'::text)))` | — |
| access_codes_insert_policy | INSERT | authenticated | — | `((select has_permission('security.manage_records'::text)))` |
| access_codes_select_policy | SELECT | authenticated | `((select has_permission('security.operate_records'::text)))` | — |
| access_codes_update_policy | UPDATE | authenticated | `((select has_permission('security.operate_records'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Residents can view own access codes, access_codes_select_policy
  - USING: `((contact_id IN ( SELECT security_contacts.id FROM security_contacts WHERE (security_contacts.resident_id = (select get_my_resident_id())))) OR (select has_permission('security.operate_records'::text)))`

### `announcement_categories`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| announcement_categories_admin_all | ALL | authenticated | `(select has_permission('announcements.manage_categories'::text))` | `(select has_permission('announcements.manage_categories'::text))` |
| announcement_categories_select_policy | SELECT | authenticated | `is_active = true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: announcement_categories_admin_all, announcement_categories_select_policy
  - USING: `((select has_permission('announcements.manage_categories'::text)) OR (is_active = true))`

### `announcement_read_receipts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| read_receipts_admin_select | SELECT | authenticated | `(select has_permission('announcements.publish'::text))` | — |
| read_receipts_own_insert | INSERT | authenticated | — | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid())))))` |
| read_receipts_own_select | SELECT | authenticated | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid())))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: read_receipts_admin_select, read_receipts_own_select
  - USING: `((select has_permission('announcements.publish'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = announcement_read_receipts.resident_id) AND (r.profile_id = (select auth.uid()))))))`

### `announcements`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| announcements_admin_delete | DELETE | authenticated | `(select has_permission('announcements.delete'::text))` | — |
| announcements_admin_insert | INSERT | authenticated | — | `(select has_permission('announcements.create'::text))` |
| announcements_admin_select | SELECT | authenticated | `(select has_permission('announcements.view'::text))` | — |
| announcements_admin_update | UPDATE | authenticated | `(select has_permission('announcements.update'::text))` | `(select has_permission('announcements.update'::text))` |
| announcements_resident_select | SELECT | authenticated | `((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses)))))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: announcements_admin_select, announcements_resident_select
  - USING: `((select has_permission('announcements.view'::text)) OR ((status = 'published'::announcement_status) AND ((expires_at IS NULL) OR (expires_at > now())) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status)))) AND ((target_audience = 'all'::target_audience) OR ((target_audience = 'residents'::target_audience) AND (EXISTS ( SELECT 1 FROM residents r WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status))))) OR ((target_audience = 'owners'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['resident_landlord'::resident_role, 'non_resident_landlord'::resident_role])))))) OR ((target_audience = 'tenants'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = 'tenant'::resident_role))))) OR ((target_audience = 'staff'::target_audience) AND (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.resident_role = ANY (ARRAY['domestic_staff'::resident_role, 'caretaker'::resident_role, 'contractor'::resident_role]))))))) AND ((target_houses IS NULL) OR (array_length(target_houses, 1) IS NULL) OR (EXISTS ( SELECT 1 FROM (residents r JOIN resident_houses rh ON ((rh.resident_id = r.id))) WHERE ((r.profile_id = (select auth.uid())) AND (r.account_status = 'active'::account_status) AND (rh.is_active = true) AND (rh.house_id = ANY (announcements.target_houses))))))))`

### `approval_requests`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admin and chairman can update approval requests | UPDATE | authenticated | `(select has_permission('approvals.approve_reject'::text))` | `(select has_permission('approvals.approve_reject'::text))` |
| Admin and chairman can view all approval requests | SELECT | authenticated | `(select has_permission('approvals.view'::text))` | — |
| Users can create their own approval requests | INSERT | authenticated | — | `(requested_by = (select auth.uid()))` |
| Users can view their own approval requests | SELECT | authenticated | `(requested_by = (select auth.uid()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admin and chairman can view all approval requests, Users can view their own approval requests
  - USING: `((select has_permission('approvals.view'::text)) OR (requested_by = (select auth.uid())))`

### `billing_items`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage billing items | ALL | authenticated | `((select has_permission('billing.write_profiles'::text)))` | — |
| All authenticated can view billing items | SELECT | authenticated | `true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage billing items, All authenticated can view billing items
  - USING: `true`

### `billing_profiles`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage billing profiles | ALL | authenticated | `((select has_permission('billing.write_profiles'::text)))` | — |
| All authenticated can view billing profiles | SELECT | authenticated | `true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage billing profiles, All authenticated can view billing profiles
  - USING: `true`

### `budgets`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Budgets - Authorized Roles | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| View Budgets - Authorized Roles | SELECT | authenticated | `(select has_permission('view_expenditure'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Budgets - Authorized Roles, View Budgets - Authorized Roles
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)))`

### `document_categories`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can manage categories | ALL | authenticated | `(EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text))))` | — |
| Authenticated users can view active categories | SELECT | authenticated | `is_active = TRUE` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can manage categories, Authenticated users can view active categories
  - USING: `((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))) OR (is_active = TRUE))`

### `document_custom_field_values`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Custom field values follow document visibility | SELECT | authenticated | `EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id)` | — |
| Editors can write custom field values | ALL | authenticated | `((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id))))` | `((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id))))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Custom field values follow document visibility, Editors can write custom field values
  - USING: `((EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_custom_field_values.document_id)) OR ((select has_permission('documents.update'::text)) AND (EXISTS ( SELECT 1 FROM documents d WHERE (d.id = document_custom_field_values.document_id)))))`

### `document_custom_fields`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Custom field managers can manage custom fields | ALL | authenticated | `(select has_permission('documents.manage_custom_fields'::text))` | `(select has_permission('documents.manage_custom_fields'::text))` |
| Document viewers can view active custom fields | SELECT | authenticated | `((is_active = true) AND (select has_permission('documents.view'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Custom field managers can manage custom fields, Document viewers can view active custom fields
  - USING: `((select has_permission('documents.manage_custom_fields'::text)) OR ((is_active = true) AND (select has_permission('documents.view'::text))))`

### `document_tags`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Document viewers can view active tags | SELECT | authenticated | `((is_active = true) AND (select has_permission('documents.view'::text)))` | — |
| Tag managers can manage tags | ALL | authenticated | `(select has_permission('documents.manage_tags'::text))` | `(select has_permission('documents.manage_tags'::text))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Document viewers can view active tags, Tag managers can manage tags
  - USING: `(((is_active = true) AND (select has_permission('documents.view'::text))) OR (select has_permission('documents.manage_tags'::text)))`

### `estate_bank_accounts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage bank accounts | ALL | public | `((select has_permission('payments.manage_reference_records'::text)))` | — |
| All authenticated can view active bank accounts | SELECT | public | `((is_active = true) OR ((select has_permission('payments.manage_reference_records'::text))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticated, authenticator, dashboard_user, service_role: Admins chairmen fin sec can manage bank accounts, All authenticated can view active bank accounts
  - USING: `((select has_permission('payments.manage_reference_records'::text)) OR (is_active = true))`

### `expense_categories`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Categories - Authorized Roles | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| View Categories - Authorized Roles | SELECT | authenticated | `(select has_permission('view_expenditure'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Categories - Authorized Roles, View Categories - Authorized Roles
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)))`

### `expenses`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Expenditure - Authorized Roles | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| View Expenditure - Admins/Financial Secretary | SELECT | authenticated | `(select has_permission('view_expenditure'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Expenditure - Authorized Roles, View Expenditure - Admins/Financial Secretary
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)))`

### `hierarchical_settings`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| hierarchical_settings_admin_all | ALL | authenticated | `((select has_permission('settings.write_system'::text)))` | — |
| hierarchical_settings_read_estate | SELECT | authenticated | `level = 'estate'` | — |
| hierarchical_settings_read_house | SELECT | authenticated | `level = 'house'` | — |
| hierarchical_settings_read_own_resident | SELECT | authenticated | `((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: hierarchical_settings_admin_all, hierarchical_settings_read_estate, hierarchical_settings_read_house, hierarchical_settings_read_own_resident
  - USING: `((select has_permission('settings.write_system'::text)) OR (level = 'estate') OR (level = 'house') OR ((level = 'resident'::setting_level) AND (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))))`

### `houses`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen and fin sec can delete houses | DELETE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Admins chairmen and fin sec can insert houses | INSERT | public | — | `((select has_permission('houses.manage_records'::text)))` |
| Admins chairmen and fin sec can update houses | UPDATE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| All authenticated users can view active houses | SELECT | public | `((is_active = true) OR ((select has_permission('houses.manage_records'::text))))` | — |
| Residents can view assigned houses | SELECT | authenticated | `(id IN ( SELECT resident_houses.house_id FROM resident_houses WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: All authenticated users can view active houses, Residents can view assigned houses
  - USING: `((is_active = true) OR (select has_permission('houses.manage_records'::text)) OR (id IN ( SELECT resident_houses.house_id FROM resident_houses WHERE ((resident_houses.resident_id = (select get_my_resident_id())) AND (resident_houses.is_active = true)))))`

### `impersonation_sessions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| admins_insert_own_impersonation_sessions | INSERT | authenticated | — | `(admin_profile_id = (select auth.uid()))` |
| admins_read_own_impersonation_sessions | SELECT | authenticated | `(admin_profile_id = (select auth.uid()))` | — |
| admins_update_own_impersonation_sessions | UPDATE | authenticated | `(admin_profile_id = (select auth.uid()))` | `(admin_profile_id = (select auth.uid()))` |
| super_admin_read_all_impersonation_sessions | SELECT | authenticated | `(select has_permission('impersonation.view_sessions'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: admins_read_own_impersonation_sessions, super_admin_read_all_impersonation_sessions
  - USING: `((admin_profile_id = (select auth.uid())) OR (select has_permission('impersonation.view_sessions'::text)))`

### `invoice_items`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage all invoice items | ALL | public | `((select has_permission('billing.create_invoice'::text)))` | — |
| Residents can view own invoice items | SELECT | authenticated | `(invoice_id IN ( SELECT invoices.id FROM invoices WHERE (invoices.resident_id = (select get_my_resident_id()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage all invoice items, Residents can view own invoice items
  - USING: `((select has_permission('billing.create_invoice'::text)) OR (invoice_id IN ( SELECT invoices.id FROM invoices WHERE (invoices.resident_id = (select get_my_resident_id())))))`

### `invoices`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage all invoices | ALL | public | `((select has_permission('billing.create_invoice'::text)))` | — |
| Residents can view own invoices | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage all invoices, Residents can view own invoices
  - USING: `((select has_permission('billing.create_invoice'::text)) OR (resident_id = (select get_my_resident_id())))`

### `message_templates`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| message_templates_admin_all | ALL | authenticated | `(select has_permission('announcements.manage_templates'::text))` | `(select has_permission('announcements.manage_templates'::text))` |
| message_templates_select_policy | SELECT | authenticated | `is_active = true` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: message_templates_admin_all, message_templates_select_policy
  - USING: `((select has_permission('announcements.manage_templates'::text)) OR (is_active = true))`

### `notification_preferences`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Residents can update own notification preferences | UPDATE | authenticated | `(resident_id = (select get_my_resident_id()))` | `(resident_id = (select get_my_resident_id()))` |
| Residents can view own notification preferences | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| notification_preferences_delete | DELETE | authenticated | `((select has_permission('notifications.manage'::text)))` | — |
| notification_preferences_insert | INSERT | authenticated | — | `((select has_permission('notifications.manage_delivery'::text)))` |
| notification_preferences_select | SELECT | authenticated | `((select has_permission('notifications.view'::text)) OR (select has_permission('residents.view'::text)) OR (resident_id = (select get_my_resident_id())))` | — |
| notification_preferences_update | UPDATE | authenticated | `((select has_permission('notifications.manage_delivery'::text)))` | `((select has_permission('notifications.manage_delivery'::text)))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Residents can view own notification preferences, notification_preferences_select
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.view'::text)) OR (select has_permission('residents.view'::text)))`
- **UPDATE** for authenticated: Residents can update own notification preferences, notification_preferences_update
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.manage_delivery'::text)))`
  - WITH CHECK: `((resident_id = (select get_my_resident_id())) OR (select has_permission('notifications.manage_delivery'::text)))`

### `payment_records`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins and FinSec can manage all payments | ALL | authenticated | `(select has_permission('payments.update'::text))` | `(select has_permission('payments.update'::text))` |
| Residents can view own payments | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins and FinSec can manage all payments, Residents can view own payments
  - USING: `((select has_permission('payments.update'::text)) OR (resident_id = (select get_my_resident_id())))`

### `paystack_transactions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| paystack_transactions_admin_all | ALL | authenticated | `(select has_permission('payments.update'::text))` | `(select has_permission('payments.update'::text))` |
| paystack_transactions_resident_select | SELECT | public | `(resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: paystack_transactions_admin_all, paystack_transactions_resident_select
  - USING: `((select has_permission('payments.update'::text)) OR (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))`

### `petty_cash_accounts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can manage petty cash accounts | ALL | authenticated | `(select has_permission('manage_expenditure'::text))` | `(select has_permission('manage_expenditure'::text))` |
| petty_cash_accounts_select | SELECT | authenticated | `((select has_permission('view_expenditure'::text)) OR (select has_permission('billing.view'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can manage petty cash accounts, petty_cash_accounts_select
  - USING: `((select has_permission('manage_expenditure'::text)) OR (select has_permission('view_expenditure'::text)) OR (select has_permission('billing.view'::text)))`

### `profiles`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins and chairmen can view all profiles | SELECT | public | `((select has_permission('system.view_all_profiles'::text)))` | — |
| Admins can delete profiles | DELETE | public | `((select has_permission('system.assign_roles'::text)))` | — |
| Admins can insert profiles | INSERT | public | — | `((select has_permission('system.assign_roles'::text)))` |
| Users can update own profile | UPDATE | public | `((select auth.uid()) = id)` | `((select auth.uid()) = id)` |
| Users can view own profile | SELECT | public | `((select auth.uid()) = id)` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticated, authenticator, dashboard_user, service_role: Admins and chairmen can view all profiles, Users can view own profile
  - USING: `((select has_permission('system.view_all_profiles'::text)) OR ((select auth.uid()) = id))`

### `project_milestones`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Milestones - Admins/Project Manager | ALL | authenticated | `(select has_permission('manage_projects'::text))` | `(select has_permission('manage_projects'::text))` |
| View Milestones - Admins/EXCO | SELECT | authenticated | `(select has_permission('view_projects'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Milestones - Admins/Project Manager, View Milestones - Admins/EXCO
  - USING: `((select has_permission('manage_projects'::text)) OR (select has_permission('view_projects'::text)))`

### `projects`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Projects - Admins/Project Manager | ALL | authenticated | `(select has_permission('manage_projects'::text))` | `(select has_permission('manage_projects'::text))` |
| View Projects - Admins/EXCO | SELECT | authenticated | `(select has_permission('view_projects'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Projects - Admins/Project Manager, View Projects - Admins/EXCO
  - USING: `((select has_permission('manage_projects'::text)) OR (select has_permission('view_projects'::text)))`

### `recipient_group_members`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| recipient_group_members_select | SELECT | authenticated | `(select has_permission('groups.view'))` | — |
| recipient_group_members_write | ALL | authenticated | `(select has_permission('groups.manage'))` | `(select has_permission('groups.manage'))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: recipient_group_members_select, recipient_group_members_write
  - USING: `((select has_permission('groups.view')) OR (select has_permission('groups.manage')))`

### `recipient_groups`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| recipient_groups_select | SELECT | authenticated | `(select has_permission('groups.view'))` | — |
| recipient_groups_write | ALL | authenticated | `(select has_permission('groups.manage'))` | `(select has_permission('groups.manage'))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: recipient_groups_select, recipient_groups_write
  - USING: `((select has_permission('groups.view')) OR (select has_permission('groups.manage')))`

### `report_subscriptions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| report_subscriptions_admin_insert | INSERT | authenticated | — | `(select has_permission('report_subscriptions.manage'::text))` |
| report_subscriptions_admin_select | SELECT | authenticated | `(select has_permission('report_subscriptions.view'::text))` | — |
| report_subscriptions_admin_update | UPDATE | authenticated | `(select has_permission('report_subscriptions.manage'::text))` | `(select has_permission('report_subscriptions.manage'::text))` |
| report_subscriptions_own_insert | INSERT | authenticated | — | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` |
| report_subscriptions_own_select | SELECT | authenticated | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` | — |
| report_subscriptions_own_update | UPDATE | authenticated | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` | `(EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid())))))` |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: report_subscriptions_admin_select, report_subscriptions_own_select
  - USING: `((select has_permission('report_subscriptions.view'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`
- **INSERT** for authenticated: report_subscriptions_admin_insert, report_subscriptions_own_insert
  - WITH CHECK: `((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`
- **UPDATE** for authenticated: report_subscriptions_admin_update, report_subscriptions_own_update
  - USING: `((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`
  - WITH CHECK: `((select has_permission('report_subscriptions.manage'::text)) OR (EXISTS ( SELECT 1 FROM residents r WHERE ((r.id = report_subscriptions.resident_id) AND (r.profile_id = (select auth.uid()))))))`

### `resident_houses`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can delete resident houses | DELETE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Admins chairmen fin sec can insert resident houses | INSERT | public | — | `((select has_permission('houses.manage_records'::text)))` |
| Admins chairmen fin sec can update resident houses | UPDATE | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Admins chairmen fin sec can view all resident houses | SELECT | public | `((select has_permission('houses.manage_records'::text)))` | — |
| Residents can view housemates house assignments | SELECT | authenticated | `house_id IN (SELECT get_my_house_ids())` | — |
| Residents can view own house assignments | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| Security officers can view active resident houses | SELECT | public | `(((select has_permission('security.view_active_residents'::text))) AND (is_active = true))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticator, dashboard_user, service_role: Admins chairmen fin sec can view all resident houses, Security officers can view active resident houses
  - USING: `((select has_permission('houses.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true)))`
- **SELECT** for authenticated: Admins chairmen fin sec can view all resident houses, Residents can view housemates house assignments, Residents can view own house assignments, Security officers can view active resident houses
  - USING: `((select has_permission('houses.manage_records'::text)) OR (house_id IN (SELECT get_my_house_ids())) OR (resident_id = (select get_my_resident_id())) OR (((select has_permission('security.view_active_residents'::text))) AND (is_active = true)))`

### `resident_wallets`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can manage wallets | ALL | public | `((select has_permission('billing.manage_wallets'::text)))` | — |
| Residents can view own wallet | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins chairmen fin sec can manage wallets, Residents can view own wallet
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (resident_id = (select get_my_resident_id())))`

### `residents`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can insert residents | INSERT | public | — | `((select has_permission('residents.manage_records'::text)))` |
| Admins chairmen fin sec can update residents | UPDATE | public | `((select has_permission('residents.manage_records'::text)))` | — |
| Admins chairmen fin sec can view all residents | SELECT | public | `((select has_permission('residents.manage_records'::text)))` | — |
| Only admins can delete residents | DELETE | public | `((select has_permission('residents.delete_records'::text)))` | — |
| Residents can update own contact info | UPDATE | authenticated | `(id = (select get_my_resident_id()))` | `(id = (select get_my_resident_id()))` |
| Residents can view housemates | SELECT | authenticated | `(id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true))))` | — |
| Residents can view own record | SELECT | authenticated | `(id = (select get_my_resident_id()))` | — |
| Security officers can view active residents | SELECT | public | `(((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticator, dashboard_user, service_role: Admins chairmen fin sec can view all residents, Security officers can view active residents
  - USING: `((select has_permission('residents.manage_records'::text)) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status)))`
- **SELECT** for authenticated: Admins chairmen fin sec can view all residents, Residents can view housemates, Residents can view own record, Security officers can view active residents
  - USING: `((select has_permission('residents.manage_records'::text)) OR (id IN ( SELECT rh2.resident_id FROM resident_houses rh2 WHERE ((rh2.house_id IN ( SELECT rh1.house_id FROM resident_houses rh1 WHERE ((rh1.resident_id = (select get_my_resident_id())) AND (rh1.is_active = true)))) AND (rh2.is_active = true)))) OR (id = (select get_my_resident_id())) OR (((select has_permission('security.view_active_residents'::text))) AND (account_status = 'active'::account_status)))`
- **UPDATE** for authenticated: Admins chairmen fin sec can update residents, Residents can update own contact info
  - USING: `((select has_permission('residents.manage_records'::text)) OR (id = (select get_my_resident_id())))`
  - WITH CHECK: `((select has_permission('residents.manage_records'::text)) OR (id = (select get_my_resident_id())))`

### `role_assignment_rules`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can manage role assignment rules | ALL | authenticated | `(EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text))))` | — |
| role_assignment_rules_select | SELECT | authenticated | `((select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can manage role assignment rules, role_assignment_rules_select
  - USING: `((EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))) OR (select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text)))`

### `security_contacts`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Residents can create own security contacts | INSERT | authenticated | — | `(resident_id = (select get_my_resident_id()))` |
| Residents can delete own security contacts | DELETE | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| Residents can update own security contacts | UPDATE | authenticated | `(resident_id = (select get_my_resident_id()))` | `(resident_id = (select get_my_resident_id()))` |
| Residents can view own security contacts | SELECT | authenticated | `(resident_id = (select get_my_resident_id()))` | — |
| security_contacts_delete_policy | DELETE | authenticated | `((select has_permission('security.suspend_revoke'::text)))` | — |
| security_contacts_insert_policy | INSERT | authenticated | — | `((select has_permission('security.manage_records'::text)))` |
| security_contacts_select_policy | SELECT | authenticated | `((select has_permission('security.operate_records'::text)))` | — |
| security_contacts_update_policy | UPDATE | authenticated | `((select has_permission('security.manage_records'::text)))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Residents can view own security contacts, security_contacts_select_policy
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.operate_records'::text)))`
- **INSERT** for authenticated: Residents can create own security contacts, security_contacts_insert_policy
  - WITH CHECK: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text)))`
- **UPDATE** for authenticated: Residents can update own security contacts, security_contacts_update_policy
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text)))`
  - WITH CHECK: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.manage_records'::text)))`
- **DELETE** for authenticated: Residents can delete own security contacts, security_contacts_delete_policy
  - USING: `((resident_id = (select get_my_resident_id())) OR (select has_permission('security.suspend_revoke'::text)))`

### `two_factor_audit_log`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins can view all audit logs | SELECT | authenticated | `(select has_permission('two_factor.view_audit_log'::text))` | — |
| System can manage audit logs | ALL | service_role | `true` | — |
| Users can view own audit log | SELECT | authenticated | `(profile_id = (select auth.uid()))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admins can view all audit logs, Users can view own audit log
  - USING: `((select has_permission('two_factor.view_audit_log'::text)) OR (profile_id = (select auth.uid())))`

### `vendors`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Manage Vendors - Authorized Roles | ALL | authenticated | `(select has_permission('manage_vendors'::text))` | `(select has_permission('manage_vendors'::text))` |
| View Vendors - Authorized Roles | SELECT | authenticated | `(select has_permission('view_vendors'::text))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Manage Vendors - Authorized Roles, View Vendors - Authorized Roles
  - USING: `((select has_permission('manage_vendors'::text)) OR (select has_permission('view_vendors'::text)))`

### `wallet_payment_batch_items`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admin finance can manage wallet payment batch items | ALL | authenticated | `(select has_permission('billing.manage_wallets'::text))` | `(select has_permission('billing.manage_wallets'::text))` |
| Residents can view own wallet payment batch items | SELECT | public | `(batch_id IN ( SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admin finance can manage wallet payment batch items, Residents can view own wallet payment batch items
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (batch_id IN ( SELECT wallet_payment_batches.id FROM wallet_payment_batches WHERE (wallet_payment_batches.resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))))`

### `wallet_payment_batches`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admin finance can manage wallet payment batches | ALL | authenticated | `(select has_permission('billing.manage_wallets'::text))` | `(select has_permission('billing.manage_wallets'::text))` |
| Residents can view own wallet payment batches | SELECT | public | `(resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for authenticated: Admin finance can manage wallet payment batches, Residents can view own wallet payment batches
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (resident_id IN ( SELECT residents.id FROM residents WHERE (residents.profile_id = (select auth.uid())))))`

### `wallet_transactions`

| Policy | Command | Roles | USING | WITH CHECK |
| --- | --- | --- | --- | --- |
| Admins chairmen fin sec can view all transactions | ALL | public | `((select has_permission('billing.manage_wallets'::text)))` | — |
| Residents can view own transactions | SELECT | public | `(wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid()))))` | — |
| Residents can view own wallet transactions | SELECT | authenticated | `(wallet_id IN ( SELECT resident_wallets.id FROM resident_wallets WHERE (resident_wallets.resident_id = (select get_my_resident_id()))))` | — |

Overlapping permissive policies, per role and command, and the expression Postgres evaluates for them today (the OR of every one):

- **SELECT** for anon, authenticator, dashboard_user, service_role: Admins chairmen fin sec can view all transactions, Residents can view own transactions
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))))`
- **SELECT** for authenticated: Admins chairmen fin sec can view all transactions, Residents can view own transactions, Residents can view own wallet transactions
  - USING: `((select has_permission('billing.manage_wallets'::text)) OR (wallet_id IN ( SELECT w.id FROM (resident_wallets w JOIN residents r ON ((r.id = w.resident_id))) WHERE (r.profile_id = (select auth.uid())))) OR (wallet_id IN ( SELECT resident_wallets.id FROM resident_wallets WHERE (resident_wallets.resident_id = (select get_my_resident_id())))))`

