-- WhatsApp identity read-back and privacy-notice consent (#871).
--
-- WHAT CHANGES
--   1. CREATE TABLE public.whatsapp_consent_decisions: one row per resident decision made in chat --
--      identity_confirmed / identity_disputed (the "Is that you?" read-back) and privacy_accepted /
--      privacy_declined (the privacy notice), with the phone number, notice version, the provider
--      message id that carried the decision, and the time. Permanent: service_role gets SELECT and
--      INSERT only, like whatsapp_disclosure_logs; anon and authenticated get nothing.
--   2. whatsapp_pending_contacts.status gains 'disputed' (a number whose holder answered "No, not
--      me") and 'cleared' (an admin reviewed the dispute in the WhatsApp console).
--   3. ADD COLUMN whatsapp_sessions.consent_step TEXT and whatsapp_sessions.pending_request TEXT:
--      which consent prompt the number was last shown, and the request to answer once it is accepted.
--      Both are transient and go with the session under the existing retention purge.
--   4. system_settings rows whatsapp_privacy_notice_version and whatsapp_privacy_notice_text, seeded
--      with a DRAFT notice. The wording needs exco sign-off before launch (Settings > WhatsApp).
--   5. A private storage bucket whatsapp-media for the notice PDF sent in chat by signed URL.
--
-- WHY
--   The assistant named whoever held a matched number and used the resident's records with only an
--   alerts opt-in. Under the Nigeria Data Protection Act 2023 the estate must be able to show, per
--   resident, which notice was shown and accepted. Owner requirements 2026-10-20 (#871).
--
-- WHO IS AFFECTED
--   Every WhatsApp resident, including admin-imported opt-ins, is asked to confirm the read-back and
--   accept the notice on their next message before any record is used. STOP and START are unchanged.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, constraint drop-and-add, ADD COLUMN IF NOT EXISTS,
--   ON CONFLICT DO NOTHING for the settings and bucket; REVOKE/GRANT are repeatable.
--
-- ROLLBACK (loses every recorded consent decision; export the table first):
--   BEGIN;
--   DROP TABLE IF EXISTS public.whatsapp_consent_decisions;
--   UPDATE public.whatsapp_pending_contacts SET status = 'ignored' WHERE status IN ('disputed', 'cleared');
--   ALTER TABLE public.whatsapp_pending_contacts DROP CONSTRAINT IF EXISTS whatsapp_pending_contacts_status_check;
--   ALTER TABLE public.whatsapp_pending_contacts ADD CONSTRAINT whatsapp_pending_contacts_status_check
--     CHECK (status IN ('pending', 'attached', 'ignored'));
--   ALTER TABLE public.whatsapp_sessions DROP COLUMN IF EXISTS consent_step, DROP COLUMN IF EXISTS pending_request;
--   DELETE FROM public.system_settings WHERE key IN ('whatsapp_privacy_notice_version', 'whatsapp_privacy_notice_text');
--   COMMIT;
--   The bucket is left in place (storage objects cannot be dropped from SQL); empty it in the dashboard.
--   Roll the application code back first: it fails closed (no records used) without the table.
--
-- VERIFY (run on the database after applying):
--   SELECT has_table_privilege('service_role', 'public.whatsapp_consent_decisions', 'INSERT') AS ins,
--          has_table_privilege('service_role', 'public.whatsapp_consent_decisions', 'UPDATE') AS upd,
--          has_table_privilege('service_role', 'public.whatsapp_consent_decisions', 'DELETE') AS del,
--          has_table_privilege('authenticated', 'public.whatsapp_consent_decisions', 'SELECT') AS auth_sel;
--     -- expect true, false, false, false
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conname = 'whatsapp_pending_contacts_status_check';
--     -- expect pending, attached, ignored, disputed, cleared
--   SELECT key FROM public.system_settings WHERE key LIKE 'whatsapp_privacy_notice_%';  -- expect 2 rows
--   SELECT public FROM storage.buckets WHERE id = 'whatsapp-media';                     -- expect false

CREATE TABLE IF NOT EXISTS public.whatsapp_consent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
  phone_number TEXT NOT NULL,
  decision TEXT NOT NULL,
  notice_version TEXT,
  identity_fingerprint TEXT,
  provider_message_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT whatsapp_consent_decisions_decision_check CHECK (
    decision IN ('identity_confirmed', 'identity_disputed', 'privacy_accepted', 'privacy_declined')
  ),
  CONSTRAINT whatsapp_consent_decisions_version_check CHECK (
    decision NOT IN ('privacy_accepted', 'privacy_declined') OR notice_version IS NOT NULL
  ),
  CONSTRAINT whatsapp_consent_decisions_fingerprint_check CHECK (
    decision <> 'identity_confirmed' OR identity_fingerprint IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_consent_decisions_lookup
  ON public.whatsapp_consent_decisions (resident_id, phone_number, created_at DESC);

ALTER TABLE public.whatsapp_consent_decisions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.whatsapp_consent_decisions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.whatsapp_consent_decisions TO service_role;

DROP POLICY IF EXISTS "whatsapp_consent_decisions_service_role_all" ON public.whatsapp_consent_decisions;
CREATE POLICY "whatsapp_consent_decisions_service_role_all"
  ON public.whatsapp_consent_decisions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

ALTER TABLE public.whatsapp_pending_contacts
  DROP CONSTRAINT IF EXISTS whatsapp_pending_contacts_status_check;

ALTER TABLE public.whatsapp_pending_contacts
  ADD CONSTRAINT whatsapp_pending_contacts_status_check
  CHECK (status IN ('pending', 'attached', 'ignored', 'disputed', 'cleared'));

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS consent_step TEXT,
  ADD COLUMN IF NOT EXISTS pending_request TEXT;

INSERT INTO public.system_settings (key, value, description, category)
VALUES
  (
    'whatsapp_privacy_notice_version',
    to_jsonb('draft-1'::text),
    'Version of the WhatsApp privacy notice residents accept; changing it re-shows the notice',
    'notifications'
  ),
  (
    'whatsapp_privacy_notice_text',
    to_jsonb('DRAFT - awaiting exco sign-off. The estate uses your resident record (name, property, invoices, payments and wallet) to answer questions you send to the estate WhatsApp assistant. Messages are delivered through WhatsApp (Meta) and our messaging provider (Chatmaid). Contact the estate office to ask about, correct or withdraw your data.'::text),
    'Full text of the WhatsApp privacy notice, sent as a PDF in chat',
    'notifications'
  )
ON CONFLICT (key) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('whatsapp-media', 'whatsapp-media', false)
ON CONFLICT (id) DO NOTHING;
