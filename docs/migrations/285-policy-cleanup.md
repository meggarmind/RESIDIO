---
type: doc
status: complete
tags: [rls, row-level-security, policy-cleanup, estate_bank_accounts, approval_requests, generated_reports, supabase, issue-285, migration]
relatedTo: [issue-285, supabase-migrations, rbac-permissions]
---

# #285 — RLS policy cleanup on three tables

Design note for `supabase/migrations/20260909020000_285_policy_cleanup.sql`.

**Status: written, not applied.** Per `CORE.md` §11 migrations are written by an implementing
agent and applied only by the coordinator, after merge. The authoring session had no database
access and sought none; every claim below is grounded in repository source or in the policy text
the coordinator captured from `Residio_Prod` on 2026-09-09.

---

## 1. The client-type finding

Tightening an `INSERT` policy is safe only if no live write path depends on the loose one. A
writer holding the service-role key bypasses RLS entirely; a writer on the cookie-bound anon
client does not. Both tables were traced.

The two factories are in one file:

| Factory | File | Key | Subject to RLS? |
| --- | --- | --- | --- |
| `createServerSupabaseClient()` | `src/lib/supabase/server.ts:6` | `supabaseConfig.anonKey` | **Yes** — cookie-bound user session |
| `createAdminClient()` | `src/lib/supabase/server.ts:39` | `supabaseConfig.serviceRoleKey` | **No** — bypasses RLS |

`src/lib/supabase/admin.ts` is a one-line re-export of `createAdminClient`, and
`src/lib/supabase/config.ts:11` is what makes `serviceRoleKey` the service-role key.

### `approval_requests` — user-scoped, one writer

| | |
| --- | --- |
| Only writer | `createApprovalRequest`, `src/actions/approvals/index.ts:357-369` |
| Client | `createServerSupabaseClient` (imported at line 3) — **user-scoped, RLS applies** |
| Sets | `requested_by: user.id`, from `supabase.auth.getUser()` at line 334 |
| Callers | `src/actions/houses/update-house.ts:72`, `src/actions/billing/profiles.ts:260` |

Because the single writer always attributes the row to the acting user,
`WITH CHECK (requested_by = auth.uid())` is transparent to it.

**Why the existing finance-scoped policy could not simply be promoted to sole survivor.** Its
predicate requires membership of `['super_admin','chairman','vice_chairman','financial_officer']`.
The two call sites are gated at the action layer by the *houses* and *billing* permissions, not by
that role list. A role holding `houses.update` but outside those four would have its approval
request rejected by RLS — breaking a working path to close a finding, which the brief explicitly
forbids. Ownership is the invariant RLS can express here; *who may raise a request* remains an
action-layer authorization decision, which is where it already lives.

### `generated_reports` — mixed, and the manual path is user-scoped

Both writers are in `src/actions/reports/report-schedules.ts`:

| Writer | Line | Client |
| --- | --- | --- |
| `saveGeneratedReport`, `generation_trigger === 'scheduled'` | 377-379 | `createAdminClient()` — **service-role, RLS bypassed** |
| `saveGeneratedReport`, any other trigger | 377-379 | `createServerSupabaseClient()` — user-scoped |
| `createReportVersion` | 474 | `createServerSupabaseClient()` — user-scoped |

So the cron path (`src/app/api/cron/generate-reports/route.ts:88`) is untouched by this migration,
but the manual path from `src/hooks/use-reports.ts:139` is not.

**`has_permission('reports.view_financial')` is non-breaking, not merely plausible.** Each insert
ends in `.select().single()` (lines 400-401, and the same shape in `createReportVersion`). That
`RETURNING` read is itself filtered by the table's existing `generated_reports_select` policy,
which already requires `has_permission('reports.view_financial')`. A caller lacking that
permission therefore **cannot complete a manual save today** — the row inserts and the returning
select finds nothing, so `.single()` errors. `createReportVersion` additionally reads its parent
row through the same SELECT policy before inserting. Every caller that succeeds today already
holds the permission the new policy requires.

**The permission name is not invented.** `reports.view_financial` is declared at
`src/lib/auth/action-roles.ts:81` and is already called by the live `generated_reports_select`
policy, so it demonstrably exists in `app_permissions`.

---

## 2. Before / after access, per table

