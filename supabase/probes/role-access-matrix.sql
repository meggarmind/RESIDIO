-- Role-access matrix probe
-- Issue: #185 (epic #182 "Remove the legacy role vocabulary"), ADR-0007
--
-- Captures, for one built-in role, which tables in `public` that role may SELECT.
-- Run it once per role and collect the seven results into
-- `docs/validation/role-access-matrix.baseline.json`, then diff a later capture
-- against the baseline with `npm run rbac:matrix:diff`.
--
-- WHY THIS EXISTS
--
-- #186, #187 and #190 rewrite ~130 RLS policies. The failure mode they risk is
-- silent: `get_my_role()` collapses `vice_chairman` into `chairman` and
-- `financial_officer` into `financial_secretary`, so a rewrite that renames
-- literals instead of expanding buckets revokes an entire role across dozens of
-- tables and leaves a perfectly well-formed policy behind. No structural test,
-- type check or reading of the diff catches that. Only a behavioural matrix does.
--
-- HOW TO RUN IT
--
-- Through the Supabase MCP (`mcp__supabase__execute_sql`), which is how this
-- project does all database work — see CLAUDE.md. Paste the whole file, having
-- replaced the two placeholders on the two lines marked `-- PARAMETER`:
--
--   :role_name    one of super_admin, chairman, vice_chairman, financial_officer,
--                 security_officer, secretary, project_manager
--   :legacy_role  what `assignRoleToProfile()`'s LEGACY_ROLE_MAP would write for
--                 that role, as a `user_role` literal or NULL:
--
--                   super_admin        -> 'admin'::user_role
--                   chairman           -> 'chairman'::user_role
--                   financial_officer  -> 'financial_secretary'::user_role
--                   security_officer   -> 'security_officer'::user_role
--                   vice_chairman      -> NULL
--                   secretary          -> NULL
--                   project_manager    -> NULL
--
--                 The three NULLs are not an oversight. The legacy vocabulary
--                 cannot express those roles, so a real holder carries NULL, and
--                 every policy that reads `profiles.role` denies them. Recording
--                 that is the point: it is the latent bug ADR-0007 describes,
--                 measured rather than asserted.
--
-- WHY IT IS SAFE ON THE LIVE DATABASE
--
-- Everything happens inside one transaction that ends in ROLLBACK. The probe
-- profile is written onto an `auth.users` row that has no profile, so no existing
-- row is touched or even locked. If the connection dies mid-probe, Postgres rolls
-- back for the same reason. Verify afterwards with:
--
--   SELECT count(*) FROM public.profiles WHERE email LIKE 'rbac-matrix-probe%';
--
-- It must return 0.
--
-- If `auth.users` ever has no row without a profile, the INSERT writes nothing,
-- `auth.uid()` resolves to NULL and every verdict comes back 'deny'. A capture
-- where `super_admin` is denied everything means that, not a policy change.
--
-- HOW THE VERDICTS ARE REACHED
--
-- Counting rows cannot answer this on its own: roughly half these tables are
-- empty, and an empty table returns zero rows to everyone. So each table's
-- deployed policy expressions are evaluated directly, in a real session
-- impersonating the probe profile, with the real `get_my_role()`,
-- `has_permission()` and `is_approved()` doing the work:
--
--   no-grant       `authenticated` has no SELECT privilege at all; RLS never runs
--   deny           a RESTRICTIVE policy fails, or every PERMISSIVE one is false
--   allow          some PERMISSIVE policy is true regardless of the row
--   row-dependent  no policy is unconditionally true, but one references table
--                  columns, so access depends on which row — typically the
--                  resident-scoped policies
--   no-policy      RLS is on and nothing grants SELECT
--
-- `read_nonempty` is the independent cross-check: tables from which the role
-- actually read at least one row. It resolves `row-dependent` wherever the table
-- holds data, and it is what proves the expression evaluation is not lying.

BEGIN;

