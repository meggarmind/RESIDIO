-- Collections ledger (#1194, slice 6 of #1188): money the estate collects outside billing.
--
-- WHAT CHANGES
--   collections                  one row per purpose. Type 'contribution' (the payer chooses the amount,
--                                optional target) or 'item_purchase' (the estate sets item_price, optional
--                                non_resident_price). Open and close dates, active flag.
--   collection_payers            a resident (resident_id) or a non-resident (full_name, phone, email).
--                                One payer row per resident; a non-resident row is reused for the next
--                                payment from the same person (matched by the app on phone or email).
--   collection_payments          one row per payment: collection, payer, optional house, quantity and
--                                unit price (item purchase), amount, date, method, reference, optional bank
--                                row, receipt number, optional item reference, given_at/given_by,
--                                recorded_by, reversed_at/reversed_by/reversal_reason. Never deleted:
--                                a wrong payment is reversed.
--   collection_notified_parties  optional, item purchase only: on a collection (every payment) or on one
--                                payment (that payment only). Name, email, SMS phone, WhatsApp phone and the
--                                channels to use.
--   collection_receipt_counters  yearly counter for receipt numbers COL-<YYYY>-<6 digits>, the same pattern
--                                as invoice_number_counters (#1169). The year is the payment date's year.
--   Permissions collections.view and collections.manage, granted to super_admin and chairman.
--
-- RULES THE DATABASE HOLDS
--   * An item purchase payment needs quantity and unit_price, and its amount is always
--     quantity x unit_price (the BEFORE INSERT trigger sets it). A contribution has neither.
--   * receipt_number is allocated on insert under the counter row's lock (never max()+1).
--   * collection_id, payer_id, amount, quantity, unit_price, payment_date and receipt_number cannot change
--     after insert. A wrong payment is reversed and recorded again.
--   * A notified party belongs to exactly one of a collection or a payment, of an item purchase collection,
--     and each chosen channel has its contact.
--   * Collections never touch wallets or invoices: no foreign key, trigger or function here writes to
--     resident_wallets, wallet_transactions, invoices or payment_records.
--
-- RLS (like payment_records): read needs collections.view, or the row is the reader's own as a resident
-- payer. Write needs collections.manage. collection_payments has no DELETE policy. The counter table has
-- no policies (service role and the trigger only). The server actions use the service role and check the
-- same permissions first.
--
-- WHO IS AFFECTED: nobody loses access. New objects only.
--
-- DEPENDS ON 20261103090000_add_collections_permission_category.sql.
--
-- VERIFY (run on the database after applying; expected results in brackets):
--   SELECT count(*) FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('collections',
--     'collection_payers', 'collection_payments', 'collection_notified_parties',
--     'collection_receipt_counters') AND rowsecurity;                                        -- [5]
--   SELECT r.name, p.name FROM public.role_permissions rp JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id WHERE p.category = 'collections'
--     ORDER BY 1, 2;                                         -- [chairman and super_admin, each with both]
--   SELECT has_function_privilege('authenticated',
--     'public.allocate_collection_receipt_number(date)', 'EXECUTE');                          -- [false]
--   SELECT count(*) FROM pg_policies WHERE tablename = 'collection_payments' AND cmd = 'DELETE';  -- [0]
--   -- Receipt number and item amount, without keeping anything:
--   BEGIN;
--     WITH c AS (INSERT INTO public.collections (name, collection_type, item_price)
--                VALUES ('verify', 'item_purchase', 2000) RETURNING id),
--          p AS (INSERT INTO public.collection_payers (full_name) VALUES ('verify') RETURNING id)
--     INSERT INTO public.collection_payments (collection_id, payer_id, quantity, unit_price, amount, method)
--     SELECT c.id, p.id, 2, 2000, 1, 'cash' FROM c, p RETURNING receipt_number, amount;
--                                                    -- [COL-<this year>-NNNNNN, 4000.00]
--   ROLLBACK;
--
-- ROLLBACK (roll the application code back first; role_permissions rows go with the permissions by
-- ON DELETE CASCADE):
--   DROP TABLE IF EXISTS public.collection_notified_parties;
--   DROP TABLE IF EXISTS public.collection_payments;
--   DROP TABLE IF EXISTS public.collection_payers;
--   DROP TABLE IF EXISTS public.collections;
--   DROP FUNCTION IF EXISTS public.collection_notified_party_check();
--   DROP FUNCTION IF EXISTS public.collection_payment_before_write();
--   DROP FUNCTION IF EXISTS public.allocate_collection_receipt_number(date);
--   DROP TABLE IF EXISTS public.collection_receipt_counters;
--   DELETE FROM public.app_permissions WHERE name IN ('collections.view', 'collections.manage');

BEGIN;

CREATE TABLE IF NOT EXISTS public.collections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  collection_type TEXT NOT NULL,
  opens_on DATE NOT NULL DEFAULT CURRENT_DATE,
  closes_on DATE,
  target_amount NUMERIC(12, 2),
  item_price NUMERIC(12, 2),
  non_resident_price NUMERIC(12, 2),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT collections_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT collections_type_check CHECK (collection_type IN ('contribution', 'item_purchase')),
  CONSTRAINT collections_dates_check CHECK (closes_on IS NULL OR closes_on >= opens_on),
  CONSTRAINT collections_target_positive CHECK (target_amount IS NULL OR target_amount > 0),
  CONSTRAINT collections_prices_positive CHECK (
    (item_price IS NULL OR item_price > 0) AND (non_resident_price IS NULL OR non_resident_price > 0)
  ),
  CONSTRAINT collections_amount_rule CHECK (
    (collection_type = 'contribution' AND item_price IS NULL AND non_resident_price IS NULL)
    OR (collection_type = 'item_purchase' AND item_price IS NOT NULL AND target_amount IS NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS collections_name_key ON public.collections (lower(btrim(name)));

CREATE TRIGGER collections_updated_at
  BEFORE UPDATE ON public.collections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.collection_payers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  resident_id UUID REFERENCES public.residents(id) ON DELETE RESTRICT,
  full_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT collection_payers_identity CHECK (
    resident_id IS NOT NULL OR length(btrim(coalesce(full_name, ''))) > 0
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS collection_payers_resident_key
  ON public.collection_payers (resident_id) WHERE resident_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.collection_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID NOT NULL REFERENCES public.collections(id) ON DELETE RESTRICT,
  payer_id UUID NOT NULL REFERENCES public.collection_payers(id) ON DELETE RESTRICT,
  house_id UUID REFERENCES public.houses(id) ON DELETE SET NULL,
  quantity INTEGER,
  unit_price NUMERIC(12, 2),
  amount NUMERIC(12, 2) NOT NULL,
  payment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  method public.payment_method NOT NULL,
  reference TEXT,
  bank_row_id UUID REFERENCES public.bank_statement_rows(id) ON DELETE SET NULL,
  receipt_number TEXT NOT NULL,
  item_reference TEXT,
  notes TEXT,
  given_at TIMESTAMPTZ,
  given_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  recorded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reversed_at TIMESTAMPTZ,
  reversed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reversal_reason TEXT,
  CONSTRAINT collection_payments_receipt_number_key UNIQUE (receipt_number),
  CONSTRAINT collection_payments_amount_positive CHECK (amount > 0),
  CONSTRAINT collection_payments_quantity_rule CHECK (
    (quantity IS NULL AND unit_price IS NULL)
    OR (quantity > 0 AND unit_price > 0 AND amount = quantity * unit_price)
  ),
  CONSTRAINT collection_payments_reversal_reason CHECK (
    reversed_at IS NULL OR length(btrim(coalesce(reversal_reason, ''))) > 0
  )
);

CREATE INDEX IF NOT EXISTS idx_collection_payments_collection ON public.collection_payments (collection_id, payment_date DESC);
CREATE INDEX IF NOT EXISTS idx_collection_payments_payer ON public.collection_payments (payer_id);
CREATE INDEX IF NOT EXISTS idx_collection_payments_house ON public.collection_payments (house_id) WHERE house_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.collection_notified_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id UUID REFERENCES public.collections(id) ON DELETE CASCADE,
  collection_payment_id UUID REFERENCES public.collection_payments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  sms_phone TEXT,
  whatsapp_phone TEXT,
  channels TEXT[] NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT collection_notified_parties_one_owner CHECK (num_nonnulls(collection_id, collection_payment_id) = 1),
  CONSTRAINT collection_notified_parties_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT collection_notified_parties_channels CHECK (
    cardinality(channels) > 0
    AND channels <@ ARRAY['email', 'sms', 'whatsapp']::text[]
    AND (NOT 'email' = ANY (channels) OR email IS NOT NULL)
    AND (NOT 'sms' = ANY (channels) OR sms_phone IS NOT NULL)
    AND (NOT 'whatsapp' = ANY (channels) OR whatsapp_phone IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_collection_notified_parties_collection
  ON public.collection_notified_parties (collection_id) WHERE collection_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_collection_notified_parties_payment
  ON public.collection_notified_parties (collection_payment_id) WHERE collection_payment_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.collection_receipt_counters (
  year INT PRIMARY KEY,
  last_value INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.collection_receipt_counters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.collection_receipt_counters FROM anon, authenticated;

-- Internal: the next COL-<YYYY>-<NNNNNN> for the year of p_payment_date. One upsert on the year's row, so
-- the row lock serialises concurrent callers. Skips a value already used, like allocate_invoice_number.
CREATE OR REPLACE FUNCTION public.allocate_collection_receipt_number(p_payment_date date)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_year int;
    v_value int;
    v_number text;
BEGIN
    IF p_payment_date IS NULL THEN
        RAISE EXCEPTION 'allocate_collection_receipt_number requires a payment date';
    END IF;

    v_year := extract(year FROM p_payment_date)::int;

    LOOP
        INSERT INTO public.collection_receipt_counters (year, last_value)
        VALUES (v_year, 1)
        ON CONFLICT (year) DO UPDATE
            SET last_value = collection_receipt_counters.last_value + 1,
                updated_at = now()
        RETURNING last_value INTO v_value;

        v_number := format('COL-%s-%s', v_year, lpad(v_value::text, 6, '0'));

        EXIT WHEN NOT EXISTS (
            SELECT 1 FROM public.collection_payments WHERE receipt_number = v_number
        );
    END LOOP;

    RETURN v_number;
END;
$function$;

REVOKE ALL ON FUNCTION public.allocate_collection_receipt_number(date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.allocate_collection_receipt_number(date) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_collection_receipt_number(date) TO service_role;

-- Insert: check the amount rule against the collection's type, set amount = quantity x unit_price for an
-- item purchase, and allocate the receipt number. Update: the money and identity fields are fixed.
CREATE OR REPLACE FUNCTION public.collection_payment_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_type text;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.collection_id IS DISTINCT FROM OLD.collection_id
           OR NEW.payer_id IS DISTINCT FROM OLD.payer_id
           OR NEW.amount IS DISTINCT FROM OLD.amount
           OR NEW.quantity IS DISTINCT FROM OLD.quantity
           OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
           OR NEW.payment_date IS DISTINCT FROM OLD.payment_date
           OR NEW.receipt_number IS DISTINCT FROM OLD.receipt_number THEN
            RAISE EXCEPTION 'A collection payment''s collection, payer, amount, quantity, price, date and receipt number cannot change; reverse it and record it again'
                USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;

    SELECT collection_type INTO v_type FROM public.collections WHERE id = NEW.collection_id;
    IF v_type = 'item_purchase' THEN
        IF NEW.quantity IS NULL OR NEW.unit_price IS NULL THEN
            RAISE EXCEPTION 'An item purchase payment needs a quantity and a price per item' USING ERRCODE = '23514';
        END IF;
        NEW.amount := NEW.quantity * NEW.unit_price;
    ELSIF v_type = 'contribution' THEN
        IF NEW.quantity IS NOT NULL OR NEW.unit_price IS NOT NULL THEN
            RAISE EXCEPTION 'A contribution payment has no quantity or price per item' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.receipt_number IS NULL THEN
        NEW.receipt_number := public.allocate_collection_receipt_number(NEW.payment_date);
    END IF;

    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.collection_payment_before_write() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER collection_payments_before_write
  BEFORE INSERT OR UPDATE ON public.collection_payments
  FOR EACH ROW EXECUTE FUNCTION public.collection_payment_before_write();

-- A notified party is for item purchases only (owner decision 9).
CREATE OR REPLACE FUNCTION public.collection_notified_party_check()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
    v_type text;
BEGIN
    SELECT c.collection_type INTO v_type
    FROM public.collections c
    WHERE c.id = COALESCE(
        NEW.collection_id,
        (SELECT p.collection_id FROM public.collection_payments p WHERE p.id = NEW.collection_payment_id)
    );
    IF v_type IS DISTINCT FROM 'item_purchase' THEN
        RAISE EXCEPTION 'A notified party can be added to an item purchase collection only' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.collection_notified_party_check() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER collection_notified_parties_check
  BEFORE INSERT OR UPDATE ON public.collection_notified_parties
  FOR EACH ROW EXECUTE FUNCTION public.collection_notified_party_check();

ALTER TABLE public.collections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_payers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.collection_notified_parties ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.collections, public.collection_payers, public.collection_payments,
  public.collection_notified_parties FROM anon;
GRANT ALL ON TABLE public.collections, public.collection_payers, public.collection_payments,
  public.collection_notified_parties, public.collection_receipt_counters TO service_role;

CREATE POLICY collections_select ON public.collections
  FOR SELECT TO authenticated USING ((select has_permission('collections.view')));
CREATE POLICY collections_write ON public.collections
  FOR ALL TO authenticated
  USING ((select has_permission('collections.manage')))
  WITH CHECK ((select has_permission('collections.manage')));

CREATE POLICY collection_payers_select ON public.collection_payers
  FOR SELECT TO authenticated
  USING (resident_id = (select get_my_resident_id()) OR (select has_permission('collections.view')));
CREATE POLICY collection_payers_insert ON public.collection_payers
  FOR INSERT TO authenticated WITH CHECK ((select has_permission('collections.manage')));
CREATE POLICY collection_payers_update ON public.collection_payers
  FOR UPDATE TO authenticated
  USING ((select has_permission('collections.manage')))
  WITH CHECK ((select has_permission('collections.manage')));

CREATE POLICY collection_payments_select ON public.collection_payments
  FOR SELECT TO authenticated
  USING (
    payer_id IN (SELECT id FROM public.collection_payers WHERE resident_id = (select get_my_resident_id()))
    OR (select has_permission('collections.view'))
  );
CREATE POLICY collection_payments_insert ON public.collection_payments
  FOR INSERT TO authenticated WITH CHECK ((select has_permission('collections.manage')));
CREATE POLICY collection_payments_update ON public.collection_payments
  FOR UPDATE TO authenticated
  USING ((select has_permission('collections.manage')))
  WITH CHECK ((select has_permission('collections.manage')));

CREATE POLICY collection_notified_parties_select ON public.collection_notified_parties
  FOR SELECT TO authenticated USING ((select has_permission('collections.view')));
CREATE POLICY collection_notified_parties_write ON public.collection_notified_parties
  FOR ALL TO authenticated
  USING ((select has_permission('collections.manage')))
  WITH CHECK ((select has_permission('collections.manage')));

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('collections.view', 'View Collections', 'View collections, their payments and reports', 'collections', true),
  ('collections.manage', 'Manage Collections', 'Create collections, record and reverse collection payments, mark items given and set notified parties', 'collections', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman')
  AND p.name IN ('collections.view', 'collections.manage')
ON CONFLICT DO NOTHING;

COMMIT;
