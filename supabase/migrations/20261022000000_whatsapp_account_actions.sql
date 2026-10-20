-- WhatsApp account actions (#816): report a payment, request a clearance certificate, and the
-- state they need.
--
-- WHAT CHANGES
--   1. whatsapp_sessions.draft JSONB: the answers collected so far in a multi-step chat flow
--      (a payment report, a new email address). Cleared when the flow ends or the session expires.
--   2. approval_request_type gains whatsapp_payment_report and clearance_certificate_request.
--   3. approval_requests.requested_by becomes nullable and requested_by_resident_id is added. A
--      resident asking over WhatsApp has no admin profile, so the request names the resident
--      instead. Every existing row keeps its requested_by; the maker-checker rule and the
--      requester notification already treat a missing requested_by as "no admin requester".
--   4. payment_records.whatsapp_report_key TEXT with a partial UNIQUE index: set only on a payment
--      a resident reported over WhatsApp, as `<house_id>|<amount in kobo>|<YYYY-MM-DD>`. The index
--      refuses the same amount, date and property reported twice, even from two chats at once.
--      A rejected report clears its key so the resident can report it again correctly.
--   5. The "Clearance certificates" document category (not resident accessible): every issued
--      certificate is saved under it with the house it covers.
--   6. clearance_certificate_copies: one row per (issued certificate, copy recipient) with the
--      message that was or should be sent. A copy that failed stays visible in the WhatsApp
--      operations console with a Retry; a failed copy never blocks the resident's own certificate.
--      service_role only, like the other WhatsApp tables.
--
-- WHY
--   Residents ask the estate office by phone to report a transfer or get a clearance certificate.
--   Both are now requested in chat and decided by an admin in Approvals.
--
-- IDEMPOTENT: ADD VALUE IF NOT EXISTS, ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS,
--   ON CONFLICT DO NOTHING for the category.
--
-- ROLLBACK (the two enum values stay: Postgres cannot drop an enum value):
--   BEGIN;
--   DELETE FROM public.approval_requests WHERE requested_by IS NULL;
--   ALTER TABLE public.approval_requests DROP COLUMN IF EXISTS requested_by_resident_id;
--   ALTER TABLE public.approval_requests ALTER COLUMN requested_by SET NOT NULL;
--   DROP TABLE IF EXISTS public.clearance_certificate_copies;
--   DROP INDEX IF EXISTS public.payment_records_whatsapp_report_key_key;
--   ALTER TABLE public.payment_records DROP COLUMN IF EXISTS whatsapp_report_key;
--   ALTER TABLE public.whatsapp_sessions DROP COLUMN IF EXISTS draft;
--   DELETE FROM public.document_categories WHERE name = 'Clearance certificates'
--     AND NOT EXISTS (SELECT 1 FROM public.documents d WHERE d.category_id = document_categories.id);
--   COMMIT;
--   Roll the application code back first: it writes these columns.
--
-- VERIFY (run on the database after applying):
--   SELECT is_nullable FROM information_schema.columns
--     WHERE table_name = 'approval_requests' AND column_name = 'requested_by';        -- expect YES
--   SELECT enumlabel FROM pg_enum WHERE enumtypid = 'public.approval_request_type'::regtype
--     AND enumlabel IN ('whatsapp_payment_report', 'clearance_certificate_request'); -- expect 2 rows
--   SELECT indexdef FROM pg_indexes WHERE indexname = 'payment_records_whatsapp_report_key_key';
--   SELECT is_resident_accessible FROM public.document_categories
--     WHERE name = 'Clearance certificates';                                          -- expect false
--   SELECT has_table_privilege('authenticated', 'public.clearance_certificate_copies', 'SELECT');  -- expect false

ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS draft JSONB;

ALTER TYPE public.approval_request_type ADD VALUE IF NOT EXISTS 'whatsapp_payment_report';
ALTER TYPE public.approval_request_type ADD VALUE IF NOT EXISTS 'clearance_certificate_request';

ALTER TABLE public.approval_requests
  ALTER COLUMN requested_by DROP NOT NULL;
ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS requested_by_resident_id UUID REFERENCES public.residents(id) ON DELETE SET NULL;

ALTER TABLE public.payment_records
  ADD COLUMN IF NOT EXISTS whatsapp_report_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payment_records_whatsapp_report_key_key
  ON public.payment_records (whatsapp_report_key)
  WHERE whatsapp_report_key IS NOT NULL;

INSERT INTO public.document_categories (name, description, is_resident_accessible, is_active)
VALUES ('Clearance certificates', 'Clearance certificates issued when a resident moves out or asks for one', false, true)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.clearance_certificate_copies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  recipient_resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('sent', 'failed')),
  error TEXT,
  attempts INTEGER NOT NULL DEFAULT 1,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT clearance_certificate_copies_document_recipient_key UNIQUE (document_id, recipient_resident_id)
);

CREATE INDEX IF NOT EXISTS idx_clearance_certificate_copies_failed
  ON public.clearance_certificate_copies (created_at DESC)
  WHERE status = 'failed';

ALTER TABLE public.clearance_certificate_copies ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.clearance_certificate_copies FROM anon, authenticated;
GRANT ALL ON TABLE public.clearance_certificate_copies TO service_role;
DROP POLICY IF EXISTS "clearance_certificate_copies_service_role_all" ON public.clearance_certificate_copies;
CREATE POLICY "clearance_certificate_copies_service_role_all"
  ON public.clearance_certificate_copies FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.clearance_certificate_copies IS
  'WhatsApp copies of issued clearance certificates to the selected recipient group, and the ones that failed (#816).';
