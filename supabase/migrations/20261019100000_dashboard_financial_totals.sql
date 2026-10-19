-- Migration: dashboard financial totals (issue #775; mirrors
-- 20261015120000_dashboard_invoice_aggregates.sql and 20261013100000_dashboard_payment_metrics.sql)
--
-- fetchFinancialHealth in get-enhanced-dashboard-stats.ts downloaded whole tables (non-void
-- invoices, overdue invoices, resident_wallets, completed bank_statement_rows, active petty cash)
-- and fetchDevelopmentLevyStatus downloaded every levy invoice, all summed in JavaScript. PostgREST
-- caps rows RETURNED at 1000, so past that the sums and counts were silently under-reported. This
-- replaces those reads with one server-side aggregate. Read-only: no data or schema changes.
--
-- get_dashboard_financial_totals(p_today) returns one jsonb object:
--   invoice_total_due, invoice_total_paid : SUM(amount_due), SUM(amount_paid) over status <> 'void'
--   overdue_amount, overdue_count         : status IN ('unpaid','partially_paid') AND due_date < p_today
--                                           (strict <, as the old .lt('due_date', today));
--                                           amount is SUM(amount_due - amount_paid)
--   wallet_balance                        : SUM(resident_wallets.balance)
--   bank_net                              : over bank_statement_rows whose import is 'completed',
--                                           credits added, every other transaction_type subtracted
--                                           (the old reduce did the same)
--   petty_cash_balance                    : SUM(current_balance) over is_active petty cash accounts
--   levy_count, levy_total_due,
--   levy_total_paid                       : non-void invoices whose billing profile is a
--                                           development levy (billing_profiles.is_development_levy)
--   levy_houses_pending                   : distinct non-null house_id among those levy invoices with
--                                           status <> 'paid' AND amount_due - amount_paid > 0
-- Every sum is COALESCEd to 0 so empty tables read as 0, not null. p_today is supplied by the caller
-- (UTC date, the same value the old code computed) rather than CURRENT_DATE so the database session
-- time zone cannot shift the overdue boundary.
--
-- SECURITY INVOKER on purpose (same as the other dashboard aggregates): RLS on every table read
-- applies as the caller, so the numbers a user sees are exactly what the previous client queries
-- returned. Do not change to DEFINER.
--
-- Indexes: no new index. Each figure is one pass over its table.
--
-- ROLLBACK (the function is new; revert the TS caller first, then):
--   DROP FUNCTION IF EXISTS public.get_dashboard_financial_totals(date);

CREATE OR REPLACE FUNCTION public.get_dashboard_financial_totals(p_today date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    SELECT jsonb_build_object(
        'invoice_total_due', inv.total_due,
        'invoice_total_paid', inv.total_paid,
        'overdue_amount', inv.overdue_amount,
        'overdue_count', inv.overdue_count,
        'wallet_balance', (SELECT COALESCE(SUM(w.balance), 0) FROM public.resident_wallets w),
        'bank_net', (
            SELECT COALESCE(SUM(CASE WHEN r.transaction_type = 'credit' THEN r.amount ELSE -r.amount END), 0)
            FROM public.bank_statement_rows r
            JOIN public.bank_statement_imports bi ON bi.id = r.import_id
            WHERE bi.status = 'completed'
        ),
        'petty_cash_balance', (
            SELECT COALESCE(SUM(pc.current_balance), 0)
            FROM public.petty_cash_accounts pc
            WHERE pc.is_active
        ),
        'levy_count', levy.cnt,
        'levy_total_due', levy.total_due,
        'levy_total_paid', levy.total_paid,
        'levy_houses_pending', levy.houses_pending
    )
    FROM (
        SELECT
            COALESCE(SUM(i.amount_due) FILTER (WHERE i.status <> 'void'), 0) AS total_due,
            COALESCE(SUM(i.amount_paid) FILTER (WHERE i.status <> 'void'), 0) AS total_paid,
            COALESCE(SUM(i.amount_due - i.amount_paid)
                FILTER (WHERE i.status IN ('unpaid', 'partially_paid') AND i.due_date < p_today), 0) AS overdue_amount,
            COUNT(*) FILTER (WHERE i.status IN ('unpaid', 'partially_paid') AND i.due_date < p_today) AS overdue_count
        FROM public.invoices i
    ) inv,
    (
        SELECT
            COUNT(*) AS cnt,
            COALESCE(SUM(li.amount_due), 0) AS total_due,
            COALESCE(SUM(li.amount_paid), 0) AS total_paid,
            COUNT(DISTINCT li.house_id)
                FILTER (WHERE li.status <> 'paid' AND li.amount_due - li.amount_paid > 0) AS houses_pending
        FROM public.invoices li
        JOIN public.billing_profiles bp ON bp.id = li.billing_profile_id
        WHERE bp.is_development_levy AND li.status <> 'void'
    ) levy;
$$;

REVOKE ALL ON FUNCTION public.get_dashboard_financial_totals(date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_dashboard_financial_totals(date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_dashboard_financial_totals(date) TO authenticated, service_role;
