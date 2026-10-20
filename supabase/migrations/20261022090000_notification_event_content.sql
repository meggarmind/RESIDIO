-- #907: admin-editable wording for the five real resident emails.
--
-- notification_templates becomes the store for per-event wording overrides.
-- `event` links a row to the code-side registry (src/lib/notifications/event-content-registry.ts);
-- `overrides` holds only the fields an admin changed, so an empty object means "use the code default".
-- The ten template rows no email sender ever read are removed. Their FK dependants are safe:
-- notification_schedules (CASCADE) and notification_queue (SET NULL) have no rows on either database;
-- notification_history.template_id is SET NULL, so old history rows simply lose the link.

ALTER TABLE notification_templates
  ADD COLUMN event text,
  ADD COLUMN overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE notification_templates SET event = 'welcome_resident'            WHERE name = 'welcome_resident';
UPDATE notification_templates SET event = 'payment_receipt'             WHERE name = 'payment_received';
UPDATE notification_templates SET event = 'payment_reminder'            WHERE name = 'invoice_reminder';
UPDATE notification_templates SET event = 'payment_reminder_escalated'  WHERE name = 'invoice_overdue';
UPDATE notification_templates SET event = 'invoice_generated'           WHERE name = 'invoice_generated';

DELETE FROM notification_templates WHERE event IS NULL;

CREATE UNIQUE INDEX notification_templates_event_channel_key
  ON notification_templates (event, channel);

-- ROLLBACK (manual; the deleted rows are not restored by this block, they came from the seed migrations):
-- DROP INDEX IF EXISTS notification_templates_event_channel_key;
-- ALTER TABLE notification_templates DROP COLUMN IF EXISTS overrides, DROP COLUMN IF EXISTS event;
