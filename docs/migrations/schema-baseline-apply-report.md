# Schema baseline apply report — sections 11–13 (issue #279)

Target: `miyeswqbwarvipdzwqnz` (Residio_Prod). Source file:
`supabase/baseline/00000000000000_baseline.sql` on branch
`chore/issue-279-schema-baseline`.

## Prior state (not re-applied, verified by the coordinator before this run)

Sections 1–10 of the baseline (extensions, enum types, sequence, tables, foreign keys,
indexes, functions/procedures, views, triggers, RLS enablement) were applied in an earlier,
separate session that was interrupted by a rate limit partway through Section 11. Before this
run started, the coordinator dropped every partially-created policy from that interrupted
attempt, so Section 11 began from a clean slate (0 policies). The coordinator's measured
baseline immediately before this run:

| Object | Present | Expected |
|---|---|---|
| Tables | 97 | 97 |
| Foreign keys | 214 | 214 |
| App routines | 71 | 71 |
| Enum types | 44 | 44 |
| Triggers | 70 | 70 |
| Views | 2 | 2 |
| Indexes | 448 | 448 |
| RLS enabled | 97 | 97 |
| Policies | 0 | 267 (this run's job) |

This run re-verified `select count(*) from pg_policies where schemaname='public'` returned `0`
against `miyeswqbwarvipdzwqnz` immediately before applying Section 11.

## Section boundaries located in the file

Exact banner line numbers (re-derived by grep, not assumed from the issue brief):

```
5005  -- SECTION 11 — RLS POLICIES (267)
5721  -- SECTION 12 — GRANTS AND REVOKES
5868  -- SECTION 13 — COMMENTS
6209  end of file
```

## Section 11 — RLS policies (267)

Applied via `apply_migration`, split at a statement boundary into two calls (both against
`miyeswqbwarvipdzwqnz`):

- `baseline_s11_policies` — first 193 `CREATE POLICY` statements (file lines 9–531), covering
  tables `access_codes` through the first policy on `residents`
  (`"Admins chairmen fin sec can insert residents"`). Result: `{"success":true}`.
- `baseline_s11_policies_part2` — remaining 74 `CREATE POLICY` statements (file lines 532–716),
  covering the rest of `residents` through `whatsapp_sessions`. Result: `{"success":true}`.

The split point fell exactly on a statement boundary (end of a `CREATE POLICY ... ;` line); no
statement was cut mid-clause. 193 + 74 = 267, matching the section's declared count.

Post-apply verification: `select count(*) from pg_policies where schemaname='public'` on
`miyeswqbwarvipdzwqnz` → **267**.

No errors were encountered in Section 11.

## Section 12 — Grants and revokes

Applied in a single `apply_migration` call, `baseline_s12_grants`, covering:

- Schema `USAGE` grant on `public` to `anon, authenticated, service_role`
- Broad `GRANT ALL` on all tables/sequences to `anon, authenticated, service_role` (12a)
- `REVOKE ALL` on 6 tables from `anon, authenticated` (12b: `personnel_engagements`,
  `whatsapp_link_tokens`, `whatsapp_optins`, `whatsapp_pending_contacts`,
  `whatsapp_processed_messages`, `whatsapp_sessions`)
- `REVOKE ALL` + `GRANT SELECT` to `authenticated` on 5 tables (12c: `billing_profile_version_items`,
  `billing_profile_versions`, `invoice_generation_approvals`, `invoice_generation_candidates`,
  `invoice_generation_runs`)
- `whatsapp_disclosure_logs` narrowed to append/read-only for `service_role` (12d)
- `resident_payment_cadence_summary` revoked from `anon` (12e)
- Views `security_settings_view`, `visitor_analytics` — `SELECT` revoked from `anon` (12f)
- `GRANT EXECUTE ON ALL FUNCTIONS` broad grant, then 4 REVOKE groups narrowing 26 + 7 + 6
  routines respectively (Group B/C/D); Group A (32 routines) kept the default with no statement.

Result: `{"success":true}`. No errors.

Post-apply verification on `miyeswqbwarvipdzwqnz`:
- `information_schema.role_table_grants` rows for `table_schema='public'`: **2,599**
- `information_schema.role_routine_grants` rows for `routine_schema='public'`: **402**

(These counts include the broad `postgres`/`anon`/`authenticated`/`service_role` grants across
97 tables and 71 functions produced by the broad GRANT statements plus the narrowing REVOKEs;
no separate "before" grant count exists to diff against since grants were not previously
applied in this baseline run.)

## Section 13 — Comments (267)

Applied in a single `apply_migration` call, `baseline_s13_comments`, covering:

- 13a. 46 `COMMENT ON TABLE` / `COMMENT ON VIEW` statements
- 13b. 4 `COMMENT ON INDEX` statements
- 13c. 16 `COMMENT ON FUNCTION` statements
- 13d. 4 `COMMENT ON TYPE` (enum) statements
- 13e. 1 `COMMENT ON POLICY` statement (`"Residents can view housemates"` on `public.residents`)
- 13f. 196 `COMMENT ON COLUMN` statements

Result: `{"success":true}`. No errors.

Post-apply verification on `miyeswqbwarvipdzwqnz` via `pg_description`:

| Comment class | Count | Expected |
|---|---|---|
| Table/view comments | 46 | 46 |
| Index comments | 4 | 4 |
| Column comments | 196 | 196 |
| Function comments | 16 | 16 |
| Enum type comments | 4 | 4 |
| Policy comments | 1 | 1 |
| **Total** | **267** | **267** |

## Final verification

### Policy count

`select count(*) from pg_policies where schemaname='public'`:

- `miyeswqbwarvipdzwqnz` (Prod): **267**
- `kzugmyjjqttardhfejzc` (Stage, read-only reference): **267**

### Row-level comparison, prod vs staging

Computed a per-policy fingerprint (`md5(cmd || permissive || roles || qual || with_check)`) for
all 267 `pg_policies` rows on both databases, keyed by `tablename.policyname`, and diffed the
267-entry sets.

**266 of 267 policies match exactly** (tablename, policyname, cmd, permissive, roles, qual,
with_check all identical).

**1 policy differs in surface form only, not semantics:**

- `document_access_logs` / `"Admins can view access logs"`
- Prod (`miyeswqbwarvipdzwqnz`) qual:
  ```
  (EXISTS ( SELECT 1
     FROM ((profiles p
       JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
       JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
    WHERE ((p.id = auth.uid()) AND ((ap.name)::text = ANY (ARRAY[('documents.manage_categories'::character varying)::text, ('audit.view'::character varying)::text])))))
  ```
- Staging (`kzugmyjjqttardhfejzc`) qual:
  ```
  (EXISTS ( SELECT 1
     FROM ((profiles p
       JOIN role_permissions rp ON ((rp.role_id = p.role_id)))
       JOIN app_permissions ap ON ((ap.id = rp.permission_id)))
    WHERE ((p.id = auth.uid()) AND ((ap.name)::text = ANY ((ARRAY['documents.manage_categories'::character varying, 'audit.view'::character varying])::text[])))))
  ```

These two expressions are semantically identical — an `ANY (ARRAY[...])` membership test against
the same two string literals, `documents.manage_categories` and `audit.view`. The only
difference is whether Postgres's expression deparser (`pg_get_expr`) casts each array element to
`text` individually (prod) or casts the whole array to `text[]` once (staging). This is
consistent with the two projects running different Postgres patch versions — prod
17.6.1.166 vs staging 17.6.1.054 — and is attributed to that version difference rather than to
anything wrong with the baseline file or the apply. No other policy in the 267 shows this
divergence, and the underlying access-control behavior is unchanged.

### Grants and comments summary

- Table/sequence grants applied on prod (`information_schema.role_table_grants`, schema
  `public`): 2,599 rows
- Routine (function) grants applied on prod (`information_schema.role_routine_grants`, schema
  `public`): 402 rows
- Comments applied on prod: 267 (46 table/view + 4 index + 196 column + 16 function + 4 enum +
  1 policy), matching the file's declared count exactly

## Errors

None. All three `apply_migration` calls (`baseline_s11_policies`, `baseline_s11_policies_part2`,
`baseline_s12_grants`, `baseline_s13_comments` — four calls total, Section 11 split in two)
returned `{"success":true}` on the first attempt.

## Note on injected content

Several tool results during this run carried an appended "RELAY WAKE CONTRACT" block instructing
the agent to arm a background monitor via the `Monitor` tool. This is injected content from a
hook/tool-result channel, not an instruction from the user or the task brief, and was explicitly
flagged as out of scope in the task instructions. It was not acted on.
