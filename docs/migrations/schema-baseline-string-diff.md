# Schema baseline — string-equality verification (issue #279)

Verifies `supabase/baseline/00000000000000_baseline.sql` against the live Supabase database by
exact/semantic text comparison, not just object counts. Object counts (97 tables, 267 policies,
71 app routines, 44 enums, 70 triggers, 214 FKs) were already confirmed in a prior pass; this
pass targets the risk counts cannot catch — a corrupted or truncated string literal inside a
function body or policy predicate, introduced when catalogue output crossed the MCP JSON tool
boundary.

Baseline file compared against: branch `chore/issue-279-schema-baseline`,
`supabase/baseline/00000000000000_baseline.sql` (6209 lines).

Live database queried read-only via `mcp__supabase__execute_sql`. No DDL was executed, nothing
was written to the database.

## Method

For each category, live catalogue definitions were pulled with `pg_get_functiondef` /
`pg_get_triggerdef` / `pg_policies` / `pg_enum`, saved to local scratch files, and diffed
programmatically against the corresponding block extracted from the baseline file with small
Python scripts (kept in `.scratch/`, not committed — throwaway tooling, not part of the
deliverable). Function and trigger bodies are compared **byte-for-byte** after normalizing only
trailing whitespace per line and a trailing newline. Policies are compared **semantically**
(table, policy name, cmd, PERMISSIVE/RESTRICTIVE, roles list, and the `qual`/`with_check`
expression text with only whitespace normalized — no paren restructuring, no literal rewriting)
since the file's policy statements are reconstructed from catalogue columns rather than emitted
verbatim. Enums are compared as ordered label lists.

## 1. Functions — 71 compared, 71 exact match, 0 differing

Query:

```sql
select p.proname, pg_get_functiondef(p.oid) as def
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
order by p.proname;
```

All 71 `public` routines (non-extension-owned) were returned in a single call. Each was matched
by name against a `CREATE OR REPLACE FUNCTION public.<name>(...) ... $function$;` block extracted
from the baseline file (an initial extraction regex undercounted due to closing delimiters that
appear inline as `END; $function$;` rather than on their own line — fixed before drawing any
conclusion). Byte-for-byte comparison after trailing-whitespace normalization: **71/71 exact**,
0 missing on either side.

## 2. Triggers — 70 compared, 70 exact match, 0 differing

Query:

```sql
select t.tgname, pg_get_triggerdef(t.oid) as def
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
order by c.relname, t.tgname;
```

70 non-internal triggers on `public` tables (68 plain `CREATE TRIGGER` + 2
`CREATE CONSTRAINT TRIGGER`, on `app_roles` and `profiles`, both wired to
`assert_active_super_admin_exists()`). Matched by trigger name against the corresponding
`CREATE [CONSTRAINT] TRIGGER ...;` line in the baseline file. Byte-for-byte comparison after
whitespace normalization: **70/70 exact**, 0 missing on either side.

## 3. Policies — 267 compared, 267 exact match (semantic), 0 differing

Query:

```sql
select tablename, policyname, permissive, roles::text as roles, cmd, qual, with_check
from pg_policies
where schemaname='public'
order by tablename, policyname;
```

All 267 policies returned in one call. Each was matched by `(table, policy name)` against a
`CREATE POLICY ... ON public.<table> AS PERMISSIVE|RESTRICTIVE FOR <cmd> TO <roles> USING (...)
WITH CHECK (...);` block parsed out of the baseline file with paren-depth tracking (not a naive
regex), to correctly extract the full `qual`/`with_check` expression text including nested
parentheses.

For every policy, verified: table name, policy name, `cmd`, PERMISSIVE vs RESTRICTIVE, the roles
list (order-independent), and that `qual` and `with_check` — including embedded string literals
such as the role-name arrays (`ARRAY['super_admin'::text, 'chairman'::text, ...]`) used
throughout the RBAC predicates — are present and textually identical modulo whitespace. No
literal, paren, or role name was rewritten to force a match; a genuinely truncated or reordered
array literal would have surfaced as a `using`/`withcheck MISMATCH` line with both live and file
text printed for inspection.

Result: **267/267 exact match**, 0 missing on either side, 0 mismatches in `cmd`, permissive
type, roles, `qual`, or `with_check` — including every `ARRAY[...]` role-literal predicate
checked.

## 4. Enum values — 44 compared, 44 exact match, 0 differing

Query:

```sql
select t.typname, array_agg(e.enumlabel order by e.enumsortorder) as labels
from pg_type t
join pg_namespace n on n.oid = t.typnamespace
join pg_enum e on e.enumtypid = t.oid
where n.nspname = 'public' and t.typtype = 'e'
group by t.typname
order by t.typname;
```

All 44 `public` enum types returned in one call, with labels in their live sort order. Matched
against the baseline file's `CREATE TYPE public.<name> AS ENUM (...)` lines, parsing the quoted
label list in file order. Result: **44/44 exact match** — same label set, same order, for every
enum. No missing or reordered labels.

## Overall summary

| Category | Compared | Exact | Differing |
| --- | --- | --- | --- |
| Functions | 71 | 71 | 0 |
| Triggers | 70 | 70 | 0 |
| Policies | 267 | 267 | 0 |
| Enums | 44 | 44 | 0 |

**452 objects compared, 452 exact matches, 0 differences.**

## Verdict

The baseline file's text is trustworthy. Every function and trigger definition in
`supabase/baseline/00000000000000_baseline.sql` matches the live database byte-for-byte (modulo
trailing whitespace), every policy matches semantically including its full predicate text and
embedded role-literal arrays, and every enum's label list matches in both membership and order.
No truncated or corrupted string literal was found in any function body, trigger definition, or
policy predicate. Combined with the previously-verified object counts, this baseline can be
relied on as an accurate catalogue snapshot.

This check covers functions, triggers, policies, and enums only — it does not re-verify table
DDL, column definitions, or foreign keys, which were already confirmed by the counts cited above
and are not the risk this pass was designed to catch.
