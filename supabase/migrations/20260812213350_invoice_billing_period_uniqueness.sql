CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_unique_billing_period
ON public.invoices (resident_id, house_id, billing_profile_id, period_start, period_end)
WHERE house_id IS NOT NULL AND billing_profile_id IS NOT NULL AND period_start IS NOT NULL AND period_end IS NOT NULL;
