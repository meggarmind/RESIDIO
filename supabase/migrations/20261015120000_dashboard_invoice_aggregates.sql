-- Migration: dashboard invoice aggregates (issue #215, slice B / Finding 4; mirrors
-- 20261013100000_dashboard_payment_metrics.sql)
--
-- get-enhanced-dashboard-stats.ts issued 6 head-count queries over `invoices` for the status
-- distribution, and 6 more (one per trend month) for invoicesGenerated. This replaces each group
-- with one server-side aggregate. Read-only: no data or schema changes.
--
-- get_dashboard_invoice_status_counts(p_today)
--   Returns the SAME six RAW counts the old head-count queries returned:
--     unpaid, paid, partially_paid, void              : status = <value>
--     overdue_unpaid, overdue_partially_paid          : status = <value> AND due_date < p_today
--   (strict <, as the old .lt('due_date', today)). The caller still nets each overdue slice out of
--   its own bucket, so the bucket arithmetic is unchanged and lives in one place (TypeScript).
--   p_today is supplied by the caller (UTC date, the same value the old code computed) rather than
--   CURRENT_DATE so the database session time zone cannot shift the overdue boundary.
--
-- get_dashboard_monthly_invoice_counts(p_month_starts, p_month_ends)
--   Takes parallel arrays of month window bounds (timestamptz, both INCLUSIVE, exactly the
--   .gte/.lte pair the old per-month count used on created_at) and returns a jsonb array
--   [{"idx": 1, "count": n}, ...] with one element per window in input order, zero for empty
--   windows. Windows are passed in rather than derived so month boundaries stay the caller's
--   (server-local) ones, as before.
--
-- SECURITY INVOKER on purpose (same as get_dashboard_payment_metrics): RLS on invoices applies as
-- the caller, so the numbers a user sees are exactly what the previous client head-count queries
-- returned. Do not change to DEFINER.
--
-- Indexes: no new index. Status counts are one pass over invoices (FILTER aggregates); the
-- monthly counts use the existing created_at / status indexes where present.
--
-- ROLLBACK (the functions are new; revert the TS callers first, then):
--   DROP FUNCTION IF EXISTS public.get_dashboard_invoice_status_counts(date);
--   DROP FUNCTION IF EXISTS public.get_dashboard_monthly_invoice_counts(timestamptz[], timestamptz[]);

CREATE OR REPLACE FUNCTION public.get_dashboard_invoice_status_counts(p_today date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'unpaid', COUNT(*) FILTER (WHERE status = 'unpaid'),
        'paid', COUNT(*) FILTER (WHERE status = 'paid'),
        'partially_paid', COUNT(*) FILTER (WHERE status = 'partially_paid'),
        'void', COUNT(*) FILTER (WHERE status = 'void'),
        'overdue_unpaid', COUNT(*) FILTER (WHERE status = 'unpaid' AND due_date < p_today),
        'overdue_partially_paid', COUNT(*) FILTER (WHERE status = 'partially_paid' AND due_date < p_today)
    )
    FROM public.invoices;
$$;

CREATE OR REPLACE FUNCTION public.get_dashboard_monthly_invoice_counts(
    p_month_starts timestamptz[],
    p_month_ends timestamptz[]
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT COALESCE(jsonb_agg(jsonb_build_object('idx', w.idx, 'count', w.cnt) ORDER BY w.idx), '[]'::jsonb)
    FROM (
        SELECT
            m.idx,
            (
                SELECT COUNT(*)
                FROM public.invoices i
                WHERE i.created_at >= m.s AND i.created_at <= e.e
            ) AS cnt
        FROM unnest(p_month_starts) WITH ORDINALITY AS m(s, idx)
        JOIN unnest(p_month_ends) WITH ORDINALITY AS e(e, idx) ON e.idx = m.idx
    ) w;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_invoice_status_counts(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_invoice_status_counts(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_invoice_status_counts(date) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_dashboard_monthly_invoice_counts(timestamptz[], timestamptz[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_monthly_invoice_counts(timestamptz[], timestamptz[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_monthly_invoice_counts(timestamptz[], timestamptz[]) TO authenticated, service_role;
