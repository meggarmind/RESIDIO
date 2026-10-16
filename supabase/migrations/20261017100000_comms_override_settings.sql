-- Migration: Communications override settings (#713, #715)
-- Purpose: seed the settings behind the send-time redirect of outbound email, SMS and WhatsApp.
--   comms_override_enabled        stored global switch (ignored outside production)
--   comms_override_email          the one email address redirected messages go to
--   comms_override_phone          E.164 phone used for SMS and WhatsApp
--   comms_override_whatsapp_phone optional separate WhatsApp number (falls back to the phone)
-- Blank override values are seeded blank on purpose: a redirect that needs a blank value is BLOCKED,
-- never sent to the real address.
-- Idempotent: ON CONFLICT (key) DO NOTHING, so re-applying never overwrites an admin's values.

INSERT INTO system_settings (key, value, category, description)
VALUES
  ('comms_override_enabled', 'false'::jsonb, 'comms_override',
   'Redirect outbound email/SMS/WhatsApp to the override contacts (forced on outside production)'),
  ('comms_override_email', '""'::jsonb, 'comms_override',
   'Override email address that redirected messages are delivered to'),
  ('comms_override_phone', '""'::jsonb, 'comms_override',
   'Override phone number (E.164) for redirected SMS and WhatsApp messages'),
  ('comms_override_whatsapp_phone', '""'::jsonb, 'comms_override',
   'Optional separate WhatsApp override number (E.164); falls back to the override phone')
ON CONFLICT (key) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM system_settings
-- WHERE key IN (
--   'comms_override_enabled',
--   'comms_override_email',
--   'comms_override_phone',
--   'comms_override_whatsapp_phone'
-- );
