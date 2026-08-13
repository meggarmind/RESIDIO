-- Durable, auditable invoice generation. This migration is deliberately
-- append-only: existing invoices retain their legacy profile snapshots.
-- Preflight before applying to an existing estate:
-- SELECT resident_id, house_id, billing_profile_id, period_start, period_end, count(*)
-- FROM public.invoices
-- WHERE billing_profile_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL
-- GROUP BY 1,2,3,4,5 HAVING count(*) > 1;

CREATE TABLE public.billing_profile_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_profile_id uuid NOT NULL REFERENCES public.billing_profiles(id) ON DELETE RESTRICT,
  effective_from date NOT NULL CHECK (effective_from = date_trunc('month', effective_from)::date),
  profile_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  approved_at timestamptz,
  is_locked boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (billing_profile_id, effective_from),
  CHECK ((approved_by IS NULL AND approved_at IS NULL) OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);

CREATE TABLE public.billing_profile_version_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_profile_version_id uuid NOT NULL REFERENCES public.billing_profile_versions(id) ON DELETE RESTRICT,
  name text NOT NULL,
  amount numeric NOT NULL CHECK (amount >= 0),
  frequency public.billing_frequency NOT NULL,
  is_mandatory boolean NOT NULL DEFAULT true,
  item_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX billing_profile_version_items_version_idx ON public.billing_profile_version_items (billing_profile_version_id);

ALTER TABLE public.invoices ADD COLUMN billing_profile_version_id uuid REFERENCES public.billing_profile_versions(id) ON DELETE RESTRICT;

-- Lock each existing mutable profile into an initial month-effective version.
WITH initial_versions AS (
  INSERT INTO public.billing_profile_versions (billing_profile_id, effective_from, profile_snapshot, is_locked)
  SELECT bp.id,
    date_trunc('month', COALESCE(bp.effective_date, bp.created_at::date))::date,
    jsonb_build_object('id', bp.id, 'name', bp.name, 'description', bp.description, 'target_type', bp.target_type, 'applicable_roles', bp.applicable_roles, 'is_one_time', bp.is_one_time),
    true
  FROM public.billing_profiles bp
  RETURNING id, billing_profile_id
)
INSERT INTO public.billing_profile_version_items (billing_profile_version_id, name, amount, frequency, is_mandatory, item_snapshot)
SELECT iv.id, bi.name, bi.amount, bi.frequency, bi.is_mandatory,
  jsonb_build_object('id', bi.id, 'name', bi.name, 'amount', bi.amount, 'frequency', bi.frequency, 'is_mandatory', bi.is_mandatory)
FROM initial_versions iv
JOIN public.billing_items bi ON bi.billing_profile_id = iv.billing_profile_id;

UPDATE public.invoices i
SET billing_profile_version_id = v.id
FROM public.billing_profile_versions v
WHERE i.billing_profile_id = v.billing_profile_id
  AND i.billing_profile_version_id IS NULL;

CREATE UNIQUE INDEX invoices_generated_business_key
  ON public.invoices (resident_id, house_id, billing_profile_version_id, period_start, period_end)
  WHERE billing_profile_version_id IS NOT NULL;

