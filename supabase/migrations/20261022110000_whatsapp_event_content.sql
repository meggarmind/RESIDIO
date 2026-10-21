-- #908: admin-editable Chatmaid WhatsApp wording for payment reminders and receipts.
--
-- Same store as #907 (notification_templates, `overrides` over code defaults), one more row per event
-- with channel 'whatsapp'. `name` is UNIQUE, so these rows are suffixed; the code finds them by
-- (event, channel), not by name. `announcement` is written per send and has no row.
-- body_template is NOT NULL but unused: the wording lives in code defaults plus `overrides`.

INSERT INTO notification_templates (name, display_name, category, channel, body_template, event, is_system, is_active)
VALUES
  ('payment_received_whatsapp', 'Payment receipt (WhatsApp)',         'payment', 'whatsapp', '', 'payment_receipt',  true, true),
  ('invoice_reminder_whatsapp', 'Payment reminder, manual (WhatsApp)', 'invoice', 'whatsapp', '', 'payment_reminder', true, true)
ON CONFLICT (event, channel) DO NOTHING;

-- ROLLBACK:
-- DELETE FROM notification_templates WHERE channel = 'whatsapp' AND event IN ('payment_receipt', 'payment_reminder');