### `estate_bank_accounts`

| Command | Before | After |
| --- | --- | --- |
| SELECT | `((is_active = true) OR finance role) OR (auth.role() = 'authenticated')` — ANDed with RESTRICTIVE `is_approved()`. The second disjunct is unconditional for any authenticated caller, so **the whole predicate collapses to `is_approved()`**: every approved user reads every row, deactivated accounts included. | `((is_active = true) OR finance role)` AND `is_approved()`. Residents still read **active** accounts in order to pay; **deactivated accounts become finance-role-only**. |
| ALL | finance role, stated twice (`'super_admin'` and the four-role array) | finance role, stated once. Unchanged in effect. |

Dropped: `"Authenticated users can view bank accounts"` (A), `"Admin can manage bank accounts"` (D).
Untouched: `"All authenticated can view active bank accounts"`, `"Approved accounts only can read"`,
`"Admins chairmen fin sec can manage bank accounts"`.

### `approval_requests`

| Command | Before | After |
| --- | --- | --- |
| SELECT | admin/chairman role list **or** own rows — each stated twice (4 policies) | identical access, stated once (2 policies) |
| UPDATE | admin/chairman role list — stated twice (2 policies) | identical access, stated once (1 policy) |
| INSERT | **any authenticated caller, with any `requested_by` value they like** — the open policy subsumed the finance-scoped one entirely | any authenticated caller, **only in their own name** (`requested_by = auth.uid()`) |

Dropped: the three `TO public` twins (B), plus both INSERT policies (E).
Created: `"Users can create their own approval requests"`.

### `generated_reports`

| Command | Before | After |
| --- | --- | --- |
| INSERT | `WITH CHECK (true)`, **twice** — any authenticated caller writes arbitrary rows | `has_permission('reports.view_financial')` |
| SELECT | `has_permission('reports.view_financial')` | unchanged |
| DELETE | `has_permission('reports.manage_schedules')` | unchanged |

Dropped: `"Authenticated users can insert generated reports"`. Replaced: `generated_reports_insert`.
The service-role cron writer bypasses RLS and is unaffected.

---

## 3. Line-by-line self-review of the SQL

Nine drops, two creates. For each: who could do what before, who can after, and whether that is
what the brief asked for.

| # | Statement | Before | After | Intended? |
| --- | --- | --- | --- | --- |
| 1 | DROP `"Authenticated users can view bank accounts"` | approved authenticated users read ALL bank accounts | approved users read active accounts; inactive is finance-only | Yes — finding (A) |
| 2 | DROP `"Admin can manage bank accounts"` | `super_admin` may ALL (also via the surviving array policy) | `super_admin` still may ALL, via the surviving policy | Yes — net-zero, finding (D) |
| 3 | DROP `"Admins and chairmen can view all approval requests"` (`TO public`) | 3 roles SELECT all; `anon` raises 42501 | same 3 roles SELECT all via the `authenticated` twin; `anon` gets 0 rows | Yes — net-zero-or-better, (B) |
| 4 | DROP `"Users can view own approval requests"` (`TO public`) | requester sees own; `anon` matches 0 rows | requester sees own via the `authenticated` twin; `anon` still 0 rows | Yes — net-zero, (B) |
| 5 | DROP `"Admins and chairmen can update approval requests"` (`TO public`) | 3 roles UPDATE; `anon` raises 42501 | same 3 roles UPDATE via the `authenticated` twin | Yes — net-zero, (B) |
| 6 | DROP `"Authenticated users can create approval requests"` | anyone authenticated inserts with ANY `requested_by` | — | Yes — finding (E) |
| 7 | DROP `"Financial secretary can create approval requests"` | 4 finance roles insert own rows | still may, via statement 9 (strict superset) | Yes — net-zero given 9 |
| 8 | DROP `"Authenticated users can insert generated reports"` | anyone authenticated inserts anything | — | Yes — finding (C) |
| 9 | CREATE `"Users can create their own approval requests"` | — | any authenticated caller inserts **only** rows where `requested_by = auth.uid()` | Yes — narrowest predicate keeping both callers working |
| 10 | DROP + CREATE `generated_reports_insert` | anyone authenticated inserts anything | holders of `reports.view_financial`; service-role cron unaffected | Yes — finding (C) |

