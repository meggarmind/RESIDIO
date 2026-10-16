-- Migration: Per-resident communications override flag (#713, #716)
-- Purpose: let an admin opt one resident in or out of the send-time redirect.
--   NULL  = follow the environment default (non-production: redirect; production: send real)
--   true  = always redirect this resident's messages (while the global switch applies)
--   false = send to the real recipient (Debug Mode still redirects)
-- Nullable, no default, no backfill: every existing row stays NULL and follows the environment default.
-- Idempotent: IF NOT EXISTS, so re-applying changes nothing.

ALTER TABLE public.residents
  ADD COLUMN IF NOT EXISTS use_override_comms boolean;

COMMENT ON COLUMN public.residents.use_override_comms IS
  'Communications override flag (#713). NULL = follow the environment default (non-production: redirect outbound email/SMS/WhatsApp to the override contacts; production: send to the real recipient). true = redirect, false = send to the real recipient. Only users with settings.manage_general may change it. Debug Mode redirects regardless.';

-- ROLLBACK:
-- ALTER TABLE public.residents DROP COLUMN IF EXISTS use_override_comms;
