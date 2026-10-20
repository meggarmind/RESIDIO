-- WhatsApp Assistant satisfaction survey (#872, part of #794).
--
-- WHAT CHANGES
--   1. CREATE TABLE public.whatsapp_survey_responses: one row each time a resident is asked
--      "How was Residio Assistant today?". score stays NULL until they answer; reason is set only
--      for a Poor score; comment is the optional free-text line. asked_at also drives the
--      "at most once every 30 days per resident" rule, so an ignored survey still counts.
--   2. CREATE TABLE public.whatsapp_survey_opt_outs: residents who sent STOP SURVEYS. One row per
--      resident; the assistant never asks them again.
--   Both are service_role only, like the other WhatsApp tables; anon and authenticated get nothing.
--
-- WHY
--   Exco sees errors but not where residents give up or what confuses them. The operations console
--   reads the last 30 days of scores and reasons from this table.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, constraint and policy drop-and-add.
--
-- ROLLBACK (loses the survey history; export the table first):
--   BEGIN;
--   DROP TABLE IF EXISTS public.whatsapp_survey_responses;
--   DROP TABLE IF EXISTS public.whatsapp_survey_opt_outs;
--   COMMIT;
--   Roll the application code back first: it reads and writes both tables.
--
-- VERIFY (run on the database after applying):
--   SELECT has_table_privilege('authenticated', 'public.whatsapp_survey_responses', 'SELECT');  -- expect false
--   SELECT has_table_privilege('authenticated', 'public.whatsapp_survey_opt_outs', 'SELECT');   -- expect false
--   SELECT has_table_privilege('service_role', 'public.whatsapp_survey_responses', 'INSERT');   -- expect true

CREATE TABLE IF NOT EXISTS public.whatsapp_survey_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID NOT NULL REFERENCES public.residents(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  -- What made the assistant ask: a thank-you after a financial answer, or an accepted request.
  trigger TEXT NOT NULL CHECK (trigger IN ('answer', 'payment_report', 'clearance_request')),
  score TEXT CHECK (score IN ('good', 'okay', 'poor')),
  reason TEXT CHECK (reason IN ('too_slow', 'not_found', 'wrong_information', 'other')),
  comment TEXT CHECK (comment IS NULL OR char_length(comment) <= 300),
  asked_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  answered_at TIMESTAMPTZ,
  CONSTRAINT whatsapp_survey_reason_only_when_poor CHECK (reason IS NULL OR score = 'poor')
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_survey_responses_resident
  ON public.whatsapp_survey_responses (resident_id, asked_at DESC);
CREATE INDEX IF NOT EXISTS idx_whatsapp_survey_responses_answered
  ON public.whatsapp_survey_responses (answered_at)
  WHERE score IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.whatsapp_survey_opt_outs (
  resident_id UUID PRIMARY KEY REFERENCES public.residents(id) ON DELETE CASCADE,
  opted_out_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.whatsapp_survey_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_survey_opt_outs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.whatsapp_survey_responses FROM anon, authenticated;
REVOKE ALL ON TABLE public.whatsapp_survey_opt_outs FROM anon, authenticated;
GRANT ALL ON TABLE public.whatsapp_survey_responses TO service_role;
GRANT ALL ON TABLE public.whatsapp_survey_opt_outs TO service_role;
DROP POLICY IF EXISTS "whatsapp_survey_responses_service_role_all" ON public.whatsapp_survey_responses;
CREATE POLICY "whatsapp_survey_responses_service_role_all"
  ON public.whatsapp_survey_responses FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "whatsapp_survey_opt_outs_service_role_all" ON public.whatsapp_survey_opt_outs;
CREATE POLICY "whatsapp_survey_opt_outs_service_role_all"
  ON public.whatsapp_survey_opt_outs FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.whatsapp_survey_responses IS
  'Satisfaction survey asked after a successful WhatsApp Assistant request; at most one per resident per 30 days (#872).';
COMMENT ON TABLE public.whatsapp_survey_opt_outs IS
  'Residents who sent STOP SURVEYS to the WhatsApp Assistant (#872).';
