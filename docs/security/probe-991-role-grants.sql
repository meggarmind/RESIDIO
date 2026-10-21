-- Rolled-back probe for #991 (who may grant or take away a role, enforced on profiles).
-- NOT executed by the branch author. Run on Residio_Stage as the migration owner, in ONE
-- transaction, either after applying 20261023110000_profile_role_grant_rules.sql or with its body
-- pasted at the marker below. It ends in ROLLBACK, so nothing is committed.
--
-- The probe makes its own accounts (auth.users rows, so the sign-up trigger creates each profile)
-- and links the officer roles that need a resident to active residents that have no account. It
-- then attempts each write as a given caller and records the outcome:
--   api = true   as the Data API role `authenticated`, with RLS and column grants in force;
--   api = false  as the owner with the caller's JWT, which is what a SECURITY DEFINER function
--                writing profiles on that caller's behalf looks like to the trigger;
--   sub = NULL   no JWT at all: service_role, cron and migrations.
-- A refusal the probe expects is undone by its own error; an unexpected success is undone too, so
-- each attempt starts from the same state.
--
-- Read the results: the SELECT near the end (psql), or the error the last block raises on purpose
-- (any client), which repeats every row. Every check must pass. expected is 'ok' or the text of the
-- refusal the database must give.

BEGIN;

-- ===== paste the migration body here if it is not applied (between its BEGIN; and COMMIT;) =====

CREATE TEMP TABLE probe_991 (n serial, check_name text, expected text, result text, pass boolean);
CREATE TEMP TABLE probe_991_ids (name text PRIMARY KEY, id uuid NOT NULL);

CREATE FUNCTION pg_temp.probe_991_id(p_name text) RETURNS uuid LANGUAGE sql AS
$$ SELECT id FROM probe_991_ids WHERE name = p_name $$;

-- Runs p_sql as the caller p_sub (NULL = no JWT), through the API role when p_api, and records it.
CREATE FUNCTION pg_temp.probe_991_try(p_check text, p_sub uuid, p_api boolean, p_sql text, p_expect text)
RETURNS void LANGUAGE plpgsql AS $probe$
DECLARE
  v_n bigint;
  v_result text;
BEGIN
  BEGIN
    PERFORM set_config('request.jwt.claims', CASE WHEN p_sub IS NULL THEN ''
      ELSE json_build_object('role', 'authenticated', 'sub', p_sub)::text END, true);
    IF p_api THEN
      SET LOCAL ROLE authenticated;
    END IF;
    EXECUTE p_sql;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF p_expect <> 'ok' THEN
      RAISE EXCEPTION USING ERRCODE = 'P0991', MESSAGE = format('accepted (%s row(s))', v_n);
    END IF;
    v_result := CASE WHEN v_n = 1 THEN 'ok' ELSE format('ok but %s row(s)', v_n) END;
  EXCEPTION
    WHEN SQLSTATE 'P0991' THEN v_result := SQLERRM;
    WHEN insufficient_privilege THEN v_result := 'refused: ' || SQLERRM;
    WHEN OTHERS THEN v_result := format('error %s: %s', SQLSTATE, SQLERRM);
  END;
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
  INSERT INTO probe_991 (check_name, expected, result, pass)
  VALUES (p_check, p_expect, v_result,
          CASE WHEN p_expect = 'ok' THEN v_result = 'ok'
               ELSE v_result LIKE 'refused: %' || p_expect || '%' END);
END
$probe$;

