-- Migration: Communications Debug Mode settings (#713, #717)
-- Purpose: seed the settings behind Debug Mode, the cross-channel "redirect" switch that expires.
--   comms_debug_mode              the switch (default off)
--   comms_debug_expires_at        ISO timestamp the switch stops counting at; blank = none stored
--   comms_debug_duration_minutes  default duration offered when enabling (bounded 5-480 in the app)
-- A switch that is on with a blank expiry is treated as EXPIRED at send time, so a forgotten Debug Mode
-- cannot stay on forever.
-- Also marks the legacy email-only debug settings deprecated. Nothing reads them any more. Description
-- only: no rows deleted, no values changed.
-- Idempotent: ON CONFLICT (key) DO NOTHING; the UPDATE only touches description.

INSERT INTO system_settings (key, value, category, description)
VALUES
  ('comms_debug_mode', 'false'::jsonb, 'comms_override',
   'Debug Mode: redirect all outbound email/SMS/WhatsApp to the override contacts until it expires'),
  ('comms_debug_expires_at', '""'::jsonb, 'comms_override',
   'When Debug Mode expires (ISO timestamp); blank means no expiry is stored and Debug Mode counts as expired'),
  ('comms_debug_duration_minutes', '60'::jsonb, 'comms_override',
   'Default Debug Mode duration in minutes (5-480)')
ON CONFLICT (key) DO NOTHING;

UPDATE system_settings
SET description = 'DEPRECATED (#717): no longer read. Use Debug Mode in Settings > Communications override.'
WHERE key = 'email_debug_mode';

UPDATE system_settings
SET description = 'DEPRECATED (#717): never read. Use the override email in Settings > Communications override.'
WHERE key = 'email_debug_recipient';

-- ROLLBACK:
-- DELETE FROM system_settings
-- WHERE key IN (
--   'comms_debug_mode',
--   'comms_debug_expires_at',
--   'comms_debug_duration_minutes'
-- );
-- UPDATE system_settings SET description = 'Enable email debug mode (logs emails without sending)'
-- WHERE key = 'email_debug_mode';
-- UPDATE system_settings SET description = 'Admin email to receive debug notifications (optional)'
-- WHERE key = 'email_debug_recipient';
