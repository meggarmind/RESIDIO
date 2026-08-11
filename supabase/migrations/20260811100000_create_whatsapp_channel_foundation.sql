-- WhatsApp webhook idempotency ledger.
-- Only the server-side service role writes this table; no resident-facing
-- Data API policy is intentionally exposed at this foundation stage.
CREATE TABLE IF NOT EXISTS public.whatsapp_processed_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id TEXT NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whatsapp_processed_messages_message_id_key UNIQUE (message_id),
  CONSTRAINT whatsapp_processed_messages_expiry_check CHECK (expires_at > received_at)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_processed_messages_expires_at
  ON public.whatsapp_processed_messages (expires_at);

ALTER TABLE public.whatsapp_processed_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_processed_messages FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_processed_messages TO service_role;

COMMENT ON TABLE public.whatsapp_processed_messages IS
  'Idempotency ledger for Meta WhatsApp message IDs; rows are retained for the deduplication window.';
