-- Hold inbound WhatsApp messages while the master switch is off, and answer them when it is back (#1075).
--
-- WHAT CHANGES
--   CREATE TABLE public.whatsapp_held_messages: one row per inbound message received while
--     whatsapp_enabled is off (message_id unique, so a provider retry is not saved twice).
--   CREATE TABLE public.whatsapp_holding_replies: one row per phone number that has had the holding
--     reply in the current switch-off period. Cleared when the switch is turned on.
--
-- WHY
--   Owner decision 2026-10-22 (#1075): while the switch is off, a resident gets one holding reply and
--   the message is answered, oldest first and at most once, when the switch is turned back on.
--   A message older than 24 hours is dropped instead of answered. A PIN-shaped message (only digits,
--   or starting with PIN) is never saved.
--
-- WHO IS AFFECTED
--   Nobody directly. Both tables hold resident phone numbers and message text, so they are
--   service_role only: RLS on, no policy for anon or authenticated, table grants revoked.
--
-- DEPLOY ORDER: apply this before the application code is deployed; with the switch off, the inbound
--   path writes to both tables and a missing table makes the webhook fail (the provider then retries).
--
-- IDEMPOTENT: CREATE TABLE / INDEX IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY.
--
-- ROLLBACK (roll the application code back first; messages received while the switch is off then get
--   no reply and are not answered later, as before #1075; any saved messages are lost):
--   DROP TABLE IF EXISTS public.whatsapp_holding_replies;
--   DROP TABLE IF EXISTS public.whatsapp_held_messages;
--
-- VERIFY (run on the database after applying):
--   SELECT c.relname, c.relrowsecurity
--     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--    WHERE n.nspname = 'public' AND c.relname IN ('whatsapp_held_messages', 'whatsapp_holding_replies');
--     -- expect 2 rows, relrowsecurity true
--   SELECT table_name, grantee FROM information_schema.role_table_grants
--    WHERE table_schema = 'public' AND table_name IN ('whatsapp_held_messages', 'whatsapp_holding_replies')
--      AND grantee IN ('anon', 'authenticated');
--     -- expect 0 rows

BEGIN;

CREATE TABLE IF NOT EXISTS public.whatsapp_held_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL UNIQUE,
  phone_number TEXT NOT NULL,
  message JSONB NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS whatsapp_held_messages_received_at_idx
  ON public.whatsapp_held_messages (received_at, id);

CREATE TABLE IF NOT EXISTS public.whatsapp_holding_replies (
  phone_number TEXT PRIMARY KEY,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whatsapp_held_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_holding_replies ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_held_messages, public.whatsapp_holding_replies FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_held_messages, public.whatsapp_holding_replies TO service_role;

DROP POLICY IF EXISTS "whatsapp_held_messages_service_role_all" ON public.whatsapp_held_messages;
CREATE POLICY "whatsapp_held_messages_service_role_all"
  ON public.whatsapp_held_messages
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "whatsapp_holding_replies_service_role_all" ON public.whatsapp_holding_replies;
CREATE POLICY "whatsapp_holding_replies_service_role_all"
  ON public.whatsapp_holding_replies
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

COMMIT;
