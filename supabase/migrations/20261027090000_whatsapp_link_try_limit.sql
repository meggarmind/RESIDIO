-- Limit wrong WhatsApp LINK code guesses per phone number (#1058, item 10).
--
-- WHAT CHANGES
--   1. CREATE TABLE public.whatsapp_link_attempts (phone_number text PRIMARY KEY,
--      failed_at timestamptz[] NOT NULL DEFAULT '{}'). RLS on, no policies: service_role only.
--   2. CREATE FUNCTION public.claim_whatsapp_link_try(p_phone_number text, p_limit integer DEFAULT 5,
--      p_window_minutes integer DEFAULT 15) RETURNS boolean. Counts a LINK try as wrong BEFORE the code
--      is checked, under a row lock: returns false (and counts nothing) when the number already has
--      p_limit tries inside the window, otherwise records the try and returns true.
--   3. CREATE FUNCTION public.clear_whatsapp_link_tries(p_phone_number text) RETURNS void. Called after a
--      VALID code: deletes the number's row.
--   4. REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role.
--
-- WHY
--   `LINK <6-12 digits>` had no wrong-guess limit, so a short code could be guessed. Same pattern as
--   claim_whatsapp_pin_try (20261021120000): count first under a row lock, so concurrent guesses cannot
--   all be checked before the lock lands.
--
-- WHO IS AFFECTED
--   Numbers sending LINK codes through the WhatsApp webhook. A number is locked for up to 15 minutes
--   after 5 wrong tries; it unlocks as the oldest try leaves the window. No existing data changes.
--
-- DEPLOY ORDER: apply together with the application code. Old code never calls these functions. New
--   code without them fails closed (the RPC errors, so no LINK code is accepted) until they exist.
--
-- IDEMPOTENT: CREATE TABLE IF NOT EXISTS; CREATE OR REPLACE; REVOKE/GRANT are repeatable.
--
-- ROLLBACK: roll the application code back first, then:
--   DROP FUNCTION IF EXISTS public.claim_whatsapp_link_try(text, integer, integer);
--   DROP FUNCTION IF EXISTS public.clear_whatsapp_link_tries(text);
--   DROP TABLE IF EXISTS public.whatsapp_link_attempts;
--
-- VERIFY (after applying): expect 2 rows, each false, false, true:
--   SELECT p.proname, has_function_privilege('anon', p.oid, 'EXECUTE'),
--          has_function_privilege('authenticated', p.oid, 'EXECUTE'),
--          has_function_privilege('service_role', p.oid, 'EXECUTE')
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname IN ('claim_whatsapp_link_try', 'clear_whatsapp_link_tries');

CREATE TABLE IF NOT EXISTS public.whatsapp_link_attempts (
  phone_number text PRIMARY KEY,
  failed_at timestamptz[] NOT NULL DEFAULT '{}'
);

ALTER TABLE public.whatsapp_link_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_link_try(
  p_phone_number text,
  p_limit integer DEFAULT 5,
  p_window_minutes integer DEFAULT 15
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_recent timestamptz[];
BEGIN
  INSERT INTO public.whatsapp_link_attempts (phone_number) VALUES (p_phone_number)
  ON CONFLICT (phone_number) DO NOTHING;

  -- Row lock taken here, before the decision, so concurrent claims serialise.
  PERFORM 1 FROM public.whatsapp_link_attempts WHERE phone_number = p_phone_number FOR UPDATE;

  SELECT COALESCE(array_agg(t ORDER BY t), '{}') INTO v_recent
    FROM public.whatsapp_link_attempts a, unnest(a.failed_at) AS t
   WHERE a.phone_number = p_phone_number
     AND t > now() - make_interval(mins => p_window_minutes);

  IF cardinality(v_recent) >= p_limit THEN
    UPDATE public.whatsapp_link_attempts SET failed_at = v_recent WHERE phone_number = p_phone_number;
    RETURN false;
  END IF;

  UPDATE public.whatsapp_link_attempts
     SET failed_at = v_recent || now()
   WHERE phone_number = p_phone_number;
  RETURN true;
END
$$;

CREATE OR REPLACE FUNCTION public.clear_whatsapp_link_tries(p_phone_number text) RETURNS void
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  DELETE FROM public.whatsapp_link_attempts WHERE phone_number = p_phone_number;
$$;

REVOKE EXECUTE ON FUNCTION public.claim_whatsapp_link_try(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.clear_whatsapp_link_tries(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_link_try(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.clear_whatsapp_link_tries(text) TO service_role;
