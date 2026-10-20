-- Migration: deactivate stale WhatsApp links (issue #849)
--
-- A whatsapp_optins row links a phone number to a resident and wins over a roster match, so a
-- link survived a phone change and the old number's holder kept the resident's financial answers.
-- deactivated_at marks a link as no longer in force without deleting it, so the consent history
-- (opted_in_at / opted_out_at) is kept:
--
--   updateResident  sets it on the rows for numbers removed from the resident's roster
--   lookups         (findLinkedResidents, getOptIn) ignore rows where it is not NULL
--   setOptIn        clears it, so a re-link (LINK code) or YES restores the row
--
-- ROLLBACK (revert the TS callers first, then):
--   DROP INDEX IF EXISTS public.idx_whatsapp_optins_phone_active;
--   ALTER TABLE public.whatsapp_optins DROP COLUMN IF EXISTS deactivated_at;

ALTER TABLE public.whatsapp_optins
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_whatsapp_optins_phone_active
  ON public.whatsapp_optins (phone_number)
  WHERE deactivated_at IS NULL;
