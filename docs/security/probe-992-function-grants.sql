-- Rolled-back probe for #992. NOT executed by the branch author.
-- Run on Residio_Stage BEFORE applying
-- supabase/migrations/20261024091200_contact_detail_functions_require_permission.sql, as the
-- migration owner (postgres), as ONE script. Nothing is committed: the last block always raises,
-- which aborts the whole transaction, and a ROLLBACK follows for clients that keep going.
--
-- 1. Creates two throwaway sign-ups inside the transaction: one left pending approval (what
--    handle_new_user makes) and one approved and linked to a resident with no role (a resident).
-- 2. Calls get_frequent_visitors, get_visitor_history_summary and get_primary_occupier as anon,
--    the pending account, the resident, one active security_officer, one active chairman and
--    service_role, and records "rows N" or "refused <SQLSTATE>".
-- 3. Applies the migration body (paste it at the marker).
-- 4. Calls everything again and compares each result with the expected one.
--
-- Read the final error: it is the report. Every line must start with PASS. "allowed" means the
-- call returned without an error; the row count is shown so a legitimate call can be seen to
-- return data (Stage holds few access_logs, so the visitor counts can be small).

BEGIN;

CREATE TEMP TABLE probe_992_subject (subject text PRIMARY KEY, db_role text NOT NULL, sub uuid);
CREATE TEMP TABLE probe_992 (phase text, subject text, fn text, result text);

-- Fixtures: two sign-ups through the real trigger path (on_auth_user_created -> handle_new_user).
DO $fixtures$
DECLARE
  v_pending uuid := gen_random_uuid();
  v_resident uuid := gen_random_uuid();
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, created_at, updated_at)
  VALUES
    (v_pending, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'probe-992-pending@example.invalid', '{}'::jsonb, now(), now()),
    (v_resident, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
     'probe-992-resident@example.invalid', '{}'::jsonb, now(), now());

  UPDATE public.profiles
     SET approval_status = 'active',
         resident_id = (SELECT r.id FROM public.residents r
                         WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.resident_id = r.id)
                         LIMIT 1)
   WHERE id = v_resident;

  INSERT INTO probe_992_subject VALUES
    ('anon', 'anon', NULL),
    ('pending', 'authenticated', v_pending),
    ('resident', 'authenticated', v_resident),
    ('service_role', 'service_role', NULL);

  INSERT INTO probe_992_subject
  SELECT DISTINCT ON (r.name) r.name, 'authenticated', p.id
    FROM public.profiles p JOIN public.app_roles r ON r.id = p.role_id
   WHERE p.approval_status = 'active' AND r.name IN ('security_officer', 'chairman')
   ORDER BY r.name, p.created_at;
END
$fixtures$;

CREATE FUNCTION pg_temp.probe_992(p_phase text) RETURNS void LANGUAGE plpgsql AS $probe$
DECLARE
  v_contact uuid := (SELECT contact_id FROM public.access_logs WHERE contact_id IS NOT NULL
                      ORDER BY check_in_time DESC LIMIT 1);
  v_house uuid := (SELECT house_id FROM public.resident_houses
                    WHERE is_active AND resident_role IN ('resident_landlord', 'tenant') LIMIT 1);
  s record; f text; n bigint; res text;
BEGIN
  FOR s IN SELECT * FROM probe_992_subject LOOP
    FOREACH f IN ARRAY ARRAY['get_frequent_visitors', 'get_visitor_history_summary', 'get_primary_occupier'] LOOP
      BEGIN
        PERFORM set_config('request.jwt.claims',
          CASE WHEN s.sub IS NULL THEN json_build_object('role', s.db_role)
               ELSE json_build_object('role', s.db_role, 'sub', s.sub) END::text, true);
        EXECUTE format('SET LOCAL ROLE %I', s.db_role);
        IF f = 'get_frequent_visitors' THEN
          SELECT count(*) INTO n FROM public.get_frequent_visitors(1, 3650, 50);
        ELSIF f = 'get_visitor_history_summary' THEN
          SELECT count(*) INTO n FROM public.get_visitor_history_summary(v_contact, 3650);
        ELSE
          SELECT count(*) INTO n FROM public.get_primary_occupier(v_house);
        END IF;
        RAISE EXCEPTION USING ERRCODE = 'P0992', MESSAGE = n::text; -- undo the role and claims
      EXCEPTION
        WHEN SQLSTATE 'P0992' THEN res := 'rows ' || SQLERRM;
        WHEN OTHERS THEN res := 'refused ' || SQLSTATE;
      END;
      RESET ROLE;
      INSERT INTO probe_992 VALUES (p_phase, s.subject, f, res);
    END LOOP;
  END LOOP;
END
$probe$;

SELECT pg_temp.probe_992('before');

-- ===== paste the migration body here (the whole file) =====

SELECT pg_temp.probe_992('after');

-- Report. Expected after the migration:
--   anon, pending, resident: every call refused (42501).
--   security_officer, chairman: both visitor functions allowed; get_primary_occupier refused.
--   service_role: get_primary_occupier allowed; both visitor functions refused.
DO $report$
DECLARE
  v_report text;
  v_subjects int := (SELECT count(*) FROM probe_992_subject);
BEGIN
  SELECT string_agg(
           CASE WHEN (e.expected = 'refused' AND a.result = 'refused 42501')
                  OR (e.expected = 'allowed' AND a.result LIKE 'rows %')
                THEN 'PASS ' ELSE 'FAIL ' END
           || a.subject || ' ' || a.fn || ': expected ' || e.expected
           || ', before=' || b.result || ', after=' || a.result,
           E'\n' ORDER BY a.subject, a.fn)
    INTO v_report
    FROM probe_992 a
    JOIN probe_992 b ON b.phase = 'before' AND b.subject = a.subject AND b.fn = a.fn
    CROSS JOIN LATERAL (SELECT CASE
             WHEN a.subject IN ('security_officer', 'chairman') AND a.fn <> 'get_primary_occupier' THEN 'allowed'
             WHEN a.subject = 'service_role' AND a.fn = 'get_primary_occupier' THEN 'allowed'
             ELSE 'refused' END AS expected) e
   WHERE a.phase = 'after';

  IF v_subjects <> 6 THEN
    v_report := 'FAIL fixtures: expected 6 subjects, found ' || v_subjects
                || ' (an active security_officer and chairman profile must exist)' || E'\n' || v_report;
  END IF;

  RAISE EXCEPTION E'probe 992 report (rolled back)\n%', v_report;
END
$report$;

ROLLBACK;
