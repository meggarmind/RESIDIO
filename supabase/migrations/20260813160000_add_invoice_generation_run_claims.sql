-- Task 3: atomically claim bounded durable work and refresh run progress.
BEGIN;

CREATE OR REPLACE FUNCTION public.claim_invoice_generation_candidates(
    p_run_id UUID,
    p_limit INTEGER DEFAULT 50
) RETURNS TABLE (candidate_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_limit INTEGER := greatest(1, least(coalesce(p_limit, 50), 50));
    v_status TEXT;
BEGIN
    SELECT status INTO v_status FROM public.invoice_generation_runs WHERE id = p_run_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Invoice generation run % not found', p_run_id; END IF;
    IF v_status NOT IN ('queued', 'processing') THEN RETURN; END IF;

    UPDATE public.invoice_generation_runs
    SET status = 'processing', started_at = coalesce(started_at, now()), updated_at = now()
    WHERE id = p_run_id;

    RETURN QUERY
    WITH claimable AS (
        SELECT id FROM public.invoice_generation_candidates
        WHERE run_id = p_run_id AND status = 'pending'
        ORDER BY created_at, id
        LIMIT v_limit
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.invoice_generation_candidates candidate
    SET status = 'processing', updated_at = now()
    FROM claimable
    WHERE candidate.id = claimable.id
    RETURNING candidate.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_invoice_generation_run(p_run_id UUID)
RETURNS public.invoice_generation_runs
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_run public.invoice_generation_runs%ROWTYPE;
BEGIN
  UPDATE public.invoice_generation_runs run
  SET candidate_count = summary.candidate_count,
      created_count = summary.created_count, skipped_count = summary.skipped_count,
      failed_count = summary.failed_count, cancelled_count = summary.cancelled_count,
      total_wallet_allocated = summary.total_wallet_allocated,
      status = CASE WHEN run.status = 'cancelled' THEN 'cancelled'
                    WHEN summary.pending_count > 0 OR summary.processing_count > 0 THEN 'processing'
                    WHEN summary.failed_count > 0 THEN 'completed_with_errors' ELSE 'completed' END,
      completed_at = CASE WHEN summary.pending_count = 0 AND summary.processing_count = 0 THEN coalesce(run.completed_at, now()) ELSE NULL END,
      result_summary = jsonb_build_object('pending', summary.pending_count, 'processing', summary.processing_count, 'created', summary.created_count, 'skipped', summary.skipped_count, 'failed', summary.failed_count, 'cancelled', summary.cancelled_count),
      updated_at = now()
  FROM (
    SELECT count(*)::integer AS candidate_count,
      count(*) FILTER (WHERE status = 'pending')::integer AS pending_count,
      count(*) FILTER (WHERE status = 'processing')::integer AS processing_count,
      count(*) FILTER (WHERE status = 'created')::integer AS created_count,
      count(*) FILTER (WHERE status = 'skipped')::integer AS skipped_count,
      count(*) FILTER (WHERE status = 'failed')::integer AS failed_count,
      count(*) FILTER (WHERE status = 'cancelled')::integer AS cancelled_count,
      coalesce(sum(wallet_allocated), 0) AS total_wallet_allocated
    FROM public.invoice_generation_candidates WHERE run_id = p_run_id
  ) summary
  WHERE run.id = p_run_id
  RETURNING run.* INTO v_run;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice generation run % not found', p_run_id; END IF;
  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_invoice_generation_candidates(UUID, INTEGER), public.refresh_invoice_generation_run(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_invoice_generation_candidates(UUID, INTEGER), public.refresh_invoice_generation_run(UUID) TO service_role;
COMMIT;
