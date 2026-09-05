-- get_my_role_name() behavioural probe
-- Issue: #189 (epic #182 "Remove the legacy role vocabulary"), ADR-0007
--
-- Captures how `public.get_my_role_name()` actually behaves, and how its
-- hardening attributes compare to `public.get_my_role()`, before #190 makes 36
-- tables and 97 RLS policies depend on it simultaneously.
--
-- WHY THIS EXISTS
--
-- `get_my_role_name()` has zero callers today. #190 is about to retarget all 97
-- role-bucket policies (see `role-access-matrix.sql`) from `get_my_role()` onto
-- it at once. Its failure mode is silent denial: a policy that reads
-- `get_my_role_name() = ANY(ARRAY[...])` and gets NULL back simply denies,
-- indistinguishable from a correctly-denied role unless someone already knows
-- what NULL means for this function. This probe pins that meaning down —
-- exhaustively, for every built-in role, a custom role, and every reason the
-- function can return NULL — so #190 is retargeting onto measured behaviour,
-- not assumed behaviour.
--
-- It also settles the comparison that matters most: `get_my_role()` collapses
-- `vice_chairman` into `chairman` and `financial_officer` into
-- `financial_secretary` (the "bucket collapse" hazard `role-access-matrix.sql`
-- documents). `get_my_role_name()` does not — it returns the RBAC role's own
-- name. That is the entire reason #190 retargets onto it. But the same
-- divergence cuts the other way too: `project_manager`, `secretary` and
-- `resident` return NULL under the legacy function (the legacy enum cannot
-- express them) and their own name under the new one. A policy shaped
-- `get_my_role() IS NOT NULL` would *widen* access the moment it is retargeted.
-- No live policy is shaped that way today: measured 2026-09-05 against
-- pg_policies, 81 of the 97 use `= ANY(ARRAY[...])` and 16 use `= 'literal'`,
-- zero use `IS NULL`/`IS NOT NULL`. Re-derive with:
--
--   SELECT count(*) FILTER (WHERE pred ~ 'get_my_role\(\)\s*=\s*ANY')      AS uses_in_any,
--          count(*) FILTER (WHERE pred ~ 'get_my_role\(\)\s*=\s*''')        AS uses_equals_literal,
--          count(*) FILTER (WHERE pred ~ 'get_my_role\(\)\s+IS\s+NOT\s+NULL') AS uses_is_not_null,
--          count(*) FILTER (WHERE pred ~ 'get_my_role\(\)\s+IS\s+NULL')       AS uses_is_null
--   FROM (SELECT coalesce(qual,'')||' '||coalesce(with_check,'') AS pred
--           FROM pg_policies
--          WHERE schemaname='public'
--            AND (coalesce(qual,'')||' '||coalesce(with_check,'')) ~ 'get_my_role\(\)') p;
--
-- This probe records the difference so a future policy cannot introduce that
-- hazard unnoticed.
--
-- HOW TO RUN IT
--
-- Through the Supabase MCP (`mcp__supabase__execute_sql`) — see CLAUDE.md.
-- Paste the whole file, having replaced the one placeholder marked
-- `-- PARAMETER`:
--
--   v_pid   the id of an existing, non-super_admin profile that can be driven
--           into `active` approval status. It must NOT be a super_admin: #184's
--           `assert_active_super_admin_exists` invariant trigger fires if the
--           only active super_admin's status or role is changed away from
--           super_admin mid-transaction, and this probe cycles the profile
--           through every built-in role including several non-super_admin ones.
--
-- WHY IT IS SAFE ON THE LIVE DATABASE
--
-- The whole probe runs inside `BEGIN ... ROLLBACK`. It mutates the chosen
-- profile's `role_id` and `approval_status` repeatedly, but nothing survives
-- the ROLLBACK — the row is back to its original values the instant the
-- transaction ends, including if the connection drops mid-probe. The one
-- side-effecting DDL (`INSERT INTO app_roles ... probe_custom_role`) is rolled
-- back the same way. Verify afterwards with:
--
--   SELECT count(*) FROM public.app_roles WHERE name = 'probe_custom_role';
--
-- It must return 0.

BEGIN;

CREATE TEMP TABLE probe(ord int, case_name text, expected text, actual text);

DO $$
DECLARE
  v_pid uuid := '00000000-0000-0000-0000-000000000000';  -- PARAMETER: a non-super_admin, active profile id
  v_role record;
  v_custom uuid;
  v_n int := 0;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_pid)::text, true);
  UPDATE profiles SET approval_status = 'active' WHERE id = v_pid;

  -- 1-8: every built-in role, plus whatever custom roles already exist,
  -- ordered by name for a stable, reviewable diff.
  FOR v_role IN SELECT id, name FROM app_roles ORDER BY name LOOP
    v_n := v_n + 1;
    UPDATE profiles SET role_id = v_role.id WHERE id = v_pid;
    INSERT INTO probe
    VALUES (v_n, 'role = ' || v_role.name, v_role.name, coalesce(public.get_my_role_name(), '<NULL>'));
  END LOOP;

  -- 90: a role name get_my_role_name() cannot have special-cased, because it
  -- did not exist when the function was written.
  INSERT INTO app_roles (name, display_name, is_active)
  VALUES ('probe_custom_role', 'Probe Custom Role', true)
  RETURNING id INTO v_custom;
  UPDATE profiles SET role_id = v_custom WHERE id = v_pid;
  INSERT INTO probe
  VALUES (90, 'custom (non-built-in) role', 'probe_custom_role', coalesce(public.get_my_role_name(), '<NULL>'));

  -- 91-92: the two ways an account can hold a valid role_id and still be
  -- denied a role name, because approval_status gates the lookup.
  UPDATE profiles SET role_id = (SELECT id FROM app_roles WHERE name = 'chairman'), approval_status = 'pending' WHERE id = v_pid;
  INSERT INTO probe
  VALUES (91, 'approval_status = pending', '<NULL>', coalesce(public.get_my_role_name(), '<NULL>'));

  UPDATE profiles SET approval_status = 'suspended' WHERE id = v_pid;
  INSERT INTO probe
  VALUES (92, 'approval_status = suspended', '<NULL>', coalesce(public.get_my_role_name(), '<NULL>'));

  -- 93: active, but nothing to join to app_roles.
  UPDATE profiles SET approval_status = 'active', role_id = NULL WHERE id = v_pid;
  INSERT INTO probe
  VALUES (93, 'role_id IS NULL', '<NULL>', coalesce(public.get_my_role_name(), '<NULL>'));

  -- 94: no impersonation claim at all -- auth.uid() resolves to NULL, same as
  -- an anonymous request.
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO probe
  VALUES (94, 'no auth.uid() (anon)', '<NULL>', coalesce(public.get_my_role_name(), '<NULL>'));
END $$;

SELECT case_name, expected, actual, (expected = actual) AS pass FROM probe ORDER BY ord;

-- Hardening attributes for both functions, read directly from pg_proc so the
-- comparison in ADR-0007/#189 ("byte-identical in hardening") is measured
-- rather than asserted. `provolatile = 's'` is STABLE; prosecdef is
-- SECURITY DEFINER; proconfig carries the pinned search_path; prorettype's
-- name is the declared return type.
SELECT
  p.proname,
  p.prosecdef,
  p.provolatile,
  p.proconfig,
  format_type(p.prorettype, NULL) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_my_role', 'get_my_role_name')
ORDER BY p.proname;

ROLLBACK;
