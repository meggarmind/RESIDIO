-- Add system administration settings to system_settings table
-- These settings configure maintenance mode, data retention, and session settings

INSERT INTO system_settings (key, value, description, category)
VALUES
  ('maintenance_mode', 'false'::jsonb, 'Enable maintenance mode to lock out non-admin users', 'system'),
  ('maintenance_message', '"The system is currently under maintenance. Please try again later."'::jsonb, 'Message displayed during maintenance mode', 'system'),
  ('audit_log_retention_days', '365'::jsonb, 'Number of days to retain audit logs', 'system'),
  ('session_timeout_minutes', '60'::jsonb, 'User session timeout in minutes', 'system')
ON CONFLICT (key) DO NOTHING;