**The `anon` reasoning behind rows 3-5** is the one place a `TO public` → `TO authenticated`
reduction could genuinely narrow access, so it is argued from grants rather than from the policies
looking alike. `EXECUTE` on `public.get_my_role_name()` is `REVOKE`d `FROM PUBLIC, anon` and
`GRANT`ed only `TO authenticated, service_role`
(`20260824200000_harden_database_security_and_health_indexes.sql:28,38`, re-asserted at
`20260829100200_gate_auth_helpers_on_approval_status.sql:198,206`). For `anon` those predicates
cannot return true — they raise `42501` inside policy evaluation, an HTTP 500 rather than a row.
Dropping them removes an error path and grants nothing. For the ownership predicate, `auth.uid()`
is `NULL` for `anon`, so `requested_by = NULL` is `NULL`, which RLS treats as not-true: zero rows
before, zero rows after. This is the mechanism `20260905003000_close_anonymous_table_reads.sql`
established and verified live.

Row 2 needs no `anon` argument at all: both policies in that pair are `TO public`, so grantee is
not in play, and the dropped predicate is a strict subset of a surviving one under the identical
command. Neither declares `WITH CHECK`, so both default it to their `USING` expression and the
subset relation holds on the write side too.

**Idempotency.** Every statement is `DROP POLICY IF EXISTS`; both creates are preceded by a drop
of their own name. A second apply cannot abort with `42710`. The whole file is one transaction.

**Ordering.** `20260909020000` sorts after `20260909010000`, the latest migration on disk.

---

## 4. Not fixed, and why

### 4.1 Anonymous read of active bank accounts — MEASURED, latent not live, NOT fixed

Noticed while reasoning about `anon` for requirement 3. It is a pre-existing condition this
migration neither creates nor closes, and it is **out of scope**, so per `CORE.md` §15 it is
reported rather than absorbed into a cleanup where no reviewer would look for it.

The surviving policy `"All authenticated can view active bank accounts"` is granted `TO public`,
and its first disjunct is `is_active = true` — a plain column read that evaluates to TRUE for an
`anon` caller **without calling any function**, so the `EXECUTE` revocations that protect the other
policies do not bite. The RESTRICTIVE gate `"Approved accounts only can read"` is scoped
`TO authenticated`, and a RESTRICTIVE policy constrains only the roles it names — so it does **not**
apply to `anon` at all. On that reading, an anonymous caller holding only the publishable key can
read every *active* row of a table that holds bank account numbers.

**Both open questions were measured by the coordinator on `Residio_Prod` (2026-09-09), in a
transaction that ended in `ROLLBACK`. The reasoning above is sound; the conclusion is not.**

1. `anon` **does** still hold the `SELECT` grant —
   `has_table_privilege('anon','public.estate_bank_accounts','SELECT')` is `true`.
   `estate_bank_accounts` was indeed not among the six tables `20260905003000` closed.
2. But the read **does not succeed**. Probing `set local role anon; select count(*) from
   public.estate_bank_accounts;` returns `42501: permission denied for function
   get_my_role_name`. Postgres evaluates the second disjunct rather than short-circuiting on
   `is_active = true`, so the `EXECUTE` revocation bites after all and `anon` receives an error
   rather than rows.

**Verdict: latent, not live.** No anonymous caller can read this table today. It stays worth
scoping to `authenticated` eventually — the protection is an error path rather than a policy
decision, which is a fragile place to leave bank account numbers — but it is not an active
exposure and it is unchanged by this migration, which leaves that policy untouched.

Contrast `generated_reports`, where the same style of reasoning **did** find a live hole: see §6.

### 4.2 Grantee migration `TO public` → `TO authenticated`

`estate_bank_accounts` keeps two `TO public` `ALL` policies. Migrating grantees is a real access
change, is the separate concern `20260905003000` owns, and would hide that change inside a
de-duplication. Left alone.

### 4.3 `is_approved()` on the new approval-request INSERT policy

Considered and not taken. A non-active profile is already blocked at the action layer, because
`get_my_role_name()` and `has_permission()` both filter on `approval_status = 'active'`
(`20260829100200_gate_auth_helpers_on_approval_status.sql`), so every permission check upstream of
`createApprovalRequest` already fails for such an account. Adding it would be tightening beyond the
finding, on a path with no demonstrated gap.

