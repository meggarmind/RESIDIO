-- Migration: server-side aggregates for four admin read actions (issue #776)
--
-- Each action below downloaded rows and aggregated in JavaScript. PostgREST caps a bare select at
-- 1000 rows, so three of them under-reported silently past that size, and getPaymentStats paged
-- serially (one round trip per 1000 paid rows). Each function reproduces its caller's previous
-- filters and arithmetic exactly:
--
--   sum_paid_payments()                      : get-payment-stats.ts, SUM(amount) WHERE status = 'paid'
--   get_overdue_invoice_aging(p_today)       : check-overdue-invoices.ts getOverdueInvoiceAging,
--                                              status IN ('unpaid','partially_paid') AND due_date < p_today,
--                                              bucketed by whole days (p_today - due_date)
--   get_contact_verification_stats()         : get-resident-stats.ts getContactVerificationStats, active
--                                              residents; email counts as complete when absent ('' or
--                                              NULL) or verified
--   get_financial_overview(...)              : get-financial-overview.ts, bank_statement_rows of completed
--                                              imports in an inclusive transaction_date range, grouped by
--                                              tag_id. A group's transaction_type is MIN() of its rows
--                                              ('credit' when mixed, matching the old 'credit' fallback).
--
-- SECURITY INVOKER on purpose: RLS applies as the caller, so every figure is exactly what the
-- previous client-side query could see. Do not change to DEFINER.
--
-- ROLLBACK (all four functions are new; revert the TS callers first, then):
--   DROP FUNCTION IF EXISTS public.sum_paid_payments();
--   DROP FUNCTION IF EXISTS public.get_overdue_invoice_aging(date);
--   DROP FUNCTION IF EXISTS public.get_contact_verification_stats();
--   DROP FUNCTION IF EXISTS public.get_financial_overview(date, date, uuid, text);

CREATE OR REPLACE FUNCTION public.sum_paid_payments()
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COALESCE(SUM(amount), 0)::numeric
    FROM public.payment_records
    WHERE status = 'paid';
$$;

CREATE OR REPLACE FUNCTION public.get_overdue_invoice_aging(p_today date)
RETURNS TABLE (days_overdue integer, count bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT (p_today - due_date)::integer AS days_overdue, COUNT(*) AS count
    FROM public.invoices
    WHERE status IN ('unpaid', 'partially_paid')
      AND due_date < p_today
    GROUP BY 1
    ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.get_contact_verification_stats()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'verified', COUNT(*) FILTER (
            WHERE phone_verified_at IS NOT NULL
              AND (COALESCE(email, '') = '' OR email_verified_at IS NOT NULL)
        ),
        'unverified', COUNT(*) FILTER (
            WHERE email_verified_at IS NULL AND phone_verified_at IS NULL
        ),
        'total', COUNT(*)
    )
    FROM public.residents
    WHERE account_status = 'active';
$$;

CREATE OR REPLACE FUNCTION public.get_financial_overview(
    p_start_date date,
    p_end_date date,
    p_bank_account_id uuid DEFAULT NULL,
    p_transaction_type text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH rows AS (
        SELECT r.amount, r.transaction_type, r.tag_id
        FROM public.bank_statement_rows r
        JOIN public.bank_statement_imports i ON i.id = r.import_id
        WHERE r.transaction_date >= p_start_date
          AND r.transaction_date <= p_end_date
          AND i.status = 'completed'
          AND (p_bank_account_id IS NULL OR i.bank_account_id = p_bank_account_id)
          AND (p_transaction_type IS NULL OR r.transaction_type = p_transaction_type)
    ),
    by_tag AS (
        SELECT
            rows.tag_id,
            COALESCE(t.name, 'Untagged') AS tag_name,
            COALESCE(t.color, 'gray') AS tag_color,
            COALESCE(MIN(rows.transaction_type), 'credit') AS transaction_type,
            COUNT(*) AS count,
            COALESCE(SUM(rows.amount), 0)::numeric AS total
        FROM rows
        LEFT JOIN public.transaction_tags t ON t.id = rows.tag_id
        GROUP BY rows.tag_id, t.name, t.color
    )
    SELECT jsonb_build_object(
        'total_credits', (SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'credit'), 0)::numeric FROM rows),
        'total_debits', (SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'debit'), 0)::numeric FROM rows),
        'transaction_count', (SELECT COUNT(*) FROM rows),
        'by_tag', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'tag_id', tag_id,
                'tag_name', tag_name,
                'tag_color', tag_color,
                'transaction_type', transaction_type,
                'count', count,
                'total', total
            ) ORDER BY total DESC)
            FROM by_tag
        ), '[]'::jsonb)
    );
$$;

REVOKE ALL ON FUNCTION public.sum_paid_payments() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sum_paid_payments() FROM anon;
GRANT EXECUTE ON FUNCTION public.sum_paid_payments() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_overdue_invoice_aging(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_overdue_invoice_aging(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_overdue_invoice_aging(date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_contact_verification_stats() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_contact_verification_stats() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_contact_verification_stats() TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_financial_overview(date, date, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_financial_overview(date, date, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_financial_overview(date, date, uuid, text) TO authenticated, service_role;
