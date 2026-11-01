-- Approve sign-ins on WhatsApp (#1389, parent #1388).
--
-- WHAT CHANGES
--   1. ADD COLUMN public.whatsapp_admin_bindings.approve_sign_ins BOOLEAN NOT NULL DEFAULT false: the
--      admin's own "Approve sign-ins on WhatsApp" switch. It lives on the binding, like code_required
--      (#1292), so it can exist only while a WhatsApp number is linked, and it ends with the binding
--      (unlink, role change or a new authenticator all end the binding). The table is service_role
--      only, so no client can turn it on outside the server action. Existing bindings stay off.
--   2. CREATE TABLE public.two_factor_whatsapp_requests: one row per sign-in approval request. After
--      the password, the server creates a row for the signed-in user and their login session
--      (supabase_session_id, the `session_id` claim of the login token), with a 2-digit match code
--      and 2 decoy codes, and sends a WhatsApp poll. The admin's answer (poll vote or typed reply)
--      sets status approved or denied. expires_at is 2 minutes after created_at. marker_issued_at
--      makes an approval set the residio_2fa marker once only.
--      One pending row per admin (partial unique index): the server marks the old pending row
--      'superseded' before it adds a new one. The 5-per-15-minutes limit is counted from this table.
--   New table is service_role only, like the other two-factor tables: RLS on, no anon or
--   authenticated grant, no client policy.
--   two_factor_audit_log is not changed: events are written as existing actions with metadata.event
--   (the backup-code send precedent), so its CHECK list stays as it is.
--
-- WHY
--   Older admins find a 6-digit authenticator code hard. The owner chose approve-on-WhatsApp with a
--   number match (Option B, typed number as fallback). The authenticator stays as the fallback.
--
-- DEPLOY ORDER: apply this migration before deploying the application code that reads the new column
--   and table. Applying it first is safe: the old code does not touch them.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, CREATE ... IF NOT EXISTS, DROP POLICY IF EXISTS.
--
-- ROLLBACK (loses the switch values and the short-lived requests):
--   BEGIN;
--   DROP TABLE IF EXISTS public.two_factor_whatsapp_requests;
--   ALTER TABLE public.whatsapp_admin_bindings DROP COLUMN IF EXISTS approve_sign_ins;
--   COMMIT;
--   Roll the application code back first: it reads and writes both.
--
-- VERIFY (run on the database after applying):
--   SELECT has_table_privilege('authenticated', 'public.two_factor_whatsapp_requests', 'SELECT');  -- expect false
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.two_factor_whatsapp_requests'::regclass;  -- expect true
--   SELECT count(*) FROM public.whatsapp_admin_bindings WHERE approve_sign_ins;  -- expect 0
--   SELECT indexname FROM pg_indexes WHERE indexname = 'two_factor_whatsapp_requests_one_pending';  -- expect 1 row

ALTER TABLE public.whatsapp_admin_bindings
  ADD COLUMN IF NOT EXISTS approve_sign_ins BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.two_factor_whatsapp_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  supabase_session_id UUID NOT NULL,
  match_code CHAR(2) NOT NULL,
  decoy_codes TEXT[] NOT NULL,
  poll_message_id TEXT,
  -- The last segment of poll_message_id (`true_<chat>_<key>`): a vote can name the chat by a hidden
  -- @lid id instead of the @c.us id, so votes are matched on this part.
  poll_message_key TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  user_agent_summary TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc', now()) + interval '2 minutes'),
  decided_at TIMESTAMPTZ,
  decided_via TEXT,
  marker_issued_at TIMESTAMPTZ,
  CONSTRAINT two_factor_whatsapp_requests_status_check
    CHECK (status IN ('pending', 'approved', 'denied', 'expired', 'superseded')),
  CONSTRAINT two_factor_whatsapp_requests_match_code_check CHECK (match_code ~ '^[0-9]{2}$'),
  CONSTRAINT two_factor_whatsapp_requests_decoys_check
    CHECK (array_length(decoy_codes, 1) = 2 AND NOT (match_code = ANY (decoy_codes))),
  CONSTRAINT two_factor_whatsapp_requests_decided_via_check
    CHECK (decided_via IS NULL OR decided_via IN ('poll', 'text')),
  CONSTRAINT two_factor_whatsapp_requests_marker_check
    CHECK (marker_issued_at IS NULL OR status = 'approved')
);

CREATE UNIQUE INDEX IF NOT EXISTS two_factor_whatsapp_requests_one_pending
  ON public.two_factor_whatsapp_requests (profile_id)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_two_factor_whatsapp_requests_profile_created
  ON public.two_factor_whatsapp_requests (profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_two_factor_whatsapp_requests_poll_key
  ON public.two_factor_whatsapp_requests (poll_message_key)
  WHERE poll_message_key IS NOT NULL;

ALTER TABLE public.two_factor_whatsapp_requests ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.two_factor_whatsapp_requests FROM anon, authenticated;
GRANT ALL ON TABLE public.two_factor_whatsapp_requests TO service_role;

DROP POLICY IF EXISTS "two_factor_whatsapp_requests_service_role_all" ON public.two_factor_whatsapp_requests;
CREATE POLICY "two_factor_whatsapp_requests_service_role_all"
  ON public.two_factor_whatsapp_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
