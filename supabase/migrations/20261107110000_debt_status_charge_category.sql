-- get_debt_statuses: an optional charge (#1400).
--
-- WHAT CHANGES
--   public.get_debt_statuses gains a third argument, p_charge_category text DEFAULT NULL (a
--   charge_categories.code). With a code, only invoices of that charge are owed invoices and only that
--   charge's wallet is read, so the Dues, levies and collection status report can show one charge at a
--   time. With NULL (the default) the function does what it did before: every invoice counts and the
--   wallet figure is the sum of the resident's wallets. Every existing caller passes two arguments or
--   names its arguments, so each keeps working (get_resident_indebtedness calls it with two).
--   The body is the one in 20261103100000_charge_category_wallets.sql with the two category filters added.
--   The two-argument function is dropped and the three-argument one created, because CREATE OR REPLACE
--   cannot change an argument list. Without the drop, a call with two arguments would be ambiguous.
--   Grants and SECURITY INVOKER are as before.
--
-- ROLLBACK:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.get_debt_statuses(uuid[], uuid, text);
--   -- then re-run the CREATE FUNCTION, COMMENT, REVOKE and GRANT of the two-argument function from
--   -- 20261103100000_charge_category_wallets.sql
--   COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT pg_get_function_identity_arguments(oid) FROM pg_proc WHERE proname = 'get_debt_statuses';
--     -- one row: p_house_ids uuid[], p_resident_id uuid, p_charge_category text
--   SELECT count(*) FROM public.get_debt_statuses();                        -- the same as before the change
--   SELECT count(*) FROM public.get_debt_statuses(NULL, NULL, 'transformer_fee'); -- the same houses; none owed

BEGIN;

DROP FUNCTION IF EXISTS public.get_debt_statuses(uuid[], uuid);

CREATE FUNCTION public.get_debt_statuses(
  p_house_ids uuid[] DEFAULT NULL,
  p_resident_id uuid DEFAULT NULL,
  p_charge_category text DEFAULT NULL
)
RETURNS TABLE (
  house_id uuid,
  resident_id uuid,
  status text,
  owed_invoice_count integer,
  wallet_balance numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH params AS (
    SELECT
      (now() AT TIME ZONE 'Africa/Lagos')::date AS today,
      coalesce(
        (SELECT (s.value #>> '{}')::integer
           FROM public.system_settings s
          WHERE s.key = 'debt_status_arrears_threshold_months'
            AND s.value #>> '{}' ~ '^[0-9]{1,3}$'),
        3
      ) AS threshold
  ),
  targets AS (
    SELECT
      h.id AS house_id,
      coalesce(p_resident_id, (
        SELECT rh.resident_id
          FROM public.resident_houses rh
         WHERE rh.house_id = h.id
           AND rh.is_active
           AND rh.resident_role IN ('tenant', 'resident_landlord', 'non_resident_landlord')
         ORDER BY array_position(
                    ARRAY['tenant', 'resident_landlord', 'non_resident_landlord']::public.resident_role[],
                    rh.resident_role),
                  rh.move_in_date DESC
         LIMIT 1
      )) AS resident_id
    FROM public.houses h
    WHERE (p_house_ids IS NULL AND h.is_active) OR h.id = ANY (p_house_ids)
  ),
  owed AS (
    SELECT i.house_id, count(*)::integer AS n
      FROM public.invoices i
      CROSS JOIN params p
     WHERE i.house_id IN (SELECT t.house_id FROM targets t)
       AND i.status IN ('unpaid', 'partially_paid')
       AND i.amount_due > i.amount_paid
       AND coalesce(i.period_start, (i.created_at AT TIME ZONE 'Africa/Lagos')::date) <= p.today
       AND (p_resident_id IS NULL OR i.resident_id = p_resident_id)
       AND (p_charge_category IS NULL OR i.charge_category = p_charge_category)
     GROUP BY i.house_id
  )
  SELECT
    t.house_id,
    t.resident_id,
    CASE
      WHEN coalesce(o.n, 0) > p.threshold THEN 'arrears'
      WHEN coalesce(o.n, 0) > 0 THEN 'outstanding'
      WHEN coalesce(w.balance, 0) > 0 THEN 'credit'
      ELSE 'paid_in_full'
    END,
    coalesce(o.n, 0),
    coalesce(w.balance, 0)
  FROM targets t
  CROSS JOIN params p
  LEFT JOIN owed o ON o.house_id = t.house_id
  LEFT JOIN (SELECT rw.resident_id, sum(rw.balance) AS balance
               FROM public.resident_wallets rw
              WHERE p_charge_category IS NULL OR rw.charge_category = p_charge_category
              GROUP BY rw.resident_id) w ON w.resident_id = t.resident_id;
$$;

COMMENT ON FUNCTION public.get_debt_statuses(uuid[], uuid, text) IS
  'Debt status per house (arrears, outstanding, paid_in_full, credit) by the count of owed invoices whose period has started, plus the billed resident''s wallet (#980). Null house ids means every active house. A charge code limits it to that charge''s invoices and wallet (#1400).';

REVOKE EXECUTE ON FUNCTION public.get_debt_statuses(uuid[], uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_debt_statuses(uuid[], uuid, text) TO authenticated, service_role;

COMMIT;
