INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('whatsapp_rollout_mode', to_jsonb('disabled'::text), 'WhatsApp rollout mode: disabled, pilot, or estate', 'notifications'),
  ('whatsapp_pilot_resident_ids', to_jsonb('[]'::text), 'JSON array of resident IDs included in the WhatsApp pilot', 'notifications'),
  ('whatsapp_pilot_street_id', to_jsonb(''::text), 'Street ID included in the WhatsApp pilot', 'notifications'),
  ('whatsapp_outbound_daily_cap', to_jsonb('100'::text), 'Maximum proactive WhatsApp messages per UTC day', 'notifications'),
  ('whatsapp_daily_financial_lookup_cap', to_jsonb('50'::text), 'Maximum WhatsApp financial lookups per UTC day', 'notifications')
ON CONFLICT (key) DO NOTHING;