DO $setup$
DECLARE
  v_name text;
  v_role text;
  v_id uuid;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger
                  WHERE tgname = 'profiles_enforce_role_rules'
                    AND tgrelid = 'public.profiles'::regclass
                    AND (tgtype & 8) <> 0) THEN           -- 8 = fires on DELETE
    RAISE EXCEPTION 'probe 991 setup: apply 20261023110000_profile_role_grant_rules.sql or paste its body at the marker';
  END IF;

  FOREACH v_role IN ARRAY ARRAY['super_admin', 'chairman', 'trustee', 'secretary', 'security_guard_supervisor'] LOOP
    SELECT id INTO v_id FROM public.app_roles WHERE name = v_role;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'probe 991 setup: role % not found', v_role;
    END IF;
    INSERT INTO probe_991_ids VALUES ('role:' || v_role, v_id);
  END LOOP;

  -- One active resident with no account for each officer that needs a resident link.
  INSERT INTO probe_991_ids
  SELECT 'resident:' || x.name, x.id
    FROM unnest(ARRAY['chair', 'peer_chair', 'trustee', 'secretary']) WITH ORDINALITY AS x0(name, n)
    JOIN LATERAL (
      SELECT x0.name, r.id FROM public.residents r
       WHERE r.account_status = 'active'
         AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.resident_id = r.id)
       ORDER BY r.id OFFSET x0.n - 1 LIMIT 1) x ON true;
  IF (SELECT count(*) FROM probe_991_ids WHERE name LIKE 'resident:%') < 4 THEN
    RAISE EXCEPTION 'probe 991 setup: needs four active residents with no linked account';
  END IF;

  -- Accounts, created the way sign-up creates them (the trigger on auth.users writes the profile).
  FOREACH v_name IN ARRAY ARRAY['chair', 'peer_chair', 'super_admin', 'trustee', 'secretary', 'target', 'plain'] LOOP
    v_id := gen_random_uuid();
    INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
    VALUES (v_id, format('probe-991-%s-%s@residio.test', v_name, left(v_id::text, 8)),
            'authenticated', 'authenticated', '{}'::jsonb);
    INSERT INTO probe_991_ids VALUES (v_name, v_id);
  END LOOP;
END
$setup$;

-- S. Sign-up and the callers with no JWT keep working.
INSERT INTO probe_991 (check_name, expected, result, pass)
SELECT 'S1 sign-up creates a pending profile with no role', 'ok',
       CASE WHEN count(*) = 7 THEN 'ok' ELSE format('%s of 7 profiles as expected', count(*)) END,
       count(*) = 7
  FROM public.profiles p JOIN probe_991_ids i ON i.id = p.id
 WHERE p.role_id IS NULL AND p.approval_status = 'pending';

SELECT pg_temp.probe_991_try('S2 no JWT (service role, migration) grants chairman', NULL, false,
  format('UPDATE public.profiles SET role_id = %L, resident_id = %L, approval_status = %L WHERE id = %L',
         pg_temp.probe_991_id('role:chairman'), pg_temp.probe_991_id('resident:chair'), 'active', pg_temp.probe_991_id('chair')), 'ok');
SELECT pg_temp.probe_991_try('S3 no JWT grants chairman to a second account', NULL, false,
  format('UPDATE public.profiles SET role_id = %L, resident_id = %L, approval_status = %L WHERE id = %L',
         pg_temp.probe_991_id('role:chairman'), pg_temp.probe_991_id('resident:peer_chair'), 'active', pg_temp.probe_991_id('peer_chair')), 'ok');
SELECT pg_temp.probe_991_try('S4 no JWT grants super_admin', NULL, false,
  format('UPDATE public.profiles SET role_id = %L, approval_status = %L WHERE id = %L',
         pg_temp.probe_991_id('role:super_admin'), 'active', pg_temp.probe_991_id('super_admin')), 'ok');
SELECT pg_temp.probe_991_try('S5 no JWT grants trustee', NULL, false,
  format('UPDATE public.profiles SET role_id = %L, resident_id = %L, approval_status = %L WHERE id = %L',
         pg_temp.probe_991_id('role:trustee'), pg_temp.probe_991_id('resident:trustee'), 'active', pg_temp.probe_991_id('trustee')), 'ok');
SELECT pg_temp.probe_991_try('S6 no JWT grants secretary', NULL, false,
  format('UPDATE public.profiles SET role_id = %L, resident_id = %L, approval_status = %L WHERE id = %L',
         pg_temp.probe_991_id('role:secretary'), pg_temp.probe_991_id('resident:secretary'), 'active', pg_temp.probe_991_id('secretary')), 'ok');

-- P. The permissions the rest relies on.
INSERT INTO probe_991 (check_name, expected, result, pass)
SELECT 'P1 chairman holds system.assign_roles but not system.assign_board_roles; super_admin holds both',
       'ok', format('chairman %s/%s, super_admin %s/%s', c_roles, c_board, s_roles, s_board),
       c_roles AND NOT c_board AND s_roles AND s_board
  FROM (SELECT
          bool_or(r.name = 'chairman' AND ap.name = 'system.assign_roles') AS c_roles,
          bool_or(r.name = 'chairman' AND ap.name = 'system.assign_board_roles') AS c_board,
          bool_or(r.name = 'super_admin' AND ap.name = 'system.assign_roles') AS s_roles,
          bool_or(r.name = 'super_admin' AND ap.name = 'system.assign_board_roles') AS s_board
          FROM public.app_roles r
          JOIN public.role_permissions rp ON rp.role_id = r.id
          JOIN public.app_permissions ap ON ap.id = rp.permission_id AND ap.is_active) x;

