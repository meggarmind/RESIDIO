-- Add payment configuration settings to system_settings table
-- These settings configure late fees and payment reminders

INSERT INTO system_settings (key, value, description, category)
VALUES
  ('late_fee_enabled', 'false'::jsonb, 'Enable late fee charges on overdue invoices', 'billing'),
  ('late_fee_type', '"percentage"'::jsonb, 'Type of late fee: percentage or fixed', 'billing'),
  ('late_fee_amount', '5'::jsonb, 'Late fee amount (percentage or fixed amount in Naira)', 'billing'),
  ('grace_period_days', '7'::jsonb, 'Days after due date before late fee applies', 'billing'),
  ('payment_reminder_days', '[7, 3, 1]'::jsonb, 'Days before due date to send payment reminders', 'billing')
ON CONFLICT (key) DO NOTHING;
