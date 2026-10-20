-- #839: one row per accepted outbound WhatsApp send, keyed by the provider's
-- message id, so Chatmaid's asynchronous status webhooks (message.sent,
-- message.delivered, message.failed) can be tied back to the resident, the
-- phone and the inbound message a reply answered.
CREATE TABLE IF NOT EXISTS public.whatsapp_outbound_sends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL,
  provider_message_id TEXT NOT NULL,
  purpose TEXT NOT NULL CHECK (purpose IN ('inbound_reply', 'notification')),
  resident_id UUID REFERENCES public.residents(id) ON DELETE SET NULL,
  phone_number TEXT NOT NULL,
  inbound_message_id TEXT,
  notification_queue_id UUID,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  error_code TEXT,
  error_message TEXT,
  -- Set once the "accepted but never confirmed" alert has covered this row.
  pending_alerted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  status_updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  UNIQUE (provider, provider_message_id)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_outbound_sends_status_created
  ON public.whatsapp_outbound_sends (status, created_at DESC);

ALTER TABLE public.whatsapp_outbound_sends ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_outbound_sends FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_outbound_sends TO service_role;

CREATE POLICY "whatsapp_outbound_sends_service_role_all"
  ON public.whatsapp_outbound_sends FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.whatsapp_outbound_sends IS
  'Outbound WhatsApp sends and their provider delivery status (#839). Service role only.';
