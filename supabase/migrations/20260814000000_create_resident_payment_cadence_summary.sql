-- Precomputed payment-cadence classification per resident, refreshed nightly via
-- /api/cron/refresh-payment-cadence. Avoids reclassifying thousands of payment_records
-- rows on every Analytics page load.
CREATE TABLE IF NOT EXISTS public.resident_payment_cadence_summary (
  resident_id UUID PRIMARY KEY REFERENCES public.residents(id) ON DELETE CASCADE,
  cadence TEXT NOT NULL CHECK (cadence IN ('monthly', 'annual', 'irregular', 'insufficient_data')),
  payment_count INTEGER NOT NULL,
  median_gap_days INTEGER,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

CREATE INDEX IF NOT EXISTS idx_resident_payment_cadence_summary_cadence
  ON public.resident_payment_cadence_summary (cadence);

ALTER TABLE public.resident_payment_cadence_summary ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.resident_payment_cadence_summary FROM anon;
GRANT SELECT ON TABLE public.resident_payment_cadence_summary TO authenticated;
GRANT ALL ON TABLE public.resident_payment_cadence_summary TO service_role;

CREATE POLICY "Authenticated users can view payment cadence summary"
  ON public.resident_payment_cadence_summary FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "resident_payment_cadence_summary_service_role_all"
  ON public.resident_payment_cadence_summary FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE public.resident_payment_cadence_summary IS
  'Nightly-refreshed summary of each resident''s payment cadence classification (monthly/annual/irregular/insufficient_data), computed from payment_records by /api/cron/refresh-payment-cadence.';
