CREATE OR REPLACE FUNCTION public.import_legacy_financial_batch(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invoice_count integer := 0;
  payment_count integer := 0;
  wallet_count integer := 0;
  transaction_count integer := 0;
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    RAISE EXCEPTION 'service_role required';
  END IF;

  INSERT INTO public.invoices (
    id, resident_id, house_id, billing_profile_id, invoice_number,
    amount_due, amount_paid, status, due_date, period_start, period_end,
    created_by, rate_snapshot
  )
  SELECT id, resident_id, house_id, billing_profile_id, invoice_number,
         amount_due, amount_paid, status::invoice_status, due_date::date,
         period_start::date, period_end::date, created_by, rate_snapshot::jsonb
  FROM jsonb_to_recordset(coalesce(payload->'invoices', '[]'::jsonb)) AS x(
    id uuid, resident_id uuid, house_id uuid, billing_profile_id uuid,
    invoice_number text, amount_due numeric, amount_paid numeric,
    status text, due_date text, period_start text, period_end text,
    created_by uuid, rate_snapshot text
  )
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS invoice_count = ROW_COUNT;

  INSERT INTO public.payment_records (
    id, resident_id, house_id, amount, payment_date, period_start,
    period_end, status, method
  )
  SELECT id, resident_id, house_id, amount, payment_date::date,
         period_start::date, period_end::date, status::payment_status,
         method::payment_method
  FROM jsonb_to_recordset(coalesce(payload->'payments', '[]'::jsonb)) AS x(
    id uuid, resident_id uuid, house_id uuid, amount numeric,
    payment_date text, period_start text, period_end text,
    status text, method text
  )
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS payment_count = ROW_COUNT;

  INSERT INTO public.resident_wallets (id, resident_id, balance)
  SELECT id, resident_id, balance
  FROM jsonb_to_recordset(coalesce(payload->'wallets', '[]'::jsonb)) AS x(
    id uuid, resident_id uuid, balance numeric
  )
  ON CONFLICT (id) DO UPDATE SET balance = excluded.balance, updated_at = now();
  GET DIAGNOSTICS wallet_count = ROW_COUNT;

  INSERT INTO public.wallet_transactions (
    id, wallet_id, type, amount, balance_after, reference_type,
    reference_id, description
  )
  SELECT id, wallet_id, type::wallet_transaction_type, amount,
         balance_after, reference_type, reference_id, description
  FROM jsonb_to_recordset(coalesce(payload->'wallet_transactions', '[]'::jsonb)) AS x(
    id uuid, wallet_id uuid, type text, amount numeric, balance_after numeric,
    reference_type text, reference_id uuid, description text
  )
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS transaction_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'invoices', invoice_count,
    'payments', payment_count,
    'wallets', wallet_count,
    'wallet_transactions', transaction_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.import_legacy_financial_batch(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.import_legacy_financial_batch(jsonb) TO service_role;