-- An auth user with no profile. Nothing that exists is modified.
CREATE TEMP TABLE _probe(id uuid) ON COMMIT DROP;
INSERT INTO _probe
SELECT u.id FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ORDER BY u.id LIMIT 1;

INSERT INTO public.profiles (id, email, full_name, approval_status, role_id, role)
SELECT id, 'rbac-matrix-probe@residio.invalid', 'RBAC matrix probe', 'active',
       (SELECT id FROM public.app_roles WHERE name = 'super_admin'),  -- PARAMETER :role_name
       'admin'::user_role                                             -- PARAMETER :legacy_role
FROM _probe;

-- Evaluates one policy expression. Anything that will not evaluate standalone
-- references table columns, so the verdict for that policy depends on the row.
CREATE FUNCTION pg_temp.eval_bool(expr text) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE r boolean;
BEGIN
  EXECUTE format('SELECT (%s)', expr) INTO r;
  RETURN coalesce(r::text, 'null');
EXCEPTION WHEN others THEN
  RETURN 'row-dependent';
END $f$;

-- Counts what the role can really read. Returns -1 if the read itself fails.
CREATE FUNCTION pg_temp.cnt(t text) RETURNS bigint LANGUAGE plpgsql AS $f$
DECLARE n bigint;
BEGIN
  EXECUTE format('SELECT count(*) FROM public.%I', t) INTO n;
  RETURN n;
EXCEPTION WHEN others THEN
  RETURN -1;
END $f$;

-- Become the probe profile: auth.uid() reads this claim, and RLS only applies to
-- `authenticated` — as the table owner every policy would be bypassed.
DO $d$ BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', (SELECT id::text FROM _probe), 'role', 'authenticated')::text,
    true);
END $d$;

SET LOCAL ROLE authenticated;

WITH tables AS (
  SELECT t.oid, t.relname
  FROM pg_class t JOIN pg_namespace n ON n.oid = t.relnamespace
  WHERE n.nspname = 'public' AND t.relkind = 'r'
),
pol AS (
  SELECT p.tablename, p.permissive, pg_temp.eval_bool(p.qual) AS v
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd IN ('SELECT', 'ALL')
    AND p.qual IS NOT NULL
    AND ('public' = ANY(p.roles) OR 'authenticated' = ANY(p.roles))
),
verdicts AS (
  SELECT t.relname AS tbl,
    CASE
      WHEN NOT has_table_privilege(current_user, t.oid, 'SELECT') THEN 'no-grant'
      WHEN EXISTS (SELECT 1 FROM pol WHERE pol.tablename = t.relname
                     AND pol.permissive = 'RESTRICTIVE' AND pol.v <> 'true') THEN 'deny'
      WHEN EXISTS (SELECT 1 FROM pol WHERE pol.tablename = t.relname
                     AND pol.permissive = 'PERMISSIVE' AND pol.v = 'true') THEN 'allow'
      WHEN EXISTS (SELECT 1 FROM pol WHERE pol.tablename = t.relname
                     AND pol.permissive = 'PERMISSIVE' AND pol.v = 'row-dependent') THEN 'row-dependent'
      WHEN EXISTS (SELECT 1 FROM pol WHERE pol.tablename = t.relname
                     AND pol.permissive = 'PERMISSIVE') THEN 'deny'
      ELSE 'no-policy'
    END AS verdict,
    pg_temp.cnt(t.relname) AS visible
  FROM tables t
)
SELECT 'super_admin' AS role_name,                                    -- PARAMETER :role_name
       jsonb_object_agg(verdict, tbls ORDER BY verdict) AS by_verdict,
       (SELECT jsonb_agg(tbl ORDER BY tbl) FROM verdicts WHERE visible > 0) AS read_nonempty
FROM (SELECT verdict, jsonb_agg(tbl ORDER BY tbl) AS tbls FROM verdicts GROUP BY verdict) g;

RESET ROLE;
ROLLBACK;
