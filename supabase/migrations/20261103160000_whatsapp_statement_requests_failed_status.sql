-- A WhatsApp statement email whose last send attempt failed is marked `failed` (#1252).
--
-- WHAT CHANGES
--   whatsapp_statement_requests.status CHECK also allows 'failed' (was sent / awaiting_email /
--   queued / cancelled). The request used to stay `queued` for ever when the email never left.
--
-- IDEMPOTENT: the constraint is dropped and added again.
--
-- ROLLBACK (move any failed rows back first, or the ADD CONSTRAINT fails):
--   BEGIN;
--   UPDATE public.whatsapp_statement_requests SET status = 'queued' WHERE status = 'failed';
--   ALTER TABLE public.whatsapp_statement_requests DROP CONSTRAINT IF EXISTS whatsapp_statement_requests_status_check;
--   ALTER TABLE public.whatsapp_statement_requests
--     ADD CONSTRAINT whatsapp_statement_requests_status_check CHECK (status IN ('sent', 'awaiting_email', 'queued', 'cancelled'));
--   COMMIT;
--   Roll the application code back first: it writes 'failed'.
--
-- VERIFY (run on the database after applying):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'whatsapp_statement_requests_status_check';  -- includes 'failed'

ALTER TABLE public.whatsapp_statement_requests DROP CONSTRAINT IF EXISTS whatsapp_statement_requests_status_check;
ALTER TABLE public.whatsapp_statement_requests
  ADD CONSTRAINT whatsapp_statement_requests_status_check CHECK (status IN ('sent', 'awaiting_email', 'queued', 'cancelled', 'failed'));
