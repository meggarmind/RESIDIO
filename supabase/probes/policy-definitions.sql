-- Policy-definition probe
-- Issue: #228 (extends the #185 role-access-matrix pattern)
--
-- PURPOSE
--
-- One text row per RLS policy in schema `public`: table, policy, command,
-- permissive/restrictive, roles, and a 12-char md5 of the deparsed USING and
-- WITH CHECK expressions. Diffing a fresh capture against
-- `docs/validation/policy-definitions.baseline.json` detects a policy edited,
-- added or dropped outside a reviewed migration (policy divergence between
-- environments or over time).
--
-- HOW TO RUN IT
--
-- Through the Supabase MCP `execute_sql` against the target project (Stage or
-- Prod). It is a single read-only SELECT: nothing is written, no transaction needed.
--
-- CAVEAT
--
-- The hashes are of Postgres's DEPARSED expression text (pg_policies.qual /
-- with_check), so they are only comparable across the same Postgres major
-- version. Baseline was captured on Postgres 17. A major upgrade will change
-- hashes without any policy changing; re-capture the baseline in that case.
--
-- HOW TO CAPTURE THE OUTPUT
--
-- Save the `row` values, one per line, to a file (or save the MCP JSON result
-- as is), then:
--
--   npm run rbac:policies:diff -- capture.txt
--
-- Exit 0 = identical to the baseline, 1 = diverged, 2 = bad input.

select format('%s|%s|%s|%s|%s|%s|%s',
         tablename,
         policyname,
         cmd,
         permissive,
         array_to_string(roles, ','),
         left(md5(coalesce(qual, '')), 12),
         left(md5(coalesce(with_check, '')), 12)) as row
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
