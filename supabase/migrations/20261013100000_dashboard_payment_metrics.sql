-- Migration: dashboard payment metrics aggregate (issue #215, follow-up to #459 / PR #480)
--
-- get-dashboard-stats.ts used to page every paid payment_records row for the month and every
-- unverified paid row down to the server and sum them in JavaScript. This replaces both reads with
-- one server-side aggregate.
--
-- Filters reproduce the previous client queries exactly:
--   collected  : status = 'paid' AND payment_date BETWEEN p_month_start AND p_month_end (inclusive)
--   unverified : status = 'paid' AND is_verified = false (all time, no date bound)
-- payment_date is a DATE column, so both bounds are inclusive dates.
--   verified_total: the same window, counting a row as verified when is_verified OR it came from a
--   bank statement import (import_id) or email import (email_import_id) - the definition
--   fetchFinancialHealth in get-enhanced-dashboard-stats.ts applies for monthlyRevenue.
-- The two aggregates are separate subqueries so the window scan uses the (payment_date, status)
-- index and is not forced to scan every paid row; callers that only need the window ignore the
-- unverified keys.
--
-- SECURITY INVOKER on purpose: RLS on payment_records applies as the caller, so the numbers a user
-- sees are exactly what their previous client-side query returned. Do not change to DEFINER.
--
-- Indexes: idx_payment_records_date_status (payment_date, status) from 20260102120456 serves the
-- collected metric, and idx_payment_records_is_verified / idx_payment_records_status serve the
-- unverified one. No new index is needed.
--
-- ROLLBACK (the function is new; revert the TS caller first, then):
--   DROP FUNCTION IF EXISTS public.get_dashboard_payment_metrics(date, date);

CREATE OR REPLACE FUNCTION public.get_dashboard_payment_metrics(p_month_start date, p_month_end date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'collected_count', c.cnt,
        'collected_total', c.total,
        'verified_total', c.verified_total,
        'unverified_count', u.cnt,
        'unverified_total', u.total
    )
    FROM (
        SELECT
            COUNT(*) AS cnt,
            COALESCE(SUM(amount), 0)::numeric AS total,
            COALESCE(SUM(amount) FILTER (
                WHERE is_verified = true OR import_id IS NOT NULL OR email_import_id IS NOT NULL
            ), 0)::numeric AS verified_total
        FROM public.payment_records
        WHERE status = 'paid'
          AND payment_date >= p_month_start
          AND payment_date <= p_month_end
    ) c,
    (
        SELECT
            COUNT(*) AS cnt,
            COALESCE(SUM(amount), 0)::numeric AS total
        FROM public.payment_records
        WHERE status = 'paid' AND is_verified = false
    ) u;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_payment_metrics(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_payment_metrics(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_payment_metrics(date, date) TO authenticated, service_role;
