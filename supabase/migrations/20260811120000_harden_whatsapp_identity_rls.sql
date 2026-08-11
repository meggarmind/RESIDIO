ALTER TABLE public.whatsapp_pending_contacts
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'inbound';

ALTER TABLE public.whatsapp_pending_contacts
  DROP CONSTRAINT IF EXISTS whatsapp_pending_contacts_source_check;

ALTER TABLE public.whatsapp_pending_contacts
  ADD CONSTRAINT whatsapp_pending_contacts_source_check
  CHECK (source IN ('inbound', 'link_code', 'admin'));

CREATE POLICY "whatsapp_optins_service_role_all"
  ON public.whatsapp_optins
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "whatsapp_pending_contacts_service_role_all"
  ON public.whatsapp_pending_contacts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY "whatsapp_link_tokens_service_role_all"
  ON public.whatsapp_link_tokens
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
