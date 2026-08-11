-- Estate Assistant defaults. Existing estate-specific values are preserved.
INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('disable_ai_assistant', 'false'::jsonb, 'Hide the Estate Assistant for all dashboard users', 'general'),
  ('ai_assistant_greeting_enabled', 'true'::jsonb, 'Show a personalized greeting when a new Estate Assistant conversation opens', 'general')
ON CONFLICT (key) DO NOTHING;
