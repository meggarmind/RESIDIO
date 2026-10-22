-- One WhatsApp payment reminder per invoice per day (#1035).
--
-- WHAT CHANGES
--   A partial unique index on notification_queue(deduplication_key) for keys starting
--   'invoice-reminder:'. The reminder cron queues WhatsApp rows with the key
--   invoice-reminder:<invoice_id>:<yyyy-mm-dd>, so two overlapping runs on the same day (a manual
--   re-run while the first is still sending) cannot both queue a row: the second insert fails with
--   23505 and addToQueue reports it as a duplicate. Mirrors notification_queue_invoice_generated_key.
--   No existing row carries this prefix (the key was introduced with this change), so the index
--   builds without conflicts.
--
-- IDEMPOTENT: CREATE UNIQUE INDEX IF NOT EXISTS.
--
-- ROLLBACK:
--   DROP INDEX IF EXISTS public.notification_queue_invoice_reminder_key;
--   The application code keeps working without it; overlapping same-day runs can then double-queue.
--
-- VERIFY (run on the database after applying):
--   SELECT count(*) FROM pg_indexes WHERE indexname = 'notification_queue_invoice_reminder_key';  -- expect 1

CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_invoice_reminder_key
  ON public.notification_queue (deduplication_key)
  WHERE deduplication_key IS NOT NULL
    AND deduplication_key LIKE 'invoice-reminder:%';
