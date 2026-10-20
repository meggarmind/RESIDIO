-- Hold a chosen WhatsApp PIN, as a salted hash, until the resident confirms it (#892, slice C of #805).
--
-- WHAT CHANGES
--   ADD COLUMN public.whatsapp_sessions.pending_pin_hash TEXT (nullable, no default).
--   Existing rows get NULL.
--
-- WHY
--   Owner decision 2026-10-20 (#805, "Harmonised with the conversation-flow spec"): setting or
--   changing a PIN asks for it twice. The first entry has to survive until the second message
--   arrives. It is stored here as the same salted scrypt hash residents.whatsapp_pin_hash uses,
--   never as the PIN, and cleared when the confirmation succeeds, is cancelled or the resident
--   leaves the step. current_node (shown in the operations console) carries only the step name.
--
-- WHO IS AFFECTED
--   Nobody directly. whatsapp_sessions stays service_role only (RLS on, anon and authenticated
--   revoked in 20260811131114). The operations console does not select the new column.
--
-- DEPLOY ORDER: apply this before the application code is deployed; the code selects and writes
--   pending_pin_hash and every WhatsApp financial reply fails without the column.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
--
-- ROLLBACK (roll the application code back first; any PIN awaiting confirmation is lost and that
--   resident is asked to start again):
--   ALTER TABLE public.whatsapp_sessions DROP COLUMN IF EXISTS pending_pin_hash;
--
-- VERIFY (run on the database after applying):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'whatsapp_sessions'
--      AND column_name = 'pending_pin_hash';
--     -- expect 1 row: pending_pin_hash text YES null
--   SELECT has_column_privilege('anon', 'public.whatsapp_sessions', 'pending_pin_hash', 'SELECT') AS anon,
--          has_column_privilege('authenticated', 'public.whatsapp_sessions', 'pending_pin_hash', 'SELECT') AS authenticated;
--     -- expect false, false

BEGIN;

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS pending_pin_hash TEXT;

COMMIT;
