-- Bounded billing read models for admin and resident detail surfaces.
-- These functions preserve the existing JSON contracts while moving the
-- aggregation work into Postgres instead of loading invoice history into JS.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_resident_indebtedness(p_resident_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'totalUnpaid', COALESCE(SUM(GREATEST(i.amount_due - i.amount_paid, 0)), 0),
    'invoiceCount', COUNT(*) FILTER (WHERE i.amount_due - i.amount_paid > 0),
    'unpaidCount', COUNT(*) FILTER (
      WHERE i.status = 'unpaid' AND i.amount_due - i.amount_paid > 0
    ),
    'partiallyPaidCount', COUNT(*) FILTER (
      WHERE i.status = 'partially_paid' AND i.amount_due - i.amount_paid > 0
    )
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
    'residents', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'residentId', resident_id,
            'residentName', concat_ws(' ', first_name, last_name),
            'residentCode', resident_code,
            'totalDue', total_due,
            'totalPaid', total_paid,
            'outstanding', outstanding,
            'invoiceCount', invoice_count
          )
          ORDER BY outstanding DESC
        )
        FROM resident_totals
      ),
      '[]'::jsonb
    )
  )
  FROM totals;
$$;

CREATE OR REPLACE FUNCTION public.get_resident_cross_property_payment_summary(p_resident_id UUID)
RETURNS JSONB
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH current_houses AS (
    SELECT rh.house_id
    FROM public.resident_houses rh
    WHERE rh.resident_id = p_resident_id
      AND rh.is_active = true
  ),
  base AS (
    SELECT
      i.house_id,
      h.house_number,
      s.name AS street_name,
      i.amount_due,
      i.amount_paid,
      i.status,
      i.due_date,
      GREATEST(i.amount_due - i.amount_paid, 0) AS outstanding,
      (ch.house_id IS NOT NULL) AS is_current_property,
      (
        i.status IN ('unpaid', 'partially_paid')
        AND i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
      ) AS is_overdue
    FROM public.invoices i
    JOIN public.houses h ON h.id = i.house_id
    LEFT JOIN public.streets s ON s.id = h.street_id
    LEFT JOIN current_houses ch ON ch.house_id = i.house_id
    WHERE i.resident_id = p_resident_id
      AND i.status <> 'void'
  ),
  property_totals AS (
    SELECT
      house_id,
      MAX(house_number) AS house_number,
      MAX(street_name) AS street_name,
      BOOL_OR(is_current_property) AS is_current_property,
      SUM(amount_due) AS total_due,
      SUM(amount_paid) AS total_paid,
      SUM(outstanding) AS outstanding,
      COUNT(*) AS invoice_count,
      COUNT(*) FILTER (WHERE status = 'unpaid') AS unpaid_count,
      COUNT(*) FILTER (WHERE is_overdue) AS overdue_count
    FROM base
    GROUP BY house_id
  )
  SELECT jsonb_build_object(
    'totalDue', COALESCE((SELECT SUM(amount_due) FROM base), 0),
    'totalPaid', COALESCE((SELECT SUM(amount_paid) FROM base), 0),
    'totalOutstanding', COALESCE((SELECT SUM(outstanding) FROM base), 0),
    'totalInvoices', (SELECT COUNT(*) FROM base),
    'properties', COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'houseId', house_id,
            'houseNumber', house_number,
            'streetName', street_name,
            'isCurrentProperty', is_current_property,
            'totalDue', total_due,
            'totalPaid', total_paid,
            'outstanding', outstanding,
            'invoiceCount', invoice_count,
            'unpaidCount', unpaid_count,
            'overdueCount', overdue_count
          )
          ORDER BY outstanding DESC
        )
        FROM property_totals
      ),
      '[]'::jsonb
    )
  );
$$;

REVOKE ALL ON FUNCTION public.get_resident_indebtedness(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_house_payment_status(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_resident_cross_property_payment_summary(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_resident_indebtedness(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_house_payment_status(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_resident_cross_property_payment_summary(UUID) TO authenticated;

COMMIT;
