-- Admin-issued WhatsApp PIN setup codes (#890, slice A of #805).
--
-- WHAT CHANGES
--   ADD COLUMN on public.whatsapp_link_tokens:
--     purpose          TEXT NOT NULL DEFAULT 'link', CHECK (purpose IN ('link', 'pin_setup'))
--     failed_attempts  INTEGER NOT NULL DEFAULT 0, CHECK (failed_attempts >= 0)
--     paused_until     TIMESTAMPTZ
--   Existing rows become purpose 'link', failed_attempts 0, paused_until NULL.
--
-- WHY
--   Owner decision 2026-10-20 (#805, "Harmonised with the conversation-flow spec"): a resident's
--   first PIN is set only with a 6-digit setup code issued by the estate office, valid 10 minutes,
--   with 3 wrong tries per code and then a 1-hour pause. Setup codes share the link-code table
--   (same hashing, same issuer, same expiry and single-use rules) and are told apart by purpose.
--   failed_attempts and paused_until hold the per-code wrong-try count and pause; the bot that
--   writes them is slice C. A link code ('link') behaves exactly as before: the LINK command only
--   accepts purpose 'link', so a setup code can never link a number.
--
-- WHO IS AFFECTED
--   Nobody directly. The table stays service_role only (RLS on, anon and authenticated revoked
--   in 20260811110000). Admins with whatsapp.manage issue codes from Settings > WhatsApp.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS (the inline CHECKs are only added with the column).
--
-- DEPLOY ORDER: apply this before the application code that writes purpose is deployed;
--   that code inserts and filters on purpose and fails without the column.
--
-- ROLLBACK (loses unused setup codes' purpose; roll the application code back first):
--   BEGIN;
--   DELETE FROM public.whatsapp_link_tokens WHERE purpose = 'pin_setup';
--   ALTER TABLE public.whatsapp_link_tokens
--     DROP COLUMN IF EXISTS purpose,
--     DROP COLUMN IF EXISTS failed_attempts,
--     DROP COLUMN IF EXISTS paused_until;
--   COMMIT;
--
-- VERIFY (run on the database after applying):
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'whatsapp_link_tokens'
--      AND column_name IN ('purpose', 'failed_attempts', 'paused_until')
--    ORDER BY column_name;
--     -- expect 3 rows: failed_attempts integer NO 0; paused_until timestamp with time zone YES null;
--     --                purpose text NO 'link'::text
--   SELECT purpose, count(*) FROM public.whatsapp_link_tokens GROUP BY purpose;
--     -- expect only 'link' until a setup code is issued
--
--   Constraint probe (changes nothing, ends in ROLLBACK):
--   BEGIN;
--   DO $probe$
--   DECLARE
--     v_resident uuid;
--   BEGIN
--     SELECT id INTO v_resident FROM public.residents LIMIT 1;
--     INSERT INTO public.whatsapp_link_tokens (resident_id, token_hash, expires_at)
--     VALUES (v_resident, 'probe-default', now() + interval '10 minutes');
--     IF (SELECT purpose FROM public.whatsapp_link_tokens WHERE token_hash = 'probe-default') <> 'link' THEN
--       RAISE EXCEPTION 'default purpose is not link';
--     END IF;
--     BEGIN
--       INSERT INTO public.whatsapp_link_tokens (resident_id, token_hash, expires_at, purpose)
--       VALUES (v_resident, 'probe-bad', now(), 'other');
--       RAISE EXCEPTION 'purpose check did not fire';
--     EXCEPTION WHEN check_violation THEN NULL;
--     END;
--     RAISE NOTICE 'setup code probe passed';
--   END
--   $probe$;
--   ROLLBACK;
--     -- expect NOTICE 'setup code probe passed' and no exception

BEGIN;

ALTER TABLE public.whatsapp_link_tokens
  ADD COLUMN IF NOT EXISTS purpose TEXT NOT NULL DEFAULT 'link'
    CHECK (purpose IN ('link', 'pin_setup')),
  ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0
    CHECK (failed_attempts >= 0),
  ADD COLUMN IF NOT EXISTS paused_until TIMESTAMPTZ;

COMMIT;
