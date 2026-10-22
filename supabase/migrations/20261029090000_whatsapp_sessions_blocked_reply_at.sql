-- Remember when a blocked WhatsApp number was last sent the "current residents only" reply (#1070).
--
-- WHAT CHANGES
--   ADD COLUMN public.whatsapp_sessions.blocked_reply_at TIMESTAMPTZ (nullable, no default).
--   Existing rows get NULL.
--
-- WHY
--   Owner decision 2026-10-22 (#1066 Q14): a number that may not use the Assistant gets one fixed
--   reply at most once every 24 hours and silence otherwise. whatsapp_sessions is already one row
--   per phone number. The retention purge (retention.ts) skips any row whose blocked_reply_at is
--   under 24 hours old, so the window is never cut short even when the row itself has expired.
--
-- WHO IS AFFECTED
--   Nobody directly. whatsapp_sessions stays service_role only (RLS on, anon and authenticated
--   revoked in 20260811131114).
--
-- DEPLOY ORDER: apply this before the application code is deployed; the blocked-number path updates
--   the column and a missing column makes that update fail.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
--
-- ROLLBACK (roll the application code back first; blocked numbers would then be replied to again
--   on their next message):
--   ALTER TABLE public.whatsapp_sessions DROP COLUMN IF EXISTS blocked_reply_at;
--
-- VERIFY (run on the database after applying):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'whatsapp_sessions'
--      AND column_name = 'blocked_reply_at';
--     -- expect 1 row: blocked_reply_at timestamp with time zone YES null

BEGIN;

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS blocked_reply_at TIMESTAMPTZ;

COMMIT;
