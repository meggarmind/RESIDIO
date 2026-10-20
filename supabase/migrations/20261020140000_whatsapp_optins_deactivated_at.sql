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
--   backfill        covers only active links whose number still has a whatsapp_pending_contacts row
--                   'attached' to that same resident (LINK redemption marks it; the admin "attach"
--                   action creates no opt-in row, so such a match was made with a code). Any other
--                   pre-existing off-roster LINK-code link (no pending row was left, or the row now
--                   points at another resident) is not backfilled and needs a fresh code
--
-- VERIFY (run on the database after applying):
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'whatsapp_optins'
--      AND column_name IN ('deactivated_at', 'link_verified_at');
--     -- expect 2 rows
--   SELECT count(*) FROM public.whatsapp_optins o
--     JOIN public.whatsapp_pending_contacts pc
--       ON pc.resident_id = o.resident_id AND pc.phone_number = o.phone_number AND pc.status = 'attached'
--    WHERE o.deactivated_at IS NULL AND o.link_verified_at IS NULL;
--     -- expect 0 (every link the backfill covers was marked; it cannot detect uncovered ones)
--
-- ROLLBACK (revert the TS callers first, then):
--   DROP INDEX IF EXISTS public.idx_whatsapp_optins_phone_active;
--   ALTER TABLE public.whatsapp_optins DROP COLUMN IF EXISTS link_verified_at;
--   ALTER TABLE public.whatsapp_optins DROP COLUMN IF EXISTS deactivated_at;

ALTER TABLE public.whatsapp_optins
  ADD COLUMN IF NOT EXISTS deactivated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS link_verified_at TIMESTAMPTZ;

UPDATE public.whatsapp_optins o
   SET link_verified_at = pc.updated_at
  FROM public.whatsapp_pending_contacts pc
 WHERE pc.resident_id = o.resident_id
   AND pc.phone_number = o.phone_number
   AND pc.status = 'attached'
   AND o.deactivated_at IS NULL
   AND o.link_verified_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_optins_phone_active
  ON public.whatsapp_optins (phone_number)
  WHERE deactivated_at IS NULL;
