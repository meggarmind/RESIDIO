-- WhatsApp statement requests can end 'failed' (#1252).
--
-- WHAT CHANGES
--   whatsapp_statement_requests.status CHECK gains 'failed': sent / awaiting_email / queued /
--   cancelled / failed. A statement email that the notification queue gave up on (no attempts
--   left) moves its request queued -> failed, and the resident is told on WhatsApp.
--
-- WHY
--   Before this a failed statement email left the request 'queued' for ever and the resident
--   was never told. The status makes the final failure visible and guards the one notice.
--
-- IDEMPOTENT: DROP CONSTRAINT IF EXISTS, then ADD CONSTRAINT.
--
-- ROLLBACK (move any 'failed' rows first, or the re-added constraint is refused):
--   BEGIN;
--   UPDATE public.whatsapp_statement_requests SET status = 'cancelled' WHERE status = 'failed';
--   ALTER TABLE public.whatsapp_statement_requests DROP CONSTRAINT IF EXISTS whatsapp_statement_requests_status_check;
--   ALTER TABLE public.whatsapp_statement_requests
--     ADD CONSTRAINT whatsapp_statement_requests_status_check CHECK (status IN ('sent', 'awaiting_email', 'queued', 'cancelled'));
--   COMMIT;
--   Roll the application code back first: it writes the 'failed' status.
--
-- VERIFY (run on the database after applying):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--     WHERE conrelid = 'public.whatsapp_statement_requests'::regclass AND conname = 'whatsapp_statement_requests_status_check';
--   -- expect a list containing 'failed'

ALTER TABLE public.whatsapp_statement_requests DROP CONSTRAINT IF EXISTS whatsapp_statement_requests_status_check;
ALTER TABLE public.whatsapp_statement_requests
  ADD CONSTRAINT whatsapp_statement_requests_status_check CHECK (status IN ('sent', 'awaiting_email', 'queued', 'cancelled', 'failed'));
