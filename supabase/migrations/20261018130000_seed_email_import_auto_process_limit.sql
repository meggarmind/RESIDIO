-- Migration: Email import auto-process limit setting (#710)
-- Purpose: seed the amount (whole naira) above which an auto-matched email credit waits for
-- approval instead of being posted automatically (#709). Default N60,000, the value #709 shipped
-- as a code constant. The constant stays as the fallback when this row is absent; a failed or
-- invalid read queues every credit for review.
-- No other system_settings row belongs to the Gmail import yet, so this starts the
-- 'email_integration' category, named after its settings page.
-- Idempotent: ON CONFLICT (key) DO NOTHING, so an edited value is never reset.

INSERT INTO system_settings (key, value, category, description)
VALUES
  ('email_import_auto_process_limit', '60000'::jsonb, 'email_integration',
   'Auto-matched email payments above this amount (NGN, whole naira) wait for approval')
ON CONFLICT (key) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM system_settings WHERE key = 'email_import_auto_process_limit';
