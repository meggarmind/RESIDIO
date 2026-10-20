-- Migration: deactivate stale WhatsApp links (issue #849)
--
-- A whatsapp_optins row links a phone number to a resident and wins over a roster match, so a
-- link survived a phone change and the old number's holder kept the resident's financial answers.
-- deactivated_at marks a link as no longer in force without deleting it, so the consent history
-- (opted_in_at / opted_out_at) is kept. link_verified_at records that the link was made with a
-- LINK code, which verifies a number that is not on the resident's roster (e.g. a spouse's phone):
--
--   updateResident  sets deactivated_at and clears link_verified_at on the rows for numbers
--                   removed from the resident's roster
--   readers         (findLinkedResidents, getOptIn, send-time and enqueue-time consent checks,
--                   announcement delivery, bulk import) ignore rows where deactivated_at is set
--   setOptIn        clears deactivated_at, so a re-link (LINK code) or YES restores the row;
--                   LINK-code redemption also sets link_verified_at
--   financial tier  only when the number is on the resident's roster or link_verified_at is set
--
-- ROLLBACK (revert the TS callers first, then):
--   DROP INDEX IF EXISTS public.idx_whatsapp_optins_phone_active;
--   ALTER TABLE public.whatsapp_optins DROP COLUMN IF EXISTS link_verified_at;
--   ALTER TABLE public.whatsapp_optins DROP COLUMN IF EXISTS deactivated_at;

ALTER TABLE public.whatsapp_optins
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_verified_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_optins_phone_active
  ON public.whatsapp_optins (phone_number)
  WHERE deactivated_at IS NULL;
