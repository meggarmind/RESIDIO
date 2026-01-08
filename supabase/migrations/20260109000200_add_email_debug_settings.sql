-- Migration: Add Email Debug Mode Settings
-- Purpose: Allow admins to test email functionality without sending to actual recipients
-- Date: 2026-01-09

-- Add email debug mode settings
INSERT INTO system_settings (key, value, category, description, updated_by)
VALUES
  (
    'email_debug_mode',
    'false',
    'email',
    'Enable email debug mode (logs emails without sending)',
    (SELECT id FROM profiles WHERE email = 'admin@residio.test' LIMIT 1)
  ),
  (
    'email_debug_recipient',
    '',
    'email',
    'Admin email to receive debug notifications (optional)',
    (SELECT id FROM profiles WHERE email = 'admin@residio.test' LIMIT 1)
  )
ON CONFLICT (key) DO NOTHING;
