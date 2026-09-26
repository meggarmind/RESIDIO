ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS whatsapp_pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS whatsapp_pin_set_at TIMESTAMPTZ;

INSERT INTO public.system_settings (key, value, description, category)
VALUES (
  'whatsapp_force_pin',
  'false'::jsonb,
  'Require WhatsApp PIN verification before financial answers',
  'notifications'
)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.whatsapp_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  resident_id UUID REFERENCES public.residents(id) ON DELETE CASCADE,
  current_node TEXT NOT NULL DEFAULT 'menu',
  selected_house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL,
  pin_authenticated BOOLEAN NOT NULL DEFAULT false,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_expiry
  ON public.whatsapp_sessions (expires_at);
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_resident
  ON public.whatsapp_sessions (resident_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_disclosure_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
  phone_number TEXT NOT NULL,
  house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL,
  menu_item TEXT NOT NULL,
  pin_authenticated BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_disclosure_logs_resident
  ON public.whatsapp_disclosure_logs (resident_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_disclosure_logs_phone
  ON public.whatsapp_disclosure_logs (phone_number, created_at DESC);

ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_disclosure_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_sessions, public.whatsapp_disclosure_logs FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_sessions, public.whatsapp_disclosure_logs TO service_role;

CREATE POLICY "whatsapp_sessions_service_role_all"
  ON public.whatsapp_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "whatsapp_disclosure_logs_service_role_all"
  ON public.whatsapp_disclosure_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.whatsapp_disclosure_logs IS
  'Immutable record of financial standing answers sent through the WhatsApp Assistant.';
