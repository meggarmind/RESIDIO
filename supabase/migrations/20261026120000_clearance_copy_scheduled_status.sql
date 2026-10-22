-- A clearance certificate copy held back by a WhatsApp cap shows as scheduled, not failed (#1044).
--
-- WHAT CHANGES
--   clearance_certificate_copies.status accepts 'scheduled' as well as 'sent' and 'failed'. A copy
--   the daily or burst cap held back is queued to send automatically and recorded 'scheduled'; the
--   queue sets it to 'sent' or 'failed' once it is delivered or finally fails. The console's failed
--   list (status = 'failed') and its partial index are unchanged.
--
-- IDEMPOTENT: the constraint is dropped IF EXISTS and re-added.
--
-- ROLLBACK:
--   UPDATE public.clearance_certificate_copies SET status = 'failed' WHERE status = 'scheduled';
--   ALTER TABLE public.clearance_certificate_copies DROP CONSTRAINT IF EXISTS clearance_certificate_copies_status_check;
--   ALTER TABLE public.clearance_certificate_copies ADD CONSTRAINT clearance_certificate_copies_status_check
--     CHECK (status IN ('sent', 'failed'));
--
-- VERIFY (run on the database after applying):
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'clearance_certificate_copies_status_check';
--   -- expect CHECK ((status = ANY (ARRAY['sent'::text, 'failed'::text, 'scheduled'::text])))

ALTER TABLE public.clearance_certificate_copies DROP CONSTRAINT IF EXISTS clearance_certificate_copies_status_check;
ALTER TABLE public.clearance_certificate_copies ADD CONSTRAINT clearance_certificate_copies_status_check
  CHECK (status IN ('sent', 'failed', 'scheduled'));
