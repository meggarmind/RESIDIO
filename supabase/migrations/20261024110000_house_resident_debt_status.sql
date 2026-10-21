-- Admin house and resident payment reads onto the shared debt status (#983, parent #290, depends on #980).
--
-- WHAT CHANGES
--   get_house_payment_status(p_house_id) and get_resident_indebtedness(p_resident_id) keep every
--   existing field (overdueCount and overdueAmount still feed the invoice-level badges) and gain:
--     debtStatus, owedInvoiceCount, walletBalance
--   decided by public.get_debt_statuses (20261022180000_debt_status.sql), the one place the rule lives.
--   - House: the status of the house as a whole, plus the same three fields on each row of "residents"
--     (that resident's own invoices in the house and that resident's wallet).
--   - Resident: the #980 rule applied to owedInvoiceCount, the resident's owed invoices summed over the
--     houses they are linked to or have invoices in (threshold read from system_settings as
--     get_debt_statuses does), with the resident's own wallet for credit. Not the worst per-house status.
--   The status words are labels applied in TypeScript (system_settings), not here.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION. Return type stays jsonb, so no caller breaks.
--
-- ROLLBACK: re-run the two function bodies from 20260813130000_add_admin_billing_aggregate_rpcs.sql.
--
-- VERIFY (after applying; the two names must exist and the new keys must appear):
--   SELECT public.get_house_payment_status(id) ? 'debtStatus' FROM public.houses LIMIT 1;  -- true
--   SELECT public.get_resident_indebtedness(id) ? 'debtStatus' FROM public.residents LIMIT 1;  -- true

BEGIN;

CREATE OR REPLACE FUNCTION public.get_resident_indebtedness(p_resident_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH linked AS (
    SELECT rh.house_id FROM public.resident_houses rh WHERE rh.resident_id = p_resident_id
    UNION
    SELECT i.house_id FROM public.invoices i WHERE i.resident_id = p_resident_id AND i.house_id IS NOT NULL
  ),
  d AS (
    -- An empty array, never NULL: NULL would mean every active house.
    SELECT * FROM public.get_debt_statuses(
      COALESCE((SELECT array_agg(house_id) FROM linked), ARRAY[]::uuid[]),
      p_resident_id
    )
  ),
  totals AS (
    SELECT COALESCE(SUM(d.owed_invoice_count), 0) AS owed FROM d
  ),
  params AS (
    SELECT coalesce(
      (SELECT (s.value #>> '{}')::integer
         FROM public.system_settings s
        WHERE s.key = 'debt_status_arrears_threshold_months'
          AND s.value #>> '{}' ~ '^[0-9]{1,3}$'),
      3
    ) AS threshold
  ),
  wallet AS (
    SELECT COALESCE((SELECT w.balance FROM public.resident_wallets w WHERE w.resident_id = p_resident_id), 0) AS balance
  )
  SELECT jsonb_build_object(
    'totalUnpaid', COALESCE(SUM(GREATEST(i.amount_due - i.amount_paid, 0)), 0),
    'invoiceCount', COUNT(*) FILTER (WHERE i.amount_due - i.amount_paid > 0),
    'unpaidCount', COUNT(*) FILTER (
      WHERE i.status = 'unpaid' AND i.amount_due - i.amount_paid > 0
    ),
    'partiallyPaidCount', COUNT(*) FILTER (
      WHERE i.status = 'partially_paid' AND i.amount_due - i.amount_paid > 0
    ),
    'debtStatus', CASE
      WHEN (SELECT owed FROM totals) > (SELECT threshold FROM params) THEN 'arrears'
      WHEN (SELECT owed FROM totals) > 0 THEN 'outstanding'
      WHEN (SELECT balance FROM wallet) > 0 THEN 'credit'
      ELSE 'paid_in_full'
    END,
    'owedInvoiceCount', (SELECT owed FROM totals),
    'walletBalance', (SELECT balance FROM wallet)
  )
  FROM public.invoices i
  WHERE i.resident_id = p_resident_id
    AND i.status <> 'void';
$$;

CREATE OR REPLACE FUNCTION public.get_house_payment_status(p_house_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      i.id,
      i.amount_due,
      i.amount_paid,
      i.status,
      i.due_date,
      i.resident_id,
      r.first_name,
      r.last_name,
      r.resident_code,
      GREATEST(i.amount_due - i.amount_paid, 0) AS outstanding,
      (
        i.status IN ('unpaid', 'partially_paid')
        AND i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
      ) AS is_overdue
    FROM public.invoices i
    LEFT JOIN public.residents r ON r.id = i.resident_id
    WHERE i.house_id = p_house_id
      AND i.status <> 'void'
  ),
  resident_totals AS (
    SELECT
      resident_id,
      MAX(first_name) AS first_name,
      MAX(last_name) AS last_name,
      MAX(resident_code) AS resident_code,
      SUM(amount_due) AS total_due,
      SUM(amount_paid) AS total_paid,
      SUM(outstanding) AS outstanding,
      COUNT(*) AS invoice_count
    FROM base
    WHERE resident_id IS NOT NULL
    GROUP BY resident_id
  ),
  totals AS (
    SELECT
      COALESCE(SUM(amount_due), 0) AS total_due,
      COALESCE(SUM(amount_paid), 0) AS total_paid,
      COALESCE(SUM(outstanding), 0) AS total_outstanding,
      COUNT(*) AS invoice_count,
      COUNT(*) FILTER (WHERE status = 'unpaid') AS unpaid_count,
      COUNT(*) FILTER (WHERE status = 'partially_paid') AS partially_paid_count,
      COUNT(*) FILTER (WHERE status = 'paid') AS paid_count,
      COUNT(*) FILTER (WHERE is_overdue) AS overdue_count,
      COALESCE(SUM(outstanding) FILTER (WHERE is_overdue), 0) AS overdue_amount
    FROM base
  ),
  house_debt AS (
    SELECT * FROM public.get_debt_statuses(ARRAY[p_house_id], NULL) LIMIT 1
  )
  SELECT jsonb_build_object(
    'totalDue', totals.total_due,
    'totalPaid', totals.total_paid,
    'totalOutstanding', totals.total_outstanding,
    'invoiceCount', totals.invoice_count,
    'unpaidCount', totals.unpaid_count,
    'partiallyPaidCount', totals.partially_paid_count,
    'paidCount', totals.paid_count,
    'overdueCount', totals.overdue_count,
    'overdueAmount', totals.overdue_amount,
    'debtStatus', COALESCE((SELECT status FROM house_debt), 'paid_in_full'),
    'owedInvoiceCount', COALESCE((SELECT owed_invoice_count FROM house_debt), 0),
    'walletBalance', COALESCE((SELECT wallet_balance FROM house_debt), 0),
    'residents', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'residentId', rt.resident_id,
            'residentName', concat_ws(' ', rt.first_name, rt.last_name),
            'residentCode', rt.resident_code,
            'totalDue', rt.total_due,
            'totalPaid', rt.total_paid,
            'outstanding', rt.outstanding,
            'invoiceCount', rt.invoice_count,
            'debtStatus', COALESCE(rd.status, 'paid_in_full'),
            'owedInvoiceCount', COALESCE(rd.owed_invoice_count, 0),
            'walletBalance', COALESCE(rd.wallet_balance, 0)
          )
          ORDER BY rt.outstanding DESC
        )
        FROM resident_totals rt
        LEFT JOIN LATERAL public.get_debt_statuses(ARRAY[p_house_id], rt.resident_id) rd ON true
      ),
      '[]'::jsonb
    )
  )
  FROM totals;
$$;

COMMIT;
