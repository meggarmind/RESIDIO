-- WhatsApp statement delivery and disclosure channel (#804 decisions 24-26).
--
-- WHAT CHANGES
--   1. whatsapp_disclosure_logs.channel TEXT NOT NULL DEFAULT 'chat', one of chat / pdf / email:
--      how a financial answer left the estate. Existing rows were all chat answers.
--   2. CREATE TABLE public.whatsapp_statement_requests: one row per statement PDF a resident asked
--      for in chat. delivery 'chat' rows hold the PDF's path in private storage until it is deleted
--      12 hours later (file_deleted_at), and the reply text so a failed send can be retried once
--      with a fresh signed URL (retried_at). delivery 'email' rows track the queued email; status
--      'awaiting_email' is the "Statement requested, no email" flag in the WhatsApp console.
--      service_role only, like the other WhatsApp tables; anon and authenticated get nothing.
--   3. The private storage bucket whatsapp-media (same definition as #871, so whichever migration
--      runs first creates it). Statement PDFs live under statements/.
--   4. whatsapp_daily_financial_lookup_cap: the seeded 50 becomes 500 (#804 decision 26). It is now
--      an estate-wide safety valve beside a per-resident cap of 20 in code. A value an admin
--      changed from 50 is left alone.
--
-- WHY
--   Residents get a statement PDF in chat (Chatmaid fetches files only from a public HTTPS URL, so a
--   1-hour signed URL to a private object), or by email when it is over 40 rows. Every PDF and email
--   is a disclosure, logged with its channel and counted toward the caps.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, constraint drop-and-add, CREATE ... IF NOT EXISTS,
--   ON CONFLICT DO NOTHING for the bucket, and the cap UPDATE matches only the old seed value.
--
-- ROLLBACK (loses the request history; export the table first):
--   BEGIN;
--   DROP TABLE IF EXISTS public.whatsapp_statement_requests;
--   ALTER TABLE public.whatsapp_disclosure_logs DROP CONSTRAINT IF EXISTS whatsapp_disclosure_logs_channel_check;
--   ALTER TABLE public.whatsapp_disclosure_logs DROP COLUMN IF EXISTS channel;
--   UPDATE public.system_settings SET value = CASE WHEN jsonb_typeof(value) = 'string' THEN to_jsonb('50'::text) ELSE '50'::jsonb END
--     WHERE key = 'whatsapp_daily_financial_lookup_cap' AND value #>> '{}' = '500';
--   COMMIT;
--   The bucket is left in place (#871 uses it too); remove statements/ objects in the dashboard.
--   Roll the application code back first: it writes the channel column and the new table.
--
-- VERIFY (run on the database after applying):
--   SELECT column_default FROM information_schema.columns
--     WHERE table_name = 'whatsapp_disclosure_logs' AND column_name = 'channel';  -- expect 'chat'::text
--   SELECT has_table_privilege('authenticated', 'public.whatsapp_statement_requests', 'SELECT');  -- expect false
--   SELECT public FROM storage.buckets WHERE id = 'whatsapp-media';                               -- expect false
--   SELECT value FROM public.system_settings WHERE key = 'whatsapp_daily_financial_lookup_cap';   -- 500 unless changed

ALTER TABLE public.whatsapp_disclosure_logs
  ADD COLUMN IF NOT EXISTS channel TEXT NOT NULL DEFAULT 'chat';
ALTER TABLE public.whatsapp_disclosure_logs DROP CONSTRAINT IF EXISTS whatsapp_disclosure_logs_channel_check;
ALTER TABLE public.whatsapp_disclosure_logs
  ADD CONSTRAINT whatsapp_disclosure_logs_channel_check CHECK (channel IN ('chat', 'pdf', 'email'));

CREATE TABLE IF NOT EXISTS public.whatsapp_statement_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL,
  period TEXT NOT NULL,
  from_date DATE NOT NULL,
  to_date DATE NOT NULL,
  row_count INTEGER NOT NULL,
  delivery TEXT NOT NULL CHECK (delivery IN ('chat', 'email')),
  status TEXT NOT NULL CHECK (status IN ('sent', 'awaiting_email', 'queued', 'cancelled')),
  inbound_message_id TEXT,
  reply_text TEXT,
  storage_path TEXT,
  file_deleted_at TIMESTAMPTZ,
  retried_at TIMESTAMPTZ,
  notification_queue_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_statement_requests_inbound
  ON public.whatsapp_statement_requests (inbound_message_id);
CREATE INDEX IF NOT EXISTS idx_whatsapp_statement_requests_files
  ON public.whatsapp_statement_requests (created_at)
  WHERE storage_path IS NOT NULL AND file_deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_whatsapp_statement_requests_awaiting
  ON public.whatsapp_statement_requests (resident_id)
  WHERE status = 'awaiting_email';

ALTER TABLE public.whatsapp_statement_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_statement_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_statement_requests TO service_role;
DROP POLICY IF EXISTS "whatsapp_statement_requests_service_role_all" ON public.whatsapp_statement_requests;
CREATE POLICY "whatsapp_statement_requests_service_role_all"
  ON public.whatsapp_statement_requests FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.whatsapp_statement_requests IS
  'Statement PDFs residents asked for over WhatsApp: chat delivery (file kept 12 hours) or queued email (#804).';

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO NOTHING;

UPDATE public.system_settings
SET value = CASE WHEN jsonb_typeof(value) = 'string' THEN to_jsonb('500'::text) ELSE '500'::jsonb END,
    description = 'Maximum WhatsApp financial lookups per day across the estate'
WHERE key = 'whatsapp_daily_financial_lookup_cap'
  AND value #>> '{}' = '50';