-- C. A chairman (system.assign_roles only).
SELECT pg_temp.probe_991_try('C1 chairman deletes an account with no role', pg_temp.probe_991_id('chair'), true,
  format('DELETE FROM public.profiles WHERE id = %L', pg_temp.probe_991_id('target')), 'ok');
SELECT pg_temp.probe_991_try('C2 chairman inserts that account back as super_admin', pg_temp.probe_991_id('chair'), true,
  format('INSERT INTO public.profiles (id, email, full_name, role_id, approval_status) VALUES (%L, %L, %L, %L, %L)',
         pg_temp.probe_991_id('target'), 'probe-991-target@residio.test', 'Probe 991', pg_temp.probe_991_id('role:super_admin'), 'active'),
  'permission to assign this role');
SELECT pg_temp.probe_991_try('C3 chairman inserts that account back as chairman', pg_temp.probe_991_id('chair'), true,
  format('INSERT INTO public.profiles (id, email, full_name, role_id, resident_id, approval_status) VALUES (%L, %L, %L, %L, %L, %L)',
         pg_temp.probe_991_id('target'), 'probe-991-target@residio.test', 'Probe 991', pg_temp.probe_991_id('role:chairman'),
         pg_temp.probe_991_id('resident:chair'), 'active'),
  'permission to assign this role');
SELECT pg_temp.probe_991_try('C4 chairman inserts that account back as trustee', pg_temp.probe_991_id('chair'), true,
  format('INSERT INTO public.profiles (id, email, full_name, role_id, resident_id, approval_status) VALUES (%L, %L, %L, %L, %L, %L)',
         pg_temp.probe_991_id('target'), 'probe-991-target@residio.test', 'Probe 991', pg_temp.probe_991_id('role:trustee'),
         pg_temp.probe_991_id('resident:chair'), 'active'),
  'permission to assign this role');
SELECT pg_temp.probe_991_try('C5 chairman inserts that account back with no role', pg_temp.probe_991_id('chair'), true,
  format('INSERT INTO public.profiles (id, email, full_name, approval_status) VALUES (%L, %L, %L, %L)',
         pg_temp.probe_991_id('target'), 'probe-991-target@residio.test', 'Probe 991', 'pending'), 'ok');
SELECT pg_temp.probe_991_try('C6 chairman updates role_id through the API (column grant)', pg_temp.probe_991_id('chair'), true,
  format('UPDATE public.profiles SET role_id = %L WHERE id = %L', pg_temp.probe_991_id('role:super_admin'), pg_temp.probe_991_id('target')),
  'permission denied');
SELECT pg_temp.probe_991_try('C7 chairman, through a function, updates the re-inserted account to super_admin', pg_temp.probe_991_id('chair'), false,
  format('UPDATE public.profiles SET role_id = %L WHERE id = %L', pg_temp.probe_991_id('role:super_admin'), pg_temp.probe_991_id('target')),
  'permission to assign this role');
SELECT pg_temp.probe_991_try('C8 chairman, through a function, gives the trustee role', pg_temp.probe_991_id('chair'), false,
  format('UPDATE public.profiles SET role_id = %L, resident_id = %L WHERE id = %L',
         pg_temp.probe_991_id('role:trustee'), pg_temp.probe_991_id('resident:chair'), pg_temp.probe_991_id('target')),
  'permission to assign this role');
SELECT pg_temp.probe_991_try('C9 chairman, through a function, gives a non-board role', pg_temp.probe_991_id('chair'), false,
  format('UPDATE public.profiles SET role_id = %L WHERE id = %L', pg_temp.probe_991_id('role:security_guard_supervisor'), pg_temp.probe_991_id('target')),
  'ok');
SELECT pg_temp.probe_991_try('C10 chairman deletes a non-board account', pg_temp.probe_991_id('chair'), true,
  format('DELETE FROM public.profiles WHERE id = %L', pg_temp.probe_991_id('target')), 'ok');
SELECT pg_temp.probe_991_try('C11 chairman inserts an account with a non-board role', pg_temp.probe_991_id('chair'), true,
  format('INSERT INTO public.profiles (id, email, full_name, role_id, approval_status) VALUES (%L, %L, %L, %L, %L)',
         pg_temp.probe_991_id('target'), 'probe-991-target@residio.test', 'Probe 991',
         pg_temp.probe_991_id('role:security_guard_supervisor'), 'active'), 'ok');
