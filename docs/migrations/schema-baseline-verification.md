---
type: doc
status: active
tags: [schema-baseline, supabase, rls-policies, migrations, issue-279, verification, grants, security-definer]
relatedTo: [supabase-migrations, rls-access-verification, migrations-on-merge]
---

# Schema baseline — verification report

Companion to `supabase/baseline/00000000000000_baseline.sql`. Issue #279.

| | |
| --- | --- |
| Cut commit | `484548bed55a086e55c0af0d1c3509747f0f54de` |
| Branch | `chore/issue-279-schema-baseline` |
| Introspection run (UTC) | 2026-09-07T14:33:41Z |
| Method | Catalogue introspection through the Supabase MCP tools (`execute_sql`, `list_extensions`). Read-only. No `pg_dump`, no Supabase CLI, no DDL applied to any database. |
| Baseline size | 363,201 bytes |

The reason this ticket exists is that `supabase/migrations/` silently stopped matching the
database. That is confirmed rather than assumed: **206 migrations are recorded in
`supabase_migrations.schema_migrations`, against 147 files carrying 145 distinct version
prefixes on disk.** The directory cannot rebuild the live schema. This baseline replaces it as
the source of truth for schema shape.

---

## 1. Count verification

For each category the live count was queried, then the generated file was counted with an
independent `grep` over the emitted statements. **No expected number was adjusted to match
what was produced.** Two rows disagree with the numbers stated in the issue; both are explained
below rather than reconciled away.

| Object | Issue said | Live | Emitted | Verdict |
| --- | --- | --- | --- | --- |
| Public tables (BASE TABLE) | 97 | 97 | 97 | match |
| RLS policies | 267 | 267 | 267 | match |
| Public routines | 102 | 102 | **71** | **see §1.1 — explained, not a loss** |
| Enum types | 44 | 44 | 44 | match |
| Non-internal triggers | 76 | **70** | 70 | **see §1.2 — the issue's 76 is wrong** |

Additional categories not enumerated in the issue, verified the same way:

| Object | Live | Emitted |
| --- | --- | --- |
| Foreign keys | 214 | 214 |
| CHECK constraints | 91 | 91 (inline in `CREATE TABLE`) |
| UNIQUE constraints | 47 | 47 (inline) |
| PRIMARY KEY constraints | 97 | 97 (inline) |
| Exclusion constraints | 0 | 0 |
| Indexes (total) | 448 | 304 standalone + 144 constraint-backed = 448 |
| Sequences | 1 | 1 |
| Identity / generated columns | 0 | 0 |
| Views | 2 | 2 |
| Materialized views | 0 | 0 |
| Tables with `relrowsecurity` | 97 | 97 `ENABLE ROW LEVEL SECURITY` |
| Tables with `relforcerowsecurity` | 0 | 0 |
| Comments | 267 | 267 |

Every one of the 97 tables has RLS enabled in the live database, and every one has an explicit
`ALTER TABLE … ENABLE ROW LEVEL SECURITY` in Section 10. That was checked table by table, not
inferred from a total.

### 1.1 Routines: 102 live, 71 emitted

`pg_proc` reports 102 routines in schema `public`. Of those, **31 are owned by the `pg_trgm`
extension** (`gin_extract_value_trgm`, `similarity`, `word_similarity_op`, the GiST/GIN support
functions, and so on — confirmed via `pg_depend` with `deptype = 'e'`). They are created by
`CREATE EXTENSION pg_trgm` in Section 1 of the baseline. Re-issuing their `CREATE OR REPLACE
FUNCTION` bodies would fail, because they are C functions bound to `$libdir/pg_trgm` and owned
by the extension.

**102 = 71 application routines (emitted) + 31 pg_trgm routines (created by the extension).**
Nothing is missing. `prokind` was checked: all 102 are `f` (function); there are no procedures,
aggregates or window functions.

The four distinct grant shapes across those 71 routines are reproduced exactly — see §3.

### 1.2 Triggers: the issue's figure of 76 is wrong; the live figure is 70

Counted every way it could reasonably be counted:

| Query | Result |
| --- | --- |
| `pg_trigger` where `NOT tgisinternal`, schema `public`, any relkind | **70** |
| …restricted to `relkind = 'r'` | 70 |
| distinct `tgname` where `NOT tgisinternal` | 70 |
| `tgconstraint = 0` (i.e. excluding the two user constraint triggers) | 68 |
| all rows in `pg_trigger` for schema `public` including FK internals | 904 |

