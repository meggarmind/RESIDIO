-- #907: admin-editable wording for the five real resident emails.
--
-- notification_templates becomes the store for per-event wording overrides.
-- `event` links a row to the code-side registry (src/lib/notifications/event-content-registry.ts);
-- `overrides` holds only the fields an admin changed, so an empty object means "use the code default".
-- Rows that no email sender ever read are removed. Those rows came from the fixture
-- supabase/fixtures/14-notifications.sql, not from a migration. Their FK dependants are safe:
-- notification_schedules (CASCADE) and notification_queue (SET NULL) have no rows on either database;
-- notification_history.template_id is SET NULL, so old history rows simply lose the link.
-- A fresh database has no fixture rows, so the final INSERT creates the five (event, 'email') rows.

ALTER TABLE notification_templates
  ADD COLUMN IF NOT EXISTS event text,
  ADD COLUMN IF NOT EXISTS overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE notification_templates SET event = 'welcome_resident'            WHERE name = 'welcome_resident'  AND event IS NULL;
UPDATE notification_templates SET event = 'payment_receipt'             WHERE name = 'payment_received'  AND event IS NULL;
UPDATE notification_templates SET event = 'payment_reminder'            WHERE name = 'invoice_reminder'  AND event IS NULL;
UPDATE notification_templates SET event = 'payment_reminder_escalated'  WHERE name = 'invoice_overdue'   AND event IS NULL;
UPDATE notification_templates SET event = 'invoice_generated'           WHERE name = 'invoice_generated' AND event IS NULL;

DELETE FROM notification_templates WHERE event IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notification_templates_event_channel_key
  ON notification_templates (event, channel);

-- body_template is NOT NULL but unused for these events: the wording lives in code defaults plus `overrides`.
INSERT INTO notification_templates (name, display_name, category, channel, body_template, event, is_system, is_active)
VALUES
  ('welcome_resident',  'Welcome email',                'general', 'email', '', 'welcome_resident',           true, true),
  ('payment_received',  'Payment receipt',              'payment', 'email', '', 'payment_receipt',            true, true),
  ('invoice_reminder',  'Payment reminder (manual)',    'invoice', 'email', '', 'payment_reminder',           true, true),
  ('invoice_overdue',   'Payment reminder (escalating)','invoice', 'email', '', 'payment_reminder_escalated', true, true),
  ('invoice_generated', 'New invoice',                  'invoice', 'email', '', 'invoice_generated',          true, true)
ON CONFLICT (event, channel) DO NOTHING;

-- ROLLBACK (manual; the deleted fixture rows are not restored by this block):
-- DROP INDEX IF EXISTS notification_templates_event_channel_key;
-- ALTER TABLE notification_templates DROP COLUMN IF EXISTS overrides, DROP COLUMN IF EXISTS event;
