-- Retention period for WhatsApp survey answers (#920, part of #794).
--
-- WHAT CHANGES
--   Seeds system_settings.whatsapp_survey_retention_days = 90. The whatsapp-retention cron job
--   deletes whatsapp_survey_responses rows whose asked_at is older than this many days.
--   whatsapp_survey_opt_outs is never purged: it records a resident's choice and holds no comment.
--
-- WHY
--   whatsapp_survey_responses keeps the resident's phone number and a free-text comment, and
--   nothing deleted them. Owner decision 2026-10-21: 90 days (the console reads the last 30).
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING.
--
-- ROLLBACK:
--   DELETE FROM public.system_settings WHERE key = 'whatsapp_survey_retention_days';
--   (The job then falls back to 90 days in code.)
--
-- VERIFY (run on the database after applying):
--   SELECT value FROM public.system_settings WHERE key = 'whatsapp_survey_retention_days';  -- expect 90

INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('whatsapp_survey_retention_days', '90'::jsonb, 'Days to keep WhatsApp survey answers before the retention job deletes them', 'notifications')
ON CONFLICT (key) DO NOTHING;