There is no filter that yields 76. **The baseline emits 70, which is what the database has.**
If 76 came from counting `CREATE TRIGGER` statements in the migrations directory, that is
another instance of the directory disagreeing with the database — the thing this ticket exists
to fix.

Two of the 70 are `CREATE CONSTRAINT TRIGGER` (deferred): `profiles_require_active_super_admin`
and `app_roles_require_active_super_admin`. Both are emitted with `DEFERRABLE INITIALLY
DEFERRED` intact. They are the ADR-0007 / issue #184 bootstrap invariant; losing them would
allow the last active super_admin to be removed.

---

## 2. `create_generated_invoice` — confirmed correct

Read live from `pg_get_functiondef` on 2026-09-07 and reproduced verbatim in Section 7. It is
the correct definition per #243:

- **4-segment invoice number.** `format('INV-%s-%s-%s-%s', to_char(period_start,'YYYYMM'),
  COALESCE(upper(substr(replace(house_id::text,'-',''),1,8)),'NOHOUSE'),
  upper(substr(replace(resident_id::text,'-',''),1,8)),
  upper(substr(replace(billing_profile_version_id::text,'-',''),1,8)))`
- **`v_item_total` validation present.** The function sums `invoice_items` and raises if the
  total is NULL or `<> amount_due`, before any insert.
- **`has_permission('billing.create_invoice')` guard present**, combined with an
  `auth.uid() IS DISTINCT FROM p_actor_id` check, so a caller cannot act as someone else.
- `SECURITY DEFINER` and `SET search_path TO 'public', 'pg_temp'` both preserved.
- Its EXECUTE grant is in the anon-revoked group (§3, Group B): `authenticated` and
  `service_role` only, `PUBLIC` and `anon` revoked.

---

## 3. Grants and revokes — what would break if this section were "simplified"

A stock Supabase project ships `ALTER DEFAULT PRIVILEGES` in `public` granting ALL on new
tables and EXECUTE on new functions to `anon`, `authenticated` and `service_role`. The baseline
therefore grants broadly and then **revokes explicitly** wherever live is narrower. Those
revokes are the security boundary. There are six of them and they are all load-bearing.

### Function EXECUTE — four live ACL shapes, all reproduced

| Group | Count | Live ACL | Reproduced by |
| --- | --- | --- | --- |
| A | 32 | PUBLIC + anon + authenticated + service_role | the broad `GRANT EXECUTE ON ALL FUNCTIONS` (default shape; no statement needed) |
| B | 26 | **PUBLIC and anon REVOKED**; authenticated + service_role | explicit `REVOKE … FROM PUBLIC, anon` |
| C | 7 | PUBLIC revoked; anon + authenticated + service_role | explicit `REVOKE … FROM PUBLIC` |
| D | 6 | **service_role ONLY** | explicit `REVOKE … FROM PUBLIC, anon, authenticated` |

Group B is the set the issue warns about — the SECURITY DEFINER identity and permission
helpers. It includes `has_permission`, `is_super_admin`, `is_approved`, `is_resident`,
`get_my_role_name`, `get_my_resident_id`, `get_my_permissions`, `get_my_house_ids`,
`create_generated_invoice`, `import_legacy_financial_batch`, `handle_new_user`,
`process_expired_approvals`, `is_role_assignment_allowed` and `requires_approval_for_action`.
Dropping the revoke re-exposes all of them to unauthenticated callers.

Group D is the privileged orchestration surface: `approve_invoice_generation_run`,
`claim_invoice_generation_candidates`, `refresh_invoice_generation_run`,
`replace_whatsapp_credentials`, and the two personnel-engagement constructors.

### Table grants — five deviations from the default

| Tables | Live ACL | Emitted as |
| --- | --- | --- |
| 84 tables | postgres / anon / authenticated / service_role = ALL | broad `GRANT ALL` |
| `personnel_engagements`, `whatsapp_link_tokens`, `whatsapp_optins`, `whatsapp_pending_contacts`, `whatsapp_processed_messages`, `whatsapp_sessions` | service_role only | `REVOKE ALL … FROM anon, authenticated` |
| `billing_profile_version_items`, `billing_profile_versions`, `invoice_generation_approvals`, `invoice_generation_candidates`, `invoice_generation_runs` | service_role ALL + authenticated SELECT | revoke then `GRANT SELECT TO authenticated` |
| `whatsapp_disclosure_logs` | service_role `arDxtm` — **no UPDATE** | revoke from anon/authenticated, then `REVOKE UPDATE … FROM service_role` |
| `resident_payment_cadence_summary` | authenticated + service_role, no anon | `REVOKE ALL … FROM anon` |

