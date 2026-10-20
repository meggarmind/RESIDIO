-- Require a WhatsApp PIN by default and lock it after repeated wrong guesses (#850).
--
-- WHAT CHANGES
--   1. ADD COLUMN public.residents.whatsapp_pin_failed_attempts INTEGER NOT NULL DEFAULT 0 (>= 0)
--      and public.residents.whatsapp_pin_locked_until TIMESTAMPTZ.
--   2. whatsapp_force_pin is set to true (inserted as true where the row is missing).
--   3. CREATE OR REPLACE FUNCTION public.claim_whatsapp_pin_attempt(
--        p_resident_id uuid, p_max_attempts integer DEFAULT 5, p_lock_minutes integer DEFAULT 1440)
--      RETURNS integer. One atomic UPDATE that counts a PIN attempt BEFORE the PIN is checked:
--      returns the attempt number, sets whatsapp_pin_locked_until once it reaches p_max_attempts,
--      and returns NULL (no row) while the resident is locked. A lock that has expired restarts
--      the count at 1. The application clears the count on a correct PIN.
--   4. REVOKE EXECUTE FROM PUBLIC, anon, authenticated; GRANT EXECUTE TO service_role.
--
-- WHY
--   The PIN was optional by default and a wrong PIN only replied "not correct", so a 4-digit
--   PIN fell to at most 10,000 guesses. Owner decision 2026-10-20: require a PIN, with a
--   lockout. Unlock is a time lockout of 24 hours. Counting before checking means concurrent
--   guesses cannot all be checked before the lock lands (row lock serialises the UPDATE).
--
-- WHO IS AFFECTED
--   Residents using WhatsApp financial answers: without a PIN they are now asked to set one
--   (PIN followed by 4-6 digits) before any answer. An estate that had turned the policy off on
--   purpose has it turned back on; an admin can turn it off again under Settings > WhatsApp.
--   The new residents columns are not self-service (the #728 trigger allowlist blocks them for
--   residents). The function is SECURITY INVOKER and only service_role (the webhook's admin
--   client) can execute it.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS; the settings UPDATE/INSERT is repeatable;
--   CREATE OR REPLACE; REVOKE/GRANT are repeatable.
--
-- ROLLBACK (loses attempt counts and active locks only):
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.claim_whatsapp_pin_attempt(uuid, integer, integer);
--   ALTER TABLE public.residents DROP COLUMN IF EXISTS whatsapp_pin_failed_attempts,
--     DROP COLUMN IF EXISTS whatsapp_pin_locked_until;
--   UPDATE public.system_settings SET value = 'false'::jsonb WHERE key = 'whatsapp_force_pin';
--   COMMIT;
--   Roll the application code back first: it calls the function and fails closed (no PIN
--   check succeeds) if it is missing. Salted hashes written by the new code are not readable
--   by the old code; those residents would need their PIN cleared.
--
-- VERIFY (run on the database after applying):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'residents'
--      AND column_name IN ('whatsapp_pin_failed_attempts', 'whatsapp_pin_locked_until');
--     -- expect 2 rows: integer NO 0; timestamp with time zone YES null
--   SELECT value FROM public.system_settings WHERE key = 'whatsapp_force_pin';
--     -- expect true
--   SELECT has_function_privilege('anon', 'public.claim_whatsapp_pin_attempt(uuid, integer, integer)', 'EXECUTE') AS anon,
--          has_function_privilege('authenticated', 'public.claim_whatsapp_pin_attempt(uuid, integer, integer)', 'EXECUTE') AS authenticated,
--          has_function_privilege('service_role', 'public.claim_whatsapp_pin_attempt(uuid, integer, integer)', 'EXECUTE') AS service_role;
--     -- expect false, false, true

BEGIN;

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS whatsapp_pin_failed_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (whatsapp_pin_failed_attempts >= 0),
  ADD COLUMN IF NOT EXISTS whatsapp_pin_locked_until TIMESTAMPTZ;

UPDATE public.system_settings SET value = 'true'::jsonb WHERE key = 'whatsapp_force_pin';

INSERT INTO public.system_settings (key, value, description, category)
VALUES (
  'whatsapp_force_pin',
  'true'::jsonb,
  'Require WhatsApp PIN verification before financial answers',
  'notifications'
)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.claim_whatsapp_pin_attempt(
  p_resident_id uuid,
  p_max_attempts integer DEFAULT 5,
  p_lock_minutes integer DEFAULT 1440
)
RETURNS integer
LANGUAGE sql
VOLATILE
SECURITY INVOKER
SET search_path = ''
AS $fn$
  UPDATE public.residents AS r
     SET whatsapp_pin_failed_attempts = CASE
           WHEN r.whatsapp_pin_locked_until IS NOT NULL THEN 1
           ELSE r.whatsapp_pin_failed_attempts + 1
         END,
         whatsapp_pin_locked_until = CASE
           WHEN (CASE WHEN r.whatsapp_pin_locked_until IS NOT NULL THEN 1
                      ELSE r.whatsapp_pin_failed_attempts + 1 END) >= p_max_attempts
             THEN now() + make_interval(mins => p_lock_minutes)
           ELSE NULL
         END
   WHERE r.id = p_resident_id
     AND (r.whatsapp_pin_locked_until IS NULL OR r.whatsapp_pin_locked_until <= now())
  RETURNING r.whatsapp_pin_failed_attempts;
$fn$;

REVOKE ALL ON FUNCTION public.claim_whatsapp_pin_attempt(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_whatsapp_pin_attempt(uuid, integer, integer) TO service_role;

COMMIT;
