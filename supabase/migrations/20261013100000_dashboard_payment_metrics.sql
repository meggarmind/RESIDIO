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
        'collected_count',
            COUNT(*) FILTER (
                WHERE status = 'paid'
                  AND payment_date >= p_month_start
                  AND payment_date <= p_month_end
            ),
        'collected_total',
            COALESCE(SUM(amount) FILTER (
                WHERE status = 'paid'
                  AND payment_date >= p_month_start
                  AND payment_date <= p_month_end
            ), 0)::numeric,
        'unverified_count',
            COUNT(*) FILTER (WHERE status = 'paid' AND is_verified = false),
        'unverified_total',
            COALESCE(SUM(amount) FILTER (WHERE status = 'paid' AND is_verified = false), 0)::numeric
    )
    FROM public.payment_records
    WHERE status = 'paid';
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_payment_metrics(date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_payment_metrics(date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_payment_metrics(date, date) TO authenticated, service_role;
