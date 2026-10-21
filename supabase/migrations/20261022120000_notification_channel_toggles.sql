-- #909: per-event channel switches reuse notification_templates.is_active (no new column).
--
-- Senders now skip a channel whose (event, channel) row has is_active = false. Before this change
-- nothing read is_active on these rows, so a stray false would silently stop a message the moment
-- the code deploys. Normalise the rows the switches control to true so defaults match today's sends.

UPDATE notification_templates
SET is_active = true
WHERE is_active IS DISTINCT FROM true
  AND (
    (event IN ('payment_receipt', 'welcome_resident', 'invoice_generated') AND channel = 'email')
    OR (event = 'payment_receipt' AND channel = 'whatsapp')
  );

-- ROLLBACK: none needed. The update only sets the default (true) and records nothing to restore.
