-- One shared account balance for statements and the WhatsApp Assistant (#863, part of #804 and #794).
--
-- WHAT CHANGES
--   1. Adds public.resident_account_balance(p_resident_id, p_house_id, p_from, p_to), a roll-forward
--      ledger that never reads invoices.amount_paid:
--        balance(D) = Σ amount_due of non-void invoices dated on or before D
--                   + Σ non-mirrored wallet debits on or before D
--                   − Σ verified paid payments on or before D         (#804 decision 18)
--                   − Σ non-mirrored wallet credits on or before D
--      It returns opening_balance = balance(p_from − 1 day), closing_balance = balance(p_to), the
--      period's totals per type, and awaiting_verification (unverified paid or pending payments
--      dated on or before p_to, which the balance leaves out). Positive means owed, negative credit.
--   2. Seeds system_settings.balance_roll_forward_resident_enabled = false.
--
-- RULES (owner decisions on #863, do not re-litigate)
--   - An invoice is dated by period_start, else by created_at in Africa/Lagos (decision 6).
--     Payments are dated by payment_date; wallet rows by created_at in Africa/Lagos.
--   - Wallet rows count only when p_house_id is null (all properties, decision 7). Mirrored wallet
--     rows (reference_type 'invoice' or 'payment') only echo an allocation or a payment already
--     counted, the rule in src/lib/billing/statement-ledger.ts (#810), so they never count.
--   - Rows are matched by resident_id, not by current occupancy: a house the resident has left
--     still carries what they were billed and paid there.
--   - SECURITY INVOKER: the caller's RLS applies, exactly as for the statement's own queries.
--
-- WHY
--   The admin statement's opening balance used each earlier invoice's current amount_paid, so a
--   payment made inside the period for an earlier invoice was counted twice (an April invoice
--   paid in May made a May to October statement close in credit). The bot's "What I owe" figure
--   was unpaid-on-invoices, floored at zero, so it hid wallet credit and counted payments
--   allocated before verification. The admin statement uses this function at once. Residents get
--   it only when balance_roll_forward_resident_enabled is turned on, after the owner creates the
--   missing legacy charges as invoices: until then the correct balance shows false credit for
--   residents whose legacy dues were paid but never invoiced (decision 8).
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION; ON CONFLICT DO NOTHING.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.resident_account_balance(uuid, uuid, date, date);
--   DELETE FROM public.system_settings WHERE key = 'balance_roll_forward_resident_enabled';
--   (Resident surfaces read a missing setting as off. The admin statement needs the function, so
--   revert the application change before dropping it.)
--
-- VERIFY (read-only, run on the database after applying):
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'resident_account_balance';  -- one row, prosecdef false
--   SELECT key, value FROM public.system_settings WHERE key = 'balance_roll_forward_resident_enabled';  -- false
--
--   -- The function against the old computations, for a sample of residents with invoices.
--   -- old_owed is the bot's old figure (Σ amount_due − amount_paid on unpaid invoices, floored at 0);
--   -- old_opening is the admin statement's old opening balance for a statement starting 2026-05-01.
--   -- They differ wherever a payment was never invoiced, a payment is unverified, or the wallet
--   -- holds non-mirrored credit; new_check must equal new.closing_balance on every row.
--   WITH sample AS (SELECT DISTINCT resident_id FROM public.invoices LIMIT 20)
--   SELECT s.resident_id,
--          (SELECT greatest(coalesce(sum(i.amount_due - i.amount_paid), 0), 0) FROM public.invoices i
--             WHERE i.resident_id = s.resident_id AND i.status IN ('unpaid', 'partially_paid')) AS old_owed,
--          (SELECT coalesce(sum(i.amount_due - i.amount_paid), 0) FROM public.invoices i
--             WHERE i.resident_id = s.resident_id AND i.status <> 'void'
--               AND coalesce(i.period_start, i.created_at::date) < DATE '2026-05-01') AS old_opening,
--          b.opening_balance, b.closing_balance, b.total_invoiced, b.total_paid,
--          b.total_wallet_credits, b.total_wallet_debits, b.awaiting_verification,
--          b.opening_balance + b.total_invoiced + b.total_wallet_debits - b.total_paid - b.total_wallet_credits AS new_check
--   FROM sample s
--   CROSS JOIN LATERAL public.resident_account_balance(s.resident_id, NULL, DATE '2026-05-01', (now() AT TIME ZONE 'Africa/Lagos')::date) b;

CREATE OR REPLACE FUNCTION public.resident_account_balance(
  p_resident_id uuid,
  p_house_id uuid,
  p_from date,
  p_to date
)
RETURNS TABLE (
  opening_balance numeric,
  closing_balance numeric,
  total_invoiced numeric,
  total_paid numeric,
  total_wallet_credits numeric,
  total_wallet_debits numeric,
  awaiting_verification numeric
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH entries AS (
    SELECT 'invoice'::text AS kind,
           coalesce(i.period_start, (i.created_at AT TIME ZONE 'Africa/Lagos')::date) AS on_date,
           i.amount_due AS amount
    FROM public.invoices i
    WHERE i.resident_id = p_resident_id
      AND i.status <> 'void'
      AND (p_house_id IS NULL OR i.house_id = p_house_id)
    UNION ALL
    SELECT 'payment', p.payment_date, -p.amount
    FROM public.payment_records p
    WHERE p.resident_id = p_resident_id
      AND p.status = 'paid'
      AND p.is_verified
      AND (p_house_id IS NULL OR p.house_id = p_house_id)
    UNION ALL
    SELECT CASE WHEN w.type = 'credit' THEN 'wallet_credit' ELSE 'wallet_debit' END,
           (w.created_at AT TIME ZONE 'Africa/Lagos')::date,
           CASE WHEN w.type = 'credit' THEN -w.amount ELSE w.amount END
    FROM public.wallet_transactions w
    JOIN public.resident_wallets rw ON rw.id = w.wallet_id
    WHERE rw.resident_id = p_resident_id
      AND p_house_id IS NULL
      AND (w.reference_type IS NULL OR w.reference_type NOT IN ('invoice', 'payment'))
  )
  SELECT
    coalesce(sum(e.amount) FILTER (WHERE e.on_date < p_from), 0),
    coalesce(sum(e.amount) FILTER (WHERE e.on_date <= p_to), 0),
    coalesce(sum(e.amount) FILTER (WHERE e.kind = 'invoice' AND e.on_date BETWEEN p_from AND p_to), 0),
    coalesce(-sum(e.amount) FILTER (WHERE e.kind = 'payment' AND e.on_date BETWEEN p_from AND p_to), 0),
    coalesce(-sum(e.amount) FILTER (WHERE e.kind = 'wallet_credit' AND e.on_date BETWEEN p_from AND p_to), 0),
    coalesce(sum(e.amount) FILTER (WHERE e.kind = 'wallet_debit' AND e.on_date BETWEEN p_from AND p_to), 0),
    (SELECT coalesce(sum(u.amount), 0)
       FROM public.payment_records u
      WHERE u.resident_id = p_resident_id
        -- A payment reported over WhatsApp is pending until an admin verifies it (#816 decision 11).
        AND u.status IN ('paid', 'pending')
        AND NOT u.is_verified
        AND u.payment_date <= p_to
        AND (p_house_id IS NULL OR u.house_id = p_house_id))
  FROM entries e;
$$;

COMMENT ON FUNCTION public.resident_account_balance(uuid, uuid, date, date) IS
  'Roll-forward account balance for a resident (all properties when p_house_id is null): opening, closing, period totals and awaiting verification. Never reads invoices.amount_paid (#863).';

REVOKE EXECUTE ON FUNCTION public.resident_account_balance(uuid, uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.resident_account_balance(uuid, uuid, date, date) TO authenticated, service_role;

INSERT INTO public.system_settings (key, value, description, category)
VALUES (
  'balance_roll_forward_resident_enabled',
  'false'::jsonb,
  'Show residents the roll-forward account balance (WhatsApp What I owe, statement PDFs, portal). Leave off until legacy charges are invoiced.',
  'billing'
)
ON CONFLICT (key) DO NOTHING;
