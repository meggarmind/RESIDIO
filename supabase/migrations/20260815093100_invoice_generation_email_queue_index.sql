CREATE INDEX IF NOT EXISTS invoice_generation_candidates_email_queue_idx
  ON public.invoice_generation_candidates(email_queue_id)
  WHERE email_queue_id IS NOT NULL;
