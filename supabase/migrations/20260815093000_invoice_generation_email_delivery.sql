BEGIN;

ALTER TABLE public.invoice_generation_candidates
  ADD COLUMN IF NOT EXISTS email_queue_id UUID REFERENCES public.notification_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS email_status TEXT;

ALTER TABLE public.invoice_generation_runs
  ADD COLUMN IF NOT EXISTS email_queued_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_sent_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS email_failed_count INTEGER NOT NULL DEFAULT 0;

ALTER TABLE public.invoice_generation_candidates
  DROP CONSTRAINT IF EXISTS invoice_generation_candidates_email_status_check;

ALTER TABLE public.invoice_generation_candidates
  ADD CONSTRAINT invoice_generation_candidates_email_status_check
  CHECK (email_status IS NULL OR email_status IN ('queued', 'sent', 'failed', 'skipped'));

CREATE UNIQUE INDEX IF NOT EXISTS notification_queue_invoice_generated_key
  ON public.notification_queue (deduplication_key)
  WHERE deduplication_key IS NOT NULL
    AND deduplication_key LIKE 'invoice-generated:%';

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
      created_count = summary.created_count,
      skipped_count = summary.skipped_count,
      failed_count = summary.failed_count,
      cancelled_count = summary.cancelled_count,
      total_wallet_allocated = summary.total_wallet_allocated,
      email_queued_count = summary.email_queued_count,
      email_sent_count = summary.email_sent_count,
      email_failed_count = summary.email_failed_count,
      status = CASE WHEN run.status = 'cancelled' THEN 'cancelled'
                    WHEN summary.pending_count > 0 OR summary.processing_count > 0 THEN 'processing'
                    WHEN summary.failed_count > 0 THEN 'completed_with_errors' ELSE 'completed' END,
      completed_at = CASE WHEN summary.pending_count = 0 AND summary.processing_count = 0 THEN coalesce(run.completed_at, now()) ELSE NULL END,
      result_summary = jsonb_build_object(
        'pending', summary.pending_count,
        'processing', summary.processing_count,
        'created', summary.created_count,
        'skipped', summary.skipped_count,
        'failed', summary.failed_count,
        'cancelled', summary.cancelled_count,
        'email_queued', summary.email_queued_count,
        'email_sent', summary.email_sent_count,
        'email_failed', summary.email_failed_count
      ) || coalesce(run.result_summary - ARRAY['pending','processing','created','skipped','failed','cancelled','email_queued','email_sent','email_failed']::text[], '{}'::jsonb),
      updated_at = now()
  FROM (
    SELECT count(*)::integer AS candidate_count,
      count(*) FILTER (WHERE c.status = 'pending')::integer AS pending_count,
      count(*) FILTER (WHERE c.status = 'processing')::integer AS processing_count,
      count(*) FILTER (WHERE c.status = 'created')::integer AS created_count,
      count(*) FILTER (WHERE c.status = 'skipped')::integer AS skipped_count,
      count(*) FILTER (WHERE c.status = 'failed')::integer AS failed_count,
      count(*) FILTER (WHERE c.status = 'cancelled')::integer AS cancelled_count,
      coalesce(sum(c.wallet_allocated), 0) AS total_wallet_allocated,
      count(*) FILTER (WHERE coalesce(q.status, c.email_status) = 'pending' OR c.email_status = 'queued')::integer AS email_queued_count,
      count(*) FILTER (WHERE q.status = 'sent' OR c.email_status = 'sent')::integer AS email_sent_count,
      count(*) FILTER (WHERE q.status = 'failed' OR c.email_status = 'failed')::integer AS email_failed_count
    FROM public.invoice_generation_candidates c
    LEFT JOIN public.notification_queue q ON q.id = c.email_queue_id
    WHERE c.run_id = p_run_id
  ) summary
  WHERE run.id = p_run_id
  RETURNING run.* INTO v_run;
  IF NOT FOUND THEN RAISE EXCEPTION 'Invoice generation run % not found', p_run_id; END IF;
  RETURN v_run;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_invoice_generation_run(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_invoice_generation_run(UUID) TO service_role;
COMMIT;
