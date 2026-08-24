INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('whatsapp_rollout_mode', '"disabled"'::jsonb, 'WhatsApp rollout mode: disabled, pilot, or estate', 'notifications'),
  ('whatsapp_pilot_resident_ids', '[]'::jsonb, 'Resident IDs included in the WhatsApp pilot', 'notifications'),
  ('whatsapp_pilot_street_id', '""'::jsonb, 'Street ID included in the WhatsApp pilot', 'notifications'),
  ('whatsapp_outbound_daily_cap', '100'::jsonb, 'Maximum proactive WhatsApp messages per UTC day', 'notifications'),
  ('whatsapp_outbound_burst_cap', '20'::jsonb, 'Maximum proactive WhatsApp messages in the configured burst window', 'notifications'),
  ('whatsapp_outbound_burst_window_minutes', '10'::jsonb, 'UTC rolling window for the proactive WhatsApp burst cap', 'notifications'),
  ('whatsapp_daily_financial_lookup_cap', '50'::jsonb, 'Maximum WhatsApp financial lookups per UTC day', 'notifications'),
  ('whatsapp_session_retention_days', '1'::jsonb, 'Bounded retention for expired WhatsApp sessions', 'notifications'),
  ('whatsapp_processed_message_retention_days', '2'::jsonb, 'Bounded retention for processed WhatsApp webhook IDs', 'notifications')
ON CONFLICT (key) DO NOTHING;