CREATE TABLE public.invoice_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_approval','queued','processing','completed','completed_with_errors','cancelled')),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  scope jsonb NOT NULL DEFAULT '{}'::jsonb,
  options jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  candidate_count integer NOT NULL DEFAULT 0 CHECK (candidate_count >= 0),
  created_count integer NOT NULL DEFAULT 0 CHECK (created_count >= 0),
  skipped_count integer NOT NULL DEFAULT 0 CHECK (skipped_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  cancelled_count integer NOT NULL DEFAULT 0 CHECK (cancelled_count >= 0),
  total_amount numeric NOT NULL DEFAULT 0 CHECK (total_amount >= 0),
  total_wallet_allocated numeric NOT NULL DEFAULT 0 CHECK (total_wallet_allocated >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.invoice_generation_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.invoice_generation_runs(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','created','skipped','failed','cancelled')),
  resident_id uuid NOT NULL REFERENCES public.residents(id) ON DELETE RESTRICT,
  house_id uuid REFERENCES public.houses(id) ON DELETE RESTRICT,
  billing_profile_id uuid NOT NULL REFERENCES public.billing_profiles(id) ON DELETE RESTRICT,
  billing_profile_version_id uuid NOT NULL REFERENCES public.billing_profile_versions(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL CHECK (period_end >= period_start),
  due_date date NOT NULL,
  invoice_type public.invoice_type_enum NOT NULL DEFAULT 'SERVICE_CHARGE',
  amount_due numeric NOT NULL CHECK (amount_due >= 0),
  rate_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  invoice_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  wallet_allocation_requested boolean NOT NULL DEFAULT false,
  invoice_id uuid REFERENCES public.invoices(id) ON DELETE RESTRICT,
  wallet_allocated numeric NOT NULL DEFAULT 0 CHECK (wallet_allocated >= 0),
  outcome jsonb NOT NULL DEFAULT '{}'::jsonb,
  error_message text,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, resident_id, house_id, billing_profile_version_id, period_start, period_end)
);
CREATE INDEX invoice_generation_candidates_run_status_idx ON public.invoice_generation_candidates (run_id, status);

CREATE TABLE public.invoice_generation_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES public.invoice_generation_runs(id) ON DELETE RESTRICT,
  approver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved','rejected')),
  confirmation text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (run_id, approver_id)
);

CREATE TRIGGER billing_profile_versions_updated_at BEFORE UPDATE ON public.billing_profile_versions FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER invoice_generation_runs_updated_at BEFORE UPDATE ON public.invoice_generation_runs FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER invoice_generation_candidates_updated_at BEFORE UPDATE ON public.invoice_generation_candidates FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.billing_profile_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_profile_version_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_generation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_generation_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_generation_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Finance may read billing profile versions" ON public.billing_profile_versions FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin','chairman','financial_secretary')));
CREATE POLICY "Finance may read billing profile version items" ON public.billing_profile_version_items FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin','chairman','financial_secretary')));
CREATE POLICY "Finance may read invoice generation runs" ON public.invoice_generation_runs FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin','chairman','financial_secretary')));
CREATE POLICY "Finance may read invoice generation candidates" ON public.invoice_generation_candidates FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin','chairman','financial_secretary')));
CREATE POLICY "Finance may read invoice generation approvals" ON public.invoice_generation_approvals FOR SELECT USING (auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin','chairman','financial_secretary')));

INSERT INTO public.system_settings (key, value, description) VALUES
  ('invoice_generation_dual_approval_enabled', 'false'::jsonb, 'Require a distinct second approver for invoice-generation backfills.'),
  ('invoice_generation_high_value_threshold', '1000000'::jsonb, 'NGN total requiring typed invoice-generation confirmation.'),
  ('invoice_generation_backfill_max_months', '12'::jsonb, 'Maximum months allowed in one invoice-generation backfill.')
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_generated_invoice(p_candidate_id uuid, p_actor_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_candidate public.invoice_generation_candidates%ROWTYPE;
  v_invoice_id uuid;
  v_invoice_number text;
  v_wallet_result jsonb := '{}'::jsonb;
  v_wallet_allocated numeric(12,2) := 0;
  v_item jsonb;
BEGIN
  -- Direct authenticated callers must be authorised finance users and may
  -- only attribute a write to themselves. Service-role workers have no
  -- auth.uid() and are authorised at the server-action boundary.
  IF auth.uid() IS NOT NULL THEN
    IF auth.uid() IS DISTINCT FROM p_actor_id OR NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'chairman', 'financial_secretary')
    ) THEN
      RAISE EXCEPTION 'Not authorised to create generated invoices';
    END IF;
  END IF;
  SELECT * INTO v_candidate FROM public.invoice_generation_candidates WHERE id = p_candidate_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice generation candidate % not found', p_candidate_id; END IF;
  IF v_candidate.status IN ('created','skipped','cancelled') THEN RETURN jsonb_build_object('status',v_candidate.status,'invoice_id',v_candidate.invoice_id,'amount',v_candidate.amount_due,'wallet_allocated',v_candidate.wallet_allocated); END IF;
  IF v_candidate.status = 'failed' THEN RAISE EXCEPTION 'Invoice generation candidate % has failed and must be retried explicitly', p_candidate_id; END IF;
  UPDATE public.invoice_generation_candidates SET status='processing', updated_at=now() WHERE id=v_candidate.id;
  v_invoice_number := format('INV-%s-%s-%s',to_char(v_candidate.period_start,'YYYYMM'),upper(substr(replace(v_candidate.house_id::text,'-',''),1,8)),upper(substr(replace(v_candidate.billing_profile_version_id::text,'-',''),1,8)));
  INSERT INTO public.invoices (resident_id,house_id,billing_profile_id,billing_profile_version_id,invoice_number,amount_due,amount_paid,status,due_date,period_start,period_end,created_by,invoice_type,rate_snapshot)
  VALUES (v_candidate.resident_id,v_candidate.house_id,v_candidate.billing_profile_id,v_candidate.billing_profile_version_id,v_invoice_number,v_candidate.amount_due,0,'unpaid',v_candidate.due_date,v_candidate.period_start,v_candidate.period_end,p_actor_id,v_candidate.invoice_type,v_candidate.rate_snapshot)
  ON CONFLICT (resident_id,house_id,billing_profile_version_id,period_start,period_end) WHERE billing_profile_version_id IS NOT NULL DO NOTHING RETURNING id INTO v_invoice_id;
  IF v_invoice_id IS NULL THEN
    SELECT id INTO v_invoice_id FROM public.invoices WHERE resident_id=v_candidate.resident_id AND house_id IS NOT DISTINCT FROM v_candidate.house_id AND billing_profile_version_id=v_candidate.billing_profile_version_id AND period_start=v_candidate.period_start AND period_end=v_candidate.period_end;
    UPDATE public.invoice_generation_candidates SET status='skipped',invoice_id=v_invoice_id,outcome=jsonb_build_object('reason','invoice_already_exists'),processed_at=now(),updated_at=now() WHERE id=v_candidate.id;
    RETURN jsonb_build_object('status','skipped','invoice_id',v_invoice_id,'amount',v_candidate.amount_due,'wallet_allocated',0);
  END IF;
  FOR v_item IN SELECT value FROM jsonb_array_elements(v_candidate.invoice_items) LOOP
    INSERT INTO public.invoice_items (invoice_id,description,amount) VALUES (v_invoice_id,COALESCE(v_item->>'description',v_item->>'name'),(v_item->>'amount')::numeric);
  END LOOP;
  IF v_candidate.wallet_allocation_requested THEN
    v_wallet_result := public.settle_wallet_invoices(v_candidate.resident_id,ARRAY[v_invoice_id],'existing_wallet_settlement',current_date,NULL,v_candidate.house_id,0,v_candidate.amount_due,p_actor_id);
    v_wallet_allocated := COALESCE((v_wallet_result->>'total_allocated')::numeric,0);
  END IF;
  UPDATE public.invoice_generation_candidates SET status='created',invoice_id=v_invoice_id,wallet_allocated=v_wallet_allocated,outcome=jsonb_build_object('wallet',v_wallet_result),processed_at=now(),updated_at=now() WHERE id=v_candidate.id;
  RETURN jsonb_build_object('status','created','invoice_id',v_invoice_id,'amount',v_candidate.amount_due,'wallet_allocated',v_wallet_allocated);
EXCEPTION WHEN OTHERS THEN
  UPDATE public.invoice_generation_candidates SET status='failed',error_message=SQLERRM,processed_at=now(),updated_at=now() WHERE id=p_candidate_id;
  RETURN jsonb_build_object('status','failed','invoice_id',NULL,'amount',v_candidate.amount_due,'wallet_allocated',0,'error',SQLERRM);
END;
$$;
REVOKE ALL ON FUNCTION public.create_generated_invoice(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_generated_invoice(uuid,uuid) TO authenticated, service_role;