SELECT pg_temp.probe_991_try('C12 chairman deletes a super_admin account', pg_temp.probe_991_id('chair'), true,
  format('DELETE FROM public.profiles WHERE id = %L', pg_temp.probe_991_id('super_admin')),
  'permission to change this account');
SELECT pg_temp.probe_991_try('C13 chairman deletes another chairman account', pg_temp.probe_991_id('chair'), true,
  format('DELETE FROM public.profiles WHERE id = %L', pg_temp.probe_991_id('peer_chair')),
  'permission to change this account');
SELECT pg_temp.probe_991_try('C14 chairman, through a function, changes a super_admin to a non-board role', pg_temp.probe_991_id('chair'), false,
  format('UPDATE public.profiles SET role_id = %L WHERE id = %L', pg_temp.probe_991_id('role:security_guard_supervisor'), pg_temp.probe_991_id('super_admin')),
  'permission to change this account');
SELECT pg_temp.probe_991_try('C15 chairman, through a function, removes another chairman''s role', pg_temp.probe_991_id('chair'), false,
  format('UPDATE public.profiles SET role_id = NULL WHERE id = %L', pg_temp.probe_991_id('peer_chair')),
  'permission to change this account');
SELECT pg_temp.probe_991_try('C16 chairman, through a function, removes a trustee''s role (may manage, not appoint)', pg_temp.probe_991_id('chair'), false,
  format('UPDATE public.profiles SET role_id = NULL WHERE id = %L', pg_temp.probe_991_id('trustee')), 'ok');

-- A. A super_admin (both permissions).
SELECT pg_temp.probe_991_try('A1 super_admin deletes a non-board account', pg_temp.probe_991_id('super_admin'), true,
  format('DELETE FROM public.profiles WHERE id = %L', pg_temp.probe_991_id('target')), 'ok');
SELECT pg_temp.probe_991_try('A2 super_admin inserts an account as super_admin', pg_temp.probe_991_id('super_admin'), true,
  format('INSERT INTO public.profiles (id, email, full_name, role_id, approval_status) VALUES (%L, %L, %L, %L, %L)',
         pg_temp.probe_991_id('target'), 'probe-991-target@residio.test', 'Probe 991', pg_temp.probe_991_id('role:super_admin'), 'active'), 'ok');
SELECT pg_temp.probe_991_try('A3 super_admin, through a function, changes a chairman to trustee', pg_temp.probe_991_id('super_admin'), false,
  format('UPDATE public.profiles SET role_id = %L WHERE id = %L', pg_temp.probe_991_id('role:trustee'), pg_temp.probe_991_id('peer_chair')), 'ok');
SELECT pg_temp.probe_991_try('A4 super_admin deletes a super_admin account', pg_temp.probe_991_id('super_admin'), true,
  format('DELETE FROM public.profiles WHERE id = %L', pg_temp.probe_991_id('target')), 'ok');

-- N. Removal by another trigger stays automatic; a direct removal does not.
SELECT pg_temp.probe_991_try('N1 caller with no role permission removes a role directly', pg_temp.probe_991_id('plain'), false,
  format('UPDATE public.profiles SET role_id = NULL WHERE id = %L', pg_temp.probe_991_id('secretary')),
  'permission to change this account');
SELECT pg_temp.probe_991_try('N2 same caller makes the linked resident inactive (role removed by trigger)', pg_temp.probe_991_id('plain'), false,
  format('UPDATE public.residents SET account_status = %L WHERE id = %L', 'inactive', pg_temp.probe_991_id('resident:secretary')), 'ok');
INSERT INTO probe_991 (check_name, expected, result, pass)
SELECT 'N3 the secretary role was removed by N2', 'ok',
       CASE WHEN p.role_id IS NULL THEN 'ok' ELSE 'role kept' END, p.role_id IS NULL
  FROM public.profiles p WHERE p.id = pg_temp.probe_991_id('secretary');

SELECT n, check_name, expected, result, pass FROM probe_991 ORDER BY n;

-- Ends in an error on purpose, so no client can commit the probe; the message repeats the results.
DO $report$
BEGIN
  RAISE EXCEPTION USING ERRCODE = 'P0991', MESSAGE = (
    SELECT format('probe 991 rolled back: %s of %s checks pass', count(*) FILTER (WHERE pass), count(*))
           || E'\n'
           || string_agg(format('%s %s | %s | expected: %s | got: %s',
                                CASE WHEN pass THEN 'PASS' ELSE 'FAIL' END, n, check_name, expected, result),
                         E'\n' ORDER BY n)
      FROM probe_991);
END
$report$;

ROLLBACK;
