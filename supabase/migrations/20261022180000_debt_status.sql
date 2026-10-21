-- One app-wide debt status for a house (#980, parent #290).
--
-- WHAT CHANGES
--   1. Adds public.get_debt_statuses(p_house_ids, p_resident_id), the one place the debt status rule
--      lives. Set-based: one call classifies every house in the array (or every active house when the
--      array is null), so a report covers the estate in one query. One row per house:
--        house_id, resident_id (whose wallet was read), status, owed_invoice_count, wallet_balance.
--      The TypeScript wrapper is getDebtStatuses in src/lib/billing/debt-status.ts.
--   2. Seeds the permission settings.manage_debt_status, granted to every role that holds both
--      settings.manage_billing and settings.write_system (chairman and super_admin on Residio_Stage,
--      2026-10-21). The second is what the system_settings write policies check, so a role without it
--      could open the page but not save. No role gains a write it lacks today.
--   3. Seeds the editable settings: the four labels, the month threshold (3), the report footnote and the
--      chat-PDF house limit (40).
--
-- RULES (owner decisions on #980, 2026-10-21, do not re-litigate)
--   - Owed invoice: status unpaid or partially_paid, something still due, and its period has started.
--     An invoice is dated by period_start, else by created_at in Africa/Lagos (the #863 rule); every
--     insert path in src and the generator sets period_start. "Today" is the Africa/Lagos date.
--   - 1 to the threshold owed invoices is outstanding; more than the threshold is arrears. A part-paid
--     invoice counts as one owed invoice. Nothing owed with wallet credit is credit, otherwise paid_in_full.
--   - The threshold is debt_status_arrears_threshold_months (default 3 when missing or malformed).
--   - Credit for a house reads the wallet of the billed resident: the active tenant, else the resident
--     landlord, else the non-resident landlord (the invoice generator's order), newest move-in first.
--     With p_resident_id the house counts only that resident's invoices and reads that resident's wallet.
--   - SECURITY INVOKER: the caller's RLS applies. A caller who cannot read a wallet
--     (billing.manage_wallets) sees 0 there, and one who cannot read system_settings (settings.view) gets
--     the default threshold. The WhatsApp and report paths run as service role.
--   - No index: the query is one pass over non-void invoices (idx_invoices_status_not_void) joined by
--     house, and Residio_Stage and Residio_Prod held 0 invoices on 2026-10-21, so EXPLAIN shows no need.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION; ON CONFLICT DO NOTHING on every insert.
--
-- ROLLBACK:
--   BEGIN;
--   DROP FUNCTION IF EXISTS public.get_debt_statuses(uuid[], uuid);
--   DELETE FROM public.role_permissions
--     WHERE permission_id IN (SELECT id FROM public.app_permissions WHERE name = 'settings.manage_debt_status');
--   DELETE FROM public.app_permissions WHERE name = 'settings.manage_debt_status';
--   DELETE FROM public.system_settings WHERE key LIKE 'debt\_status\_%';
--   COMMIT;
--   (Revert the application change first: the Settings page and getDebtStatuses need all three.)
--
-- VERIFY (run on the database after applying):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'get_debt_statuses';  -- one row, prosecdef false
--   SELECT r.name FROM public.app_permissions p
--     JOIN public.role_permissions rp ON rp.permission_id = p.id JOIN public.app_roles r ON r.id = rp.role_id
--    WHERE p.name = 'settings.manage_debt_status' ORDER BY 1;  -- chairman, super_admin on Residio_Stage
--   SELECT key, value FROM public.system_settings WHERE key LIKE 'debt\_status\_%' ORDER BY key;  -- 7 rows
--   SELECT status, count(*) FROM public.get_debt_statuses(NULL) GROUP BY 1;  -- one row per active house

BEGIN;

CREATE OR REPLACE FUNCTION public.get_debt_statuses(
  p_house_ids uuid[] DEFAULT NULL,
  p_resident_id uuid DEFAULT NULL
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
  LEFT JOIN public.resident_wallets w ON w.resident_id = t.resident_id;
$$;

COMMENT ON FUNCTION public.get_debt_statuses(uuid[], uuid) IS
  'Debt status per house (arrears, outstanding, paid_in_full, credit) by the count of owed invoices whose period has started, plus the billed resident''s wallet (#980). Null house ids means every active house.';

REVOKE EXECUTE ON FUNCTION public.get_debt_statuses(uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_debt_statuses(uuid[], uuid) TO authenticated, service_role;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
  'settings.manage_debt_status',
  'Manage Debt Status Settings',
  'Edit the debt status labels, the arrears threshold, the report footnote and the chat-PDF house limit',
  'settings',
  true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT held.role_id, p.id
FROM (
  SELECT rp.role_id
    FROM public.role_permissions rp
    JOIN public.app_permissions ap ON ap.id = rp.permission_id
   WHERE ap.name IN ('settings.manage_billing', 'settings.write_system')
   GROUP BY rp.role_id
  HAVING count(DISTINCT ap.name) = 2
) held
CROSS JOIN public.app_permissions p
WHERE p.name = 'settings.manage_debt_status'
ON CONFLICT DO NOTHING;

INSERT INTO public.system_settings (key, value, description, category)
VALUES
  ('debt_status_label_arrears', '"Arrears"'::jsonb, 'Debt status label: owes more invoices than the arrears threshold', 'billing'),
  ('debt_status_label_outstanding', '"Outstanding"'::jsonb, 'Debt status label: owes from 1 invoice up to the arrears threshold', 'billing'),
  ('debt_status_label_paid_in_full', '"Paid in Full"'::jsonb, 'Debt status label: owes nothing and has no wallet credit', 'billing'),
  ('debt_status_label_credit', '"Credit"'::jsonb, 'Debt status label: owes nothing and has wallet credit', 'billing'),
  ('debt_status_arrears_threshold_months', '3'::jsonb, 'Owed invoices up to this count are Outstanding; more is Arrears', 'billing'),
  ('debt_status_report_footnote', '"For any unlisted residence, contact the Financial Secretary."'::jsonb, 'Footnote printed on the debt status report', 'billing'),
  ('debt_status_chat_pdf_house_limit', '40'::jsonb, 'A debt status PDF covering more houses than this goes by email instead of chat', 'billing')
ON CONFLICT (key) DO NOTHING;

COMMIT;
