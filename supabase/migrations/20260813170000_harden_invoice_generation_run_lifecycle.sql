-- Repair Task 3 lifecycle races and make abandoned processing work recoverable.
BEGIN;
ALTER TABLE public.invoice_generation_candidates ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS invoice_generation_candidates_lease_idx ON public.invoice_generation_candidates(run_id, status, claimed_at);

CREATE OR REPLACE FUNCTION public.approve_invoice_generation_run(p_run_id UUID, p_approver_id UUID, p_confirmation TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_run public.invoice_generation_runs%ROWTYPE; v_approval UUID;
BEGIN
  SELECT * INTO v_run FROM public.invoice_generation_runs WHERE id = p_run_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice generation run not found'; END IF;
  IF v_run.status <> 'awaiting_approval' THEN RAISE EXCEPTION 'Run is not awaiting approval'; END IF;
  IF v_run.requested_by = p_approver_id THEN RAISE EXCEPTION 'A distinct approver is required'; END IF;
  INSERT INTO public.invoice_generation_approvals(run_id, approver_id, decision, confirmation)
  VALUES (p_run_id, p_approver_id, 'approved', p_confirmation) RETURNING id INTO v_approval;
  UPDATE public.invoice_generation_runs SET status = 'queued', updated_at = now() WHERE id = p_run_id;
  RETURN jsonb_build_object('approval_id', v_approval, 'run', (SELECT to_jsonb(r) FROM public.invoice_generation_runs r WHERE r.id = p_run_id));
END; $$;

CREATE OR REPLACE FUNCTION public.claim_invoice_generation_candidates(p_run_id UUID, p_limit INTEGER DEFAULT 50)
RETURNS TABLE (candidate_id UUID) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_limit INTEGER := greatest(1, least(coalesce(p_limit, 50), 50)); v_status TEXT;
BEGIN
 SELECT status INTO v_status FROM public.invoice_generation_runs WHERE id = p_run_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Invoice generation run not found'; END IF;
 IF v_status NOT IN ('queued','processing') THEN RETURN; END IF;
 UPDATE public.invoice_generation_candidates SET status='pending', claimed_at=NULL, updated_at=now()
 WHERE run_id=p_run_id AND status='processing' AND claimed_at < now() - interval '15 minutes';
 UPDATE public.invoice_generation_runs SET status='processing', started_at=coalesce(started_at,now()), updated_at=now() WHERE id=p_run_id;
 RETURN QUERY WITH claimable AS (SELECT id FROM public.invoice_generation_candidates WHERE run_id=p_run_id AND status='pending' ORDER BY created_at,id LIMIT v_limit FOR UPDATE SKIP LOCKED)
 UPDATE public.invoice_generation_candidates candidate SET status='processing', claimed_at=now(), updated_at=now() FROM claimable WHERE candidate.id=claimable.id RETURNING candidate.id;
END; $$;

REVOKE ALL ON FUNCTION public.approve_invoice_generation_run(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_invoice_generation_candidates(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.approve_invoice_generation_run(UUID, UUID, TEXT), public.claim_invoice_generation_candidates(UUID, INTEGER) TO service_role;
COMMIT;
