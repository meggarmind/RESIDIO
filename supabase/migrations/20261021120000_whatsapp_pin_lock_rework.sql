-- Rework the WhatsApp PIN lock to the owner's spec (#891, slice B of #805). Replaces the
-- 5-wrong / 24-hour lock from 20261020120000_whatsapp_pin_lockout.sql (#850, #855).
--
-- WHAT CHANGES
--   1. ADD COLUMN public.residents.whatsapp_pin_failed_at TIMESTAMPTZ[] NOT NULL DEFAULT '{}'
--      (wrong tries within the last 24 hours) and public.residents.whatsapp_pin_hard_locked_at
--      TIMESTAMPTZ (set by the 6th wrong try in 24 hours; only an estate office reset clears it).
--      whatsapp_pin_failed_attempts now means wrong tries IN A ROW; whatsapp_pin_locked_until is
--      the 15-minute lock.
--   2. CREATE OR REPLACE FUNCTION public.claim_whatsapp_pin_try(p_resident_id uuid,
--        p_soft_limit integer DEFAULT 3, p_soft_lock_minutes integer DEFAULT 15,
--        p_hard_limit integer DEFAULT 6, p_window_hours integer DEFAULT 24)
--      RETURNS TABLE (status text, tries_in_a_row integer, tries_in_window integer,
--        locked_until timestamptz, hard_locked boolean, claimed_at timestamptz).
--      Counts a PIN try as wrong BEFORE the PIN is checked, under a row lock:
--        - hard locked: returns status 'hard_locked' and changes nothing (no expiry);
--        - inside the 15-minute lock: returns status 'locked' with locked_until, changes nothing;
--        - otherwise: status 'counted'. The in-a-row count goes up by one (restarting at 1 after
--          an expired 15-minute lock), the try is added to the 24-hour window, the 3rd in a row
--          sets the 15-minute lock and the 6th in the window sets the hard lock.
--   3. CREATE OR REPLACE FUNCTION public.clear_whatsapp_pin_try(p_resident_id uuid,
--        p_claimed_at timestamptz) RETURNS void. Called after a CORRECT PIN: resets the in-a-row
--      count and the 15-minute lock, and takes the claimed try back out of the 24-hour window. A
--      hard lock is lifted only when this same try set it; one set by another try stays.
--   4. DROP FUNCTION public.claim_whatsapp_pin_attempt(uuid, integer, integer).
--   5. REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role.
--
-- WHY
--   Owner decision ("Harmonised" comment on #805, 2026-10-20): 3 wrong in a row locks for 15
--   minutes; 6 wrong within 24 hours locks until the estate office resets it; a correct PIN resets
--   the in-a-row count. The flat 24-hour lock gave a guesser 5 tries a day indefinitely and never
--   escalated to the estate office. Counting before checking (row lock via SELECT ... FOR UPDATE)
--   means concurrent guesses cannot all be checked before a lock lands.
--
-- WHO IS AFFECTED
--   Residents using WhatsApp financial answers with a PIN set. A resident already inside a 24-hour
--   lock from the old function stays locked until that time (it is read as the 15-minute lock) or
--   until Reset PIN; their old count of up to 5 is read as the in-a-row count and restarts at 1 when
--   that lock ends. Their earlier wrong tries are not in the new 24-hour window. Reset PIN (#890)
--   clears both new columns. The new residents columns are not self-service (the #728 trigger is
--   an allowlist). Both functions are SECURITY INVOKER and only service_role (the webhook's admin
--   client) can execute them.
--
-- DEPLOY ORDER: apply together with the application code. The old code calls
--   claim_whatsapp_pin_attempt and the new code calls claim_whatsapp_pin_try; whichever is missing
--   fails closed (no PIN check succeeds) until the other side lands.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; CREATE OR REPLACE; DROP FUNCTION IF EXISTS; REVOKE/GRANT
--   are repeatable.
--
-- ROLLBACK (loses the 24-hour window and any hard locks):
--   Roll the application code back first, then:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.claim_whatsapp_pin_try(uuid, integer, integer, integer, integer);
--   DROP FUNCTION IF EXISTS public.clear_whatsapp_pin_try(uuid, timestamptz);
--   ALTER TABLE public.residents DROP COLUMN IF EXISTS whatsapp_pin_failed_at,
--     DROP COLUMN IF EXISTS whatsapp_pin_hard_locked_at;
--   -- then re-run the CREATE OR REPLACE FUNCTION public.claim_whatsapp_pin_attempt block and its
--   -- REVOKE/GRANT from 20261020120000_whatsapp_pin_lockout.sql, verbatim.
--   COMMIT;
--
-- VERIFY (run on the database after applying):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'residents'
--      AND column_name IN ('whatsapp_pin_failed_at', 'whatsapp_pin_hard_locked_at');
--     -- expect 2 rows: ARRAY NO '{}'::timestamp with time zone[]; timestamp with time zone YES null
--   SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated,
--          has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public'
--      AND p.proname IN ('claim_whatsapp_pin_try', 'clear_whatsapp_pin_try', 'claim_whatsapp_pin_attempt');
--     -- expect 2 rows (no claim_whatsapp_pin_attempt), each false, false, true
--
--   Lock probe (both thresholds, the window, no auto-unlock, correct-PIN clearing; changes
--   nothing, ends in ROLLBACK):
--   BEGIN;
--   DO $probe$
--   DECLARE
--     v_id uuid;
--     c record;
--   BEGIN
--     SELECT id INTO v_id FROM public.residents LIMIT 1;
--     UPDATE public.residents SET whatsapp_pin_failed_attempts = 0, whatsapp_pin_locked_until = NULL,
--       whatsapp_pin_failed_at = '{}', whatsapp_pin_hard_locked_at = NULL WHERE id = v_id;
--     FOR i IN 1..3 LOOP
--       SELECT * INTO c FROM public.claim_whatsapp_pin_try(v_id);
--       IF c.status <> 'counted' OR c.tries_in_a_row <> i THEN RAISE EXCEPTION 'try %: %', i, c; END IF;
--     END LOOP;
--     IF c.locked_until IS NULL OR c.locked_until > now() + interval '15 minutes 1 second' THEN
--       RAISE EXCEPTION '3rd wrong try did not lock for 15 minutes: %', c;
--     END IF;
--     SELECT * INTO c FROM public.claim_whatsapp_pin_try(v_id);
--     IF c.status <> 'locked' THEN RAISE EXCEPTION 'try inside the 15-minute lock: %', c; END IF;
--     UPDATE public.residents SET whatsapp_pin_locked_until = now() - interval '1 second' WHERE id = v_id;
--     FOR i IN 1..3 LOOP
--       SELECT * INTO c FROM public.claim_whatsapp_pin_try(v_id);
--       IF c.status <> 'counted' OR c.tries_in_a_row <> i OR c.tries_in_window <> 3 + i THEN
--         RAISE EXCEPTION 'after the 15-minute lock, try %: %', i, c;
--       END IF;
--     END LOOP;
--     IF NOT c.hard_locked THEN RAISE EXCEPTION '6th wrong try in 24 hours did not hard lock: %', c; END IF;
--     UPDATE public.residents SET whatsapp_pin_locked_until = now() - interval '1 second',
--       whatsapp_pin_hard_locked_at = now() - interval '30 days' WHERE id = v_id;
--     SELECT * INTO c FROM public.claim_whatsapp_pin_try(v_id);
--     IF c.status <> 'hard_locked' THEN RAISE EXCEPTION 'hard lock lifted on its own: %', c; END IF;
--     UPDATE public.residents SET whatsapp_pin_failed_attempts = 0, whatsapp_pin_locked_until = NULL,
--       whatsapp_pin_hard_locked_at = NULL,
--       whatsapp_pin_failed_at = ARRAY[now() - interval '25 hours', now() - interval '1 hour'] WHERE id = v_id;
--     SELECT * INTO c FROM public.claim_whatsapp_pin_try(v_id);
--     IF c.tries_in_window <> 2 THEN RAISE EXCEPTION 'a try older than 24 hours was counted: %', c; END IF;
--     PERFORM public.clear_whatsapp_pin_try(v_id, c.claimed_at);
--     IF (SELECT whatsapp_pin_failed_attempts <> 0 OR cardinality(whatsapp_pin_failed_at) <> 1
--           FROM public.residents WHERE id = v_id) THEN
--       RAISE EXCEPTION 'correct PIN did not reset the in-a-row count or kept its own try in the window';
--     END IF;
--     RAISE NOTICE 'lock probe passed';
--   END
--   $probe$;
--   ROLLBACK;
--     -- expect NOTICE 'lock probe passed' and no exception

BEGIN;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS whatsapp_pin_failed_at TIMESTAMPTZ[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS whatsapp_pin_hard_locked_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_pin_try(
  p_resident_id uuid,
  p_soft_limit integer DEFAULT 3,
  p_soft_lock_minutes integer DEFAULT 15,
  p_hard_limit integer DEFAULT 6,
  p_window_hours integer DEFAULT 24
)
RETURNS TABLE (
  status text,
  tries_in_a_row integer,
  tries_in_window integer,
  locked_until timestamptz,
  hard_locked boolean,
  claimed_at timestamptz
)
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  -- clock_timestamp, not now(): the claimed try is matched back by value in clear_whatsapp_pin_try.
  v_now timestamptz := clock_timestamp();
  v_row public.residents%ROWTYPE;
  v_in_a_row integer;
  v_window timestamptz[];
  v_locked_until timestamptz;
BEGIN
  SELECT * INTO v_row FROM public.residents AS r WHERE r.id = p_resident_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF v_row.whatsapp_pin_hard_locked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'hard_locked'::text, v_row.whatsapp_pin_failed_attempts,
      cardinality(v_row.whatsapp_pin_failed_at), v_row.whatsapp_pin_locked_until, true, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_row.whatsapp_pin_locked_until > v_now THEN
    RETURN QUERY SELECT 'locked'::text, v_row.whatsapp_pin_failed_attempts,
      cardinality(v_row.whatsapp_pin_failed_at), v_row.whatsapp_pin_locked_until, false, NULL::timestamptz;
    RETURN;
  END IF;

  v_in_a_row := CASE WHEN v_row.whatsapp_pin_locked_until IS NOT NULL THEN 1
                     ELSE v_row.whatsapp_pin_failed_attempts + 1 END;
  v_window := ARRAY(
    SELECT t FROM unnest(v_row.whatsapp_pin_failed_at) AS t
     WHERE t > v_now - make_interval(hours => p_window_hours)
     ORDER BY t
  ) || v_now;
  v_locked_until := CASE WHEN v_in_a_row >= p_soft_limit
                         THEN v_now + make_interval(mins => p_soft_lock_minutes) END;

  UPDATE public.residents AS r
     SET whatsapp_pin_failed_attempts = v_in_a_row,
         whatsapp_pin_failed_at = v_window,
         whatsapp_pin_locked_until = v_locked_until,
         whatsapp_pin_hard_locked_at = CASE WHEN cardinality(v_window) >= p_hard_limit THEN v_now END
   WHERE r.id = p_resident_id;

  RETURN QUERY SELECT 'counted'::text, v_in_a_row, cardinality(v_window), v_locked_until,
    cardinality(v_window) >= p_hard_limit, v_now;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.clear_whatsapp_pin_try(
  p_resident_id uuid,
  p_claimed_at timestamptz
)
RETURNS void
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  UPDATE public.residents AS r
     SET whatsapp_pin_failed_attempts = 0,
         whatsapp_pin_locked_until = NULL,
         whatsapp_pin_failed_at = array_remove(r.whatsapp_pin_failed_at, p_claimed_at),
         whatsapp_pin_hard_locked_at = CASE WHEN r.whatsapp_pin_hard_locked_at = p_claimed_at THEN NULL
                                            ELSE r.whatsapp_pin_hard_locked_at END
   WHERE r.id = p_resident_id;
$fn$;

DROP FUNCTION IF EXISTS public.claim_whatsapp_pin_attempt(uuid, integer, integer);

REVOKE ALL ON FUNCTION public.claim_whatsapp_pin_try(uuid, integer, integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_pin_try(uuid, integer, integer, integer, integer) TO service_role;
REVOKE ALL ON FUNCTION public.clear_whatsapp_pin_try(uuid, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_whatsapp_pin_try(uuid, timestamptz) TO service_role;

COMMIT;
