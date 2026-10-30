-- Issue #1340: auto-record matched bank-alert payments at or below the limit on the scheduled
-- email import.
--
-- WHAT CHANGES
--   1. email_messages.sender_verified (boolean, null = not checked): whether Gmail's
--      Authentication-Results header proves the alert came from FirstBank (dkim=pass for a
--      FirstBank domain) or from a forwarding address in the sender list. Only a message with
--      sender_verified = true can become a payment with no admin step.
--   2. email_messages.sender_check (text): what passed, or why the check failed.
--   3. email_transactions.review_reason (text): why the scheduled run left a credit for review
--      instead of recording it (for now, a failed sender check).
--
-- Adds nullable columns only. No row is changed, nothing is dropped or deleted, and who can see
-- or do what is unchanged (the existing email_messages / email_transactions RLS covers the new
-- columns).
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS.
--
-- ROLLBACK:
-- BEGIN;
-- ALTER TABLE public.email_transactions DROP COLUMN IF EXISTS review_reason;
-- ALTER TABLE public.email_messages DROP COLUMN IF EXISTS sender_check;
-- ALTER TABLE public.email_messages DROP COLUMN IF EXISTS sender_verified;
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT table_name, column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND (table_name, column_name) IN (('email_messages', 'sender_verified'),
--                                        ('email_messages', 'sender_check'),
--                                        ('email_transactions', 'review_reason'))
--    ORDER BY 1, 2;
--     -- email_messages     | sender_check    | text    | YES
--     -- email_messages     | sender_verified | boolean | YES
--     -- email_transactions | review_reason   | text    | YES

ALTER TABLE public.email_messages
  ADD COLUMN IF NOT EXISTS sender_verified BOOLEAN,
  ADD COLUMN IF NOT EXISTS sender_check TEXT;

COMMENT ON COLUMN public.email_messages.sender_verified IS
  'Sender check (#1340): true when Authentication-Results proves FirstBank or a listed forwarding address sent it; null = not checked.';
COMMENT ON COLUMN public.email_messages.sender_check IS
  'Sender check (#1340): what passed, or why the check failed.';

ALTER TABLE public.email_transactions
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

COMMENT ON COLUMN public.email_transactions.review_reason IS
  'Why the scheduled run queued this credit instead of recording it (#1340), e.g. a failed sender check.';
