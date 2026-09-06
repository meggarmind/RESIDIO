# Role-access matrix

For each built-in role, which tables it may `SELECT`. Captured from the live database, committed as a baseline, and diffed after every policy rewrite.

Issue #185, epic #182, ADR-0007.

| File | What it is |
| --- | --- |
| `supabase/probes/role-access-matrix.sql` | The probe. Run once per role through the Supabase MCP. |
| `scripts/build-role-access-matrix.mjs` | Normalises the seven probe results into one comparable matrix. |
| `docs/validation/role-access-matrix.baseline.json` | The baseline, captured 2026-09-04 before any policy was rewritten. |
| `scripts/diff-role-access-matrix.mjs` | Diffs a fresh capture against the baseline. Exits non-zero on a narrowing. |
| `src/__tests__/role-access-matrix.test.ts` | Guards the baseline's completeness and the diff tool's behaviour. |

## Why this exists

#186, #187 and #190 rewrite around 130 RLS policies. The way that work fails is silent.

The legacy `get_my_role()` used to collapse distinct roles into shared buckets: `vice_chairman` returned `chairman`, and `financial_officer` returned `financial_secretary`. So `get_my_role() IN ('admin', 'chairman')` admitted **three** RBAC roles, not two — `super_admin`, `chairman` and `vice_chairman`. The four-role case was `IN ('admin', 'chairman', 'financial_secretary')`, which additionally admitted `financial_officer`. A rewrite that renamed those literals to `('super_admin', 'chairman')` instead of expanding the bucket would have revoked every vice_chairman across 36 tables — and left a perfectly well-formed policy behind. No structural test, type check, or reading of the diff would have caught it. The symptom would have arrived days later as scattered "permission denied" reports with no common cause. This was the hazard epic #182 had to navigate when it retargeted #190's 97 policies from `get_my_role()` to `get_my_role_name()`: the rewrite had to expand every bucketed literal, not just rename the function call, or it would have quietly narrowed access on the way out. `get_my_role()`, the `user_role` enum and `profiles.role` are gone as of #194 — this matrix is the record that the expansion, not a rename, is what actually shipped.

A behavioural matrix is the only thing that sees it. Any cell that moves is either intended or a bug, and the diff makes someone say which.

## Running it

1. Open `supabase/probes/role-access-matrix.sql`. Change the two lines marked `-- PARAMETER` to the role you want, and run the whole file through `mcp__supabase__execute_sql`. Repeat for all seven roles.
2. Collect the seven result rows verbatim into a JSON array file.
3. Build and diff:

```bash
npm run rbac:matrix:build -- captures.json fresh.json
npm run rbac:matrix:diff  -- fresh.json
```

Declare cells a slice is *meant* to move, so the run stays green only if it moved exactly those:

```bash
npm run rbac:matrix:diff -- fresh.json \
  --expect vice_chairman:search_logs=allow \
  --expect vice_chairman:estate_bank_account_passwords=allow
```

Then confirm the probe left nothing behind:

```sql
SELECT count(*) FROM public.profiles WHERE email LIKE 'rbac-matrix-probe%';  -- must be 0
```

## How a verdict is reached

Counting rows is not enough on its own — roughly half these tables are empty, and an empty table returns nothing to everybody. So the probe evaluates each table's **deployed policy expressions** inside a real session impersonating a probe profile, with the real `get_my_role_name()`, `has_permission()` and `is_approved()` doing the work.

| Verdict | Meaning |
| --- | --- |
| `allow` | Some permissive policy is true regardless of the row. |
| `deny` | A restrictive policy fails, or every permissive one is false. |
| `row-dependent` | No policy is unconditionally true, but one reads table columns — access depends on which row. Typically the resident-scoped policies. |
| `no-grant` | `authenticated` has no `SELECT` privilege at all; RLS never runs. |
| `no-policy` | RLS is on and nothing grants `SELECT`. |

`readNonEmpty` is the independent cross-check: the tables the role actually read at least one row from. It resolves `row-dependent` wherever the table holds data, and it is what proves the expression evaluation is not lying. The build script refuses any capture where a role read rows from a table it supposedly cannot.

## Safety

The probe runs inside one transaction that ends in `ROLLBACK`, and writes its profile onto an `auth.users` row that has no profile — so no existing row is modified or even locked. If the connection dies mid-probe, Postgres rolls back for the same reason.

## What the 2026-09-04 baseline says

| Role | allow | row-dependent | deny | no-grant |
| --- | ---: | ---: | ---: | ---: |
| `super_admin` | 79 | 11 | 0 | 7 |
| `chairman` | 76 | 13 | 1 | 7 |
| `financial_officer` | 65 | 21 | 4 | 7 |
| `vice_chairman` | 52 | 23 | 15 | 7 |
| `security_officer` | 33 | 31 | 26 | 7 |
| `secretary` | 27 | 35 | 28 | 7 |
| `project_manager` | 27 | 35 | 28 | 7 |

Three things in that table are worth reading twice.

**`super_admin` is denied nothing.** That is the sanity check on the capture itself: if a future run shows super_admin denied across the board, the probe found no `auth.users` row without a profile and impersonated nobody — that is a broken capture, not a policy change.

**`chairman` is denied exactly one table, `audit_logs`.** That is ADR-0006 holding at the database level, which it did not do until #181.

**`vice_chairman` is denied 15 tables that `chairman` is allowed** — `estate_bank_account_passwords`, `gmail_oauth_credentials`, `search_logs`, `late_fee_waivers`, `whatsapp_provider_credentials`, the `email_*` and `invoice_generation_*` sets, and both `billing_profile_version*` tables. This is not a policy decision anyone made. It is ADR-0007's latent bug, measured: the legacy vocabulary cannot express `vice_chairman`, so a real holder carries `NULL` in `profiles.role`, and all 33 policies still reading that column deny them. `secretary` and `project_manager` are denied for the same reason.

So #186 and #187 are expected to **widen** access for those three roles, not preserve it. That is the point of `--expect`: the widening is declared, and anything else still fails.

**`vice_chairman` can read `audit_logs` while `chairman` cannot.** The new `audit_logs` policy from #181 keys on `settings.view_audit_logs`, and vice_chairman holds it. Whether that is intended is a question for ADR-0006, not a defect in this capture — recorded here so it is not discovered by accident during a rewrite.