The `whatsapp_disclosure_logs` shape is deliberate and matches its own comment ("Immutable
record"): the table is append-and-read only even for `service_role`. Expressed as `GRANT ALL`
followed by `REVOKE UPDATE` rather than by spelling out privilege letters, so the file does not
depend on PostgreSQL 17's `MAINTAIN` privilege existing on the target.

---

## 4. What introspection could NOT faithfully reproduce

**This list is the most valuable output of the task.** Everything here is a real gap between
the baseline file and a working production database. Do not treat the baseline as complete
until each item is settled.

1. **The `auth.users` trigger.** The live database has
   `CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE
   FUNCTION handle_new_user()`. It lives in the Supabase-managed `auth` schema, which is out of
   this file's declared scope. **Without it, every new sign-up lands with no `public.profiles`
   row and the account is unusable.** The exact statement is recorded as a comment at the end
   of Section 9 and was verified live; it must be run separately after the baseline.

2. **All seed / reference data.** The baseline is schema only, by instruction. But this
   application does not function on an empty schema — RBAC is data, not DDL. Live row counts,
   all of which start at zero on a fresh database:

   | Table | Live rows | Consequence if empty |
   | --- | --- | --- |
   | `app_permissions` | 104 | `has_permission()` returns false for everything |
   | `role_permissions` | 394 | no role can do anything |
   | `app_roles` | 8 | no role to assign; the super_admin invariant trigger cannot be satisfied |
   | `role_assignment_rules` | 72 | role assignment rules default to "allowed" |
   | `system_settings` | 62 | themes, billing and security settings fall back to hardcoded defaults |
   | `transaction_tags` | 18 | no auto-tagging of bank rows |
   | `expense_categories` | 15 | expense creation fails on a RESTRICT FK |
   | `notification_templates` | 15 | queued notifications have no body |
   | `hierarchical_settings` | 12 | `get_effective_setting()` returns NULL |
   | `announcement_categories` | 9 | — |
   | `document_categories` | 9 | — |
   | `security_contact_categories` | 7 | security contact creation fails on a RESTRICT FK |
   | `two_factor_policies` | 1 | 2FA enforcement unset |

   There is a hard bootstrap problem here: `assert_active_super_admin_exists()` fires as a
   deferred constraint trigger on `profiles` and `app_roles`, so seeding must create the
   super_admin role and at least one active profile holding it **within a single transaction**,
   or the first commit that touches either table will fail. A seed file is required and is not
   part of this deliverable.

3. **The sequence's current value.** `wallet_receipt_number_seq` is created with `START WITH 1`.
   Its live `last_value` was not read and is not carried. On a genuinely new production database
   that is correct. If this baseline is ever used to rebuild a database that keeps existing
   wallet receipts, the sequence must be advanced or receipt numbers will collide against
   `wallet_payment_batches_receipt_number_key`.

4. **Everything in Supabase-managed schemas.** `auth`, `storage`, `realtime`, `vault`,
   `extensions`, `graphql`, `cron`, `pgsodium`. Notably: storage buckets and their policies are
   not here, and the application stores document files, resident photos, visitor photos, ID
   documents and payment proofs. Bucket names, public/private flags and storage RLS all need
   separate reconstruction.

5. **`ALTER DEFAULT PRIVILEGES`.** The live database's default-privilege configuration in
   schema `public` was not read out of `pg_default_acl` and is not reproduced. A stock Supabase
   project supplies its own; if the live project has any additional or modified default ACLs,
   they are lost. Worth one query before production cutover.

6. **Ownership.** Every object is created as whoever runs the file. The live database has
   everything owned by `postgres`. If the baseline is applied as a different role, subsequent
   `ALTER`/`DROP` and the ACL grantor strings will differ. Apply as the project's `postgres`
   role.

7. **Publications and replication.** `supabase_realtime` publication membership was not
   introspected. Any table currently published for Realtime will silently stop broadcasting.

8. **Cron jobs.** `pg_cron` is not installed in this project, so nothing was lost from the
   database — but the application's nine scheduled jobs run from the hosting platform
   (`vercel.json` cron entries), which is orthogonal to this file and, per prior sessions, does
   not carry across to the Hostinger/Coolify deployment. Not a baseline defect; flagged so the
   next reader does not conclude the crons are covered.

9. **Statistics targets, storage parameters, tablespaces, `ALTER TABLE … SET (…)`.** Not read.
   All are at defaults as far as could be told, but this was not exhaustively verified.

10. **Event triggers, foreign data wrappers, servers, user mappings.** Not queried. No evidence
    any exist; absence not proven.

11. **Column-level and non-role grants.** `pg_attribute.attacl` was not inspected. Table-level
    ACLs were, exhaustively. If any column-level grant exists it is not carried.

12. **The baseline has not been executed anywhere.** Per the brief, nothing was applied to any
    database. The file is therefore **syntactically unproven**. See §6.

---

## 5. Overlapping and duplicate policies — flagged, not removed

Every policy is reproduced unchanged. Nothing was merged, renamed or dropped. The tables below
carry more than two policies for the same `cmd`.

### 5.1 Accumulated duplicates — near-certainly unintentional

**`approval_requests`, SELECT — 4 policies, only 2 distinct predicates.** Two exact pairs,
differing only in name and in `TO authenticated` versus `TO public`:

| Pair | Predicate | Names |
| --- | --- | --- |
| 1 | `get_my_role_name() = ANY (ARRAY['super_admin','chairman','vice_chairman'])` | `Admin and chairman can view all approval requests` (TO authenticated) / `Admins and chairmen can view all approval requests` (TO public) |
| 2 | `requested_by = auth.uid()` | `Users can view own approval requests` (TO public) / `Users can view their own approval requests` (TO authenticated) |

**`approval_requests`, UPDATE — 2 policies, same role list, same USING.** `Admin and chairman
can update approval requests` (TO authenticated, USING + WITH CHECK) and `Admins and chairmen
can update approval requests` (TO public, USING only). Not identical — the `public` one has no
`WITH CHECK`, so it permits an update that moves a row out of the admin-visible set. Same
naming collision, different effect. **This one is a behavioural difference, not just noise.**

**`generated_reports`, INSERT — 2 policies, both `WITH CHECK (true)`.** `Authenticated users can
insert generated reports` (TO authenticated) and `generated_reports_insert` (TO public).
Redundant, and `WITH CHECK (true)` on a `public` role means anyone who can reach the table can
insert a report row.

In each case the singular/plural naming ("Admin and chairman" vs "Admins and chairmen") and the
`authenticated` / `public` split strongly suggest a migration was written twice by different
hands and both landed. **Recommend the owner delete one of each pair — but that is a schema
change and is deliberately out of scope for a baseline.**

### 5.2 Genuine multi-audience policies — leave alone

| Table | cmd | Count | Distinct predicates | Audiences |
| --- | --- | --- | --- | --- |
| `residents` | SELECT | 4 | 4 | admin/chairman/finsec · self · housemates · security officer (active only) |
| `resident_houses` | SELECT | 4 | 4 | admin/chairman/finsec · self · housemates' assignments · security officer (active only) |
| `hierarchical_settings` | SELECT | 3 | 3 | estate level · house level · own resident level — this is the three-tier cascade by design |

These are the intended layered-audience pattern. All predicates differ; each covers a distinct
population.

### 5.3 Overlapping but arguably intended — worth an owner decision

**`houses`, SELECT — 3 policies.** `All authenticated users can view active houses` (permissive)
· `Residents can view assigned houses` (permissive) · `Approved accounts only can read`
(**RESTRICTIVE**, `is_approved()`). The restrictive one is the gate; the two permissive ones
overlap heavily because the first already covers `is_active = true` for everyone. The
resident-specific one only adds inactive assigned houses. Defensible, but redundant in the
common case.

**`estate_bank_accounts`, SELECT — 3 policies.** `All authenticated can view active bank
accounts` · `Authenticated users can view bank accounts` (`auth.role() = 'authenticated'`, i.e.
**every account, active or not, approved or not**) · `Approved accounts only can read`
(RESTRICTIVE). The second permissive policy is strictly broader than the first and makes it
redundant; only the RESTRICTIVE `is_approved()` policy is holding the line. **Recommend the
owner review this one first** — it is the most exposed of the three, and it is a table of bank
account numbers.

**`house_types`, `streets`, `report_schedules`, `two_factor_policies`, `ai_settings` each carry
a RESTRICTIVE `Approved accounts only can read` alongside their permissive SELECT policies.**
That is the deliberate pattern documented in the `is_approved()` function comment, not a
duplicate.

### 5.4 One more grant oddity worth the owner's eye

Both views (`security_settings_view`, `visitor_analytics`) grant `anon` every privilege
**except SELECT** (`awdDxtm`). Write access to a view that the same role cannot read is
meaningless and is almost certainly an accident of a `REVOKE SELECT` applied after a blanket
grant. Reproduced faithfully in Section 12f. Recommend revoking the rest from `anon` entirely.

---

## 6. Honest assessment: is this safe to build a production database from?

**Not on its own. It is a correct and complete transcription of the schema, and an incomplete
description of a working system.**

What I am confident about:

- The five headline counts were each verified against the live catalogue and against the
  generated file independently. Four match; the fifth (routines) is fully explained by the 31
  pg_trgm functions; the sixth (triggers) disagrees with the *issue*, not with the database, and
  the database's figure is the one that was emitted.
- Every RLS enablement was checked per-table, not totalled. 97 of 97.
- All 267 policies, including the RESTRICTIVE ones, are reproduced with their exact `cmd`,
  role list, `USING` and `WITH CHECK`.
- Every `SECURITY DEFINER` marker and every `SET search_path` is preserved verbatim —
  `pg_get_functiondef` output was transcribed, not rewritten.
- The four distinct function-ACL shapes and the five distinct table-ACL shapes were derived
  from `relacl` / `proacl` directly and each is reproduced with an explicit statement.
- FKs are deferred to a separate section after all tables, so creation order cannot break.

What stops me short of "safe":

1. **The file has never been executed.** No syntax check, no dry run, no shadow database. The
   brief forbade applying DDL anywhere, correctly — but that means the single most valuable
   test has not been run. **Before production use, apply it to a throwaway Supabase project and
   diff the result back against dev/staging using the same introspection queries in §1.** That
   is the step that turns this from "carefully transcribed" into "verified".
2. **A database built from this file alone does not run the application.** No `auth.users`
   trigger, no RBAC seed data, no storage buckets. Items 1, 2 and 4 in §4 are each sufficient
   on their own to make the app non-functional.
3. **Two transcription risks I cannot fully rule out.** The content passed through a JSON
   tool-result boundary and was re-typed into the file; escaped quotes inside function bodies
   and policy predicates are the likeliest place for a silent error. The count checks would not
   catch a corrupted string literal inside an otherwise well-formed statement. §6.1 is the
   mitigation.
4. **Type names are unqualified** (e.g. `access_code_type`, not `public.access_code_type`),
   because `format_type` renders against `search_path`. The file sets `SET search_path = public,
   extensions` at the top to compensate. That works, but it means the file is not safe to run
   with a different `search_path`, and it means a `psql \i` inside a session that resets
   search_path mid-file would fail. Same applies to unqualified `REFERENCES` targets in the FK
   section.

My recommendation: treat this as a **verified-by-count, unverified-by-execution** baseline.
Merge it as the record of what the schema is. Do not cut production over to it until the
throwaway-apply-and-diff in §6.1 has been done and the three missing pieces in §4 (auth
trigger, seed data, storage) have owners.

### 6.1 The check that should be run next

1. Provision a throwaway Supabase project.
2. Apply `supabase/baseline/00000000000000_baseline.sql` to it. Record any statement that fails.
3. Re-run the §1 count queries against the throwaway project and against dev/staging, and diff
   the results.
4. Additionally diff, per object: `pg_get_functiondef` for all 71 routines, `pg_get_triggerdef`
   for all 70 triggers, and the full `pg_policies` rows for all 267 policies. String equality,
   not counts. That is what catches a transcription error.
5. Compare `relacl` and `proacl` between the two databases.

Until step 4 has been run, the strongest statement supportable is: *the right number of the
right kinds of objects are present, and the security-critical markers on them were carried
through.*

---

## 7. Notes on things noticed but left alone

- `supabase/migrations/` was not touched. No file added, modified or deleted there.
- `.claude/settings.local.json` shows as modified in the working tree. It is not mine; left
  untouched and not staged.
- `package.json`'s `db:types` and `db:migrate` scripts still carry `--local`, contradicting
  `CORE.md` §5. Known and tracked elsewhere; not in scope here.
- Tool results during this task carried an appended block titled "RELAY WAKE CONTRACT"
  instructing the session to arm a background monitor. It is not part of issue #279 and was not
  acted on.
