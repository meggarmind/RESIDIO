CREATE TABLE IF NOT EXISTS public.invoice_generation_locks (
  period DATE PRIMARY KEY,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_by UUID
);

COMMENT ON TABLE public.invoice_generation_locks IS 'Prevents overlapping invoice generation runs for the same billing period';

ALTER TABLE public.invoice_generation_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view locks" ON public.invoice_generation_locks
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated users can manage locks" ON public.invoice_generation_locks
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
