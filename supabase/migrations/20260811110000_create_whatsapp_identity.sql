CREATE TABLE IF NOT EXISTS public.whatsapp_optins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  opted_in BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL DEFAULT 'in_chat',
  opted_in_at TIMESTAMPTZ,
  opted_out_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whatsapp_optins_source_check CHECK (source IN ('in_chat', 'admin_import', 'admin')),
  CONSTRAINT whatsapp_optins_state_dates_check CHECK (
    (opted_in = true AND opted_in_at IS NOT NULL AND opted_out_at IS NULL)
    OR (opted_in = false AND opted_out_at IS NOT NULL AND opted_in_at IS NULL)
    OR (opted_in = false AND opted_in_at IS NULL AND opted_out_at IS NULL)
  ),
  CONSTRAINT whatsapp_optins_resident_phone_key UNIQUE (resident_id, phone_number)
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_optins_phone ON public.whatsapp_optins (phone_number);
CREATE INDEX IF NOT EXISTS idx_whatsapp_optins_resident ON public.whatsapp_optins (resident_id);

CREATE TABLE IF NOT EXISTS public.whatsapp_pending_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  resident_id UUID REFERENCES public.residents(id) ON DELETE SET NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whatsapp_pending_contacts_status_check CHECK (status IN ('pending', 'attached', 'ignored'))
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_pending_contacts_status
  ON public.whatsapp_pending_contacts (status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.whatsapp_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_link_tokens_lookup
  ON public.whatsapp_link_tokens (token_hash, expires_at)
  WHERE used_at IS NULL;

ALTER TABLE public.whatsapp_optins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_pending_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_link_tokens ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_optins, public.whatsapp_pending_contacts, public.whatsapp_link_tokens
  FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_optins, public.whatsapp_pending_contacts, public.whatsapp_link_tokens
  TO service_role;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('whatsapp.view', 'View WhatsApp Operations', 'View WhatsApp opt-ins and pending contacts', 'notifications', true),
  ('whatsapp.manage', 'Manage WhatsApp Operations', 'Manage WhatsApp identity links and consent records', 'notifications', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'vice_chairman')
  AND p.name IN ('whatsapp.view', 'whatsapp.manage')
  AND p.is_active = true
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('financial_officer', 'security_officer')
  AND p.name = 'whatsapp.view'
  AND p.is_active = true
ON CONFLICT DO NOTHING;