### 4.4 `generated_by = auth.uid()` on the new `generated_reports_insert`

Considered and not taken, for the same reason: the brief asked for a permission-scoped predicate,
`has_permission('reports.view_financial')` matches the table's existing SELECT sibling in both
style and strength, and adding an ownership clause would tighten past the finding without evidence
of a gap.

### 4.5 Out-of-scope tables

`residents`, `resident_houses` and `hierarchical_settings` have genuine multi-audience policies and
are untouched (issue #285 §4). No table other than the three named is referenced anywhere in the
migration.

---

## 5. Consequence to confirm before applying

`/settings/bank-accounts` is gated by `PERMISSIONS.SETTINGS_MANAGE_REFERENCE`
(`src/lib/auth/action-roles.ts:267`), but after this migration the *inactive* rows on that page are
gated by the hardcoded role list `['super_admin','chairman','vice_chairman','financial_officer']`
instead. `getBankAccounts(includeInactive)` (`src/actions/imports/bank-accounts.ts:56`) runs on the
user-scoped client, so a role holding `settings.manage_reference` **outside** that list will find
its "show inactive" toggle silently returning only active accounts — RLS filters rather than errors,
so nothing is raised anywhere.

This is the intended effect per the brief (deactivated accounts become finance-role-only), and it
is recorded here rather than discovered later.

**Measured by the coordinator on `Residio_Stage` (2026-09-09): `settings.manage_reference` is held
by three roles — `super_admin`, `vice_chairman` and `secretary`.**

`secretary` is the predicted gap, and it is real. A secretary reaches `/settings/bank-accounts`
through the route permission, but is not in the four-role finance array, so after this migration
their "show inactive" toggle returns only active accounts and nothing is raised. The other two
holders are both in the array and are unaffected.

That narrowing is the intended effect of closing the `is_active` bypass — a secretary losing sight
of deactivated bank accounts is the point, not a regression. What is **not** intended is that it
happens silently: the toggle appears to work and under-reports. Filed separately rather than
absorbed here; the fix belongs in the UI layer, not in this migration.

For comparison, `reports.view_financial` is held by five roles — `super_admin`, `chairman`,
`vice_chairman`, `financial_officer` and `project_manager` — all of which retain insert on
`generated_reports` under the new policy.

---

## 6. The live anonymous write hole this migration closes

Measured by the coordinator on `Residio_Prod` (2026-09-09), in a transaction that ended in
`ROLLBACK`. Nothing was committed.

`generated_reports_insert` was `PERMISSIVE FOR INSERT TO public WITH CHECK (true)`. Unlike the
`SELECT` twins elsewhere in this cleanup, `true` calls no revoked function, so nothing made it fail
for `anon` — and `has_table_privilege('anon','public.generated_reports','INSERT')` is `true`.

| Probe as `anon` | Result |
| --- | --- |
| `insert into public.generated_reports default values;` **before** | `23502` null value in column "name" violates not-null constraint |
| the same insert with valid columns, **after** this migration is applied in the same transaction | `42501` new row violates row-level security policy |

A **not-null** failure is downstream of the policy check, so RLS *permitted* the anonymous insert.
**Any holder of the publishable anon key could write arbitrary rows into `generated_reports`
today**, and this migration is what stops it.

The original framing of finding 3 — "any authenticated caller" — understated this. It is the one
drop in this file whose `anon` dimension is load-bearing.

---

## 7. Noted, not changed: a stale test list

`src/__tests__/last-legacy-role-policies.test.ts:205-212` describes its `MUST_SURVIVE` entries as
policies "that must survive this migration intact". Two of them are touched by #285:

- `:229` `'Authenticated users can insert generated reports'` — **dropped here**
- `:231` `'generated_reports_insert'` — **redefined here**

A third, `:227` `'Authenticated users can view generated reports'`, is not in the #279 baseline at
all — `generated_reports` carries exactly four policies (baseline:5265–5272) and this is not one of
them. That staleness pre-dates #285.

**The test does not fail**: its assertion is a textual check over `20260906020000`'s own SQL only
(`MIGRATION_FILE`, `:48`), so this migration cannot trip it. But a reader landing there will
conclude those policies are protected invariants. `src/**` is out of scope for this change, so it
is filed separately rather than edited here.
