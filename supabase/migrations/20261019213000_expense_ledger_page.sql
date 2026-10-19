-- Migration: server-side page, count and total for the expense ledger (issue #785)
--
-- The /expenditure page downloaded every expense and filtered, searched, paged and totalled them
-- in the browser. get_expense_page() is now the one definition of the ledger's filters:
--
--   p_status       : expenses.status, NULL for all
--   p_category_id  : expenses.category_id, NULL for all
--   p_search       : case-insensitive substring of the description, category name, vendor name,
--                    resident first or last name, or staff full name (the previous client-side
--                    search). The caller escapes LIKE wildcards (sanitizeSearchInput); NULL or ''
--                    matches everything.
--   p_limit/offset : the page. p_limit 0 returns only the count and total.
--
-- Returns {"count": n, "total": x, "ids": [...]}; ids are the page in ledger order
-- (expense_date DESC, id DESC). The caller hydrates them with its usual joined select, so the row
-- shape the UI reads is unchanged. A function rather than a PostgREST filter because PostgREST
-- cannot OR one condition across four embedded tables, and aggregates are disabled on PostgREST.
--
-- SECURITY INVOKER on purpose: RLS applies as the caller, so the figures and rows are exactly what
-- the previous client-side query could see, including names hidden by RLS not matching a search.
-- Do not change to DEFINER.
--
-- ROLLBACK (the function is new; revert the TS caller first, then):
--   DROP FUNCTION IF EXISTS public.get_expense_page(text, uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.get_expense_page(
    p_status text DEFAULT NULL,
    p_category_id uuid DEFAULT NULL,
    p_search text DEFAULT NULL,
    p_limit integer DEFAULT 20,
    p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
    WITH matched AS (
        SELECT e.id, e.amount, e.expense_date
        FROM public.expenses e
        LEFT JOIN public.expense_categories c ON c.id = e.category_id
        LEFT JOIN public.vendors v ON v.id = e.vendor_id
        LEFT JOIN public.residents r ON r.id = e.resident_id
        LEFT JOIN public.profiles s ON s.id = e.staff_id
        WHERE (p_status IS NULL OR e.status::text = p_status)
          AND (p_category_id IS NULL OR e.category_id = p_category_id)
          AND (
              COALESCE(p_search, '') = ''
              OR e.description ILIKE '%' || p_search || '%'
              OR c.name ILIKE '%' || p_search || '%'
              OR v.name ILIKE '%' || p_search || '%'
              OR r.first_name ILIKE '%' || p_search || '%'
              OR r.last_name ILIKE '%' || p_search || '%'
              OR s.full_name ILIKE '%' || p_search || '%'
          )
    ),
    page AS (
        SELECT id, expense_date
        FROM matched
        ORDER BY expense_date DESC, id DESC
        LIMIT GREATEST(p_limit, 0)
        OFFSET GREATEST(p_offset, 0)
    )
    SELECT jsonb_build_object(
        'count', (SELECT COUNT(*) FROM matched),
        'total', (SELECT COALESCE(SUM(amount), 0) FROM matched),
        'ids', COALESCE((SELECT jsonb_agg(id ORDER BY expense_date DESC, id DESC) FROM page), '[]'::jsonb)
    );
$$;

REVOKE ALL ON FUNCTION public.get_expense_page(text, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_expense_page(text, uuid, text, integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_expense_page(text, uuid, text, integer, integer) TO authenticated, service_role;
