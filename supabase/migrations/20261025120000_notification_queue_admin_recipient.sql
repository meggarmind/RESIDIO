-- Notification queue rows addressed to an admin account, not a resident (#982).
--
-- WHAT CHANGES
--   1. notification_queue.recipient_id drops NOT NULL. It referenced residents(id), so a row could only
--      be addressed to a resident. A WhatsApp admin report goes to the admin's account email, and an
--      admin is a profile with no required resident record.
--   2. CHECK notification_queue_recipient_or_admin: recipient_id may be null only when
--      metadata carries admin_profile_id, so no other writer can queue a recipient-less row by mistake.
--      Every existing row has a recipient, so the constraint validates at once.
--   Readers were audited in the same change: the queue sender fails closed for a null recipient unless
--   metadata.admin_profile_id is set; history, the queue viewer and the resident-merge move already
--   tolerate null.
--
-- IDEMPOTENT: DROP NOT NULL is a no-op when already dropped; the constraint is dropped before it is added.
--
-- ROLLBACK (deletes any admin-addressed queue rows; they are transient):
--   BEGIN;
--   ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_recipient_or_admin;
--   DELETE FROM public.notification_queue WHERE recipient_id IS NULL;
--   ALTER TABLE public.notification_queue ALTER COLUMN recipient_id SET NOT NULL;
--   COMMIT;
--   Roll the application code back first: it queues rows with a null recipient.
--
-- VERIFY (run on the database after applying):
--   SELECT is_nullable FROM information_schema.columns
--     WHERE table_name = 'notification_queue' AND column_name = 'recipient_id';  -- expect YES
--   SELECT count(*) FROM pg_constraint WHERE conname = 'notification_queue_recipient_or_admin';  -- expect 1

ALTER TABLE public.notification_queue ALTER COLUMN recipient_id DROP NOT NULL;

ALTER TABLE public.notification_queue DROP CONSTRAINT IF EXISTS notification_queue_recipient_or_admin;
ALTER TABLE public.notification_queue
  ADD CONSTRAINT notification_queue_recipient_or_admin
  CHECK (recipient_id IS NOT NULL OR (metadata ? 'admin_profile_id'));
