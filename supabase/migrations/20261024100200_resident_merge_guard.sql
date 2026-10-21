-- Merge residents, insert guard (#987, database half of #821). Migration C of three, optional.
-- Depends on 20261024100000_resident_merge_schema.sql. Independent of 20261024100100: it can be
-- applied or withheld on its own.
--
-- WHAT CHANGES
--   public.refuse_merged_resident_reference(), a BEFORE INSERT trigger on payment_records, invoices,
--   resident_houses and wallet_transactions. It raises 23503 when the new row points at a resident
--   whose merged_into_resident_id is set (for wallet_transactions: whose wallet belongs to one).
--
-- WHY (risk M9 of the #821 design study)
--   merge_residents checks that nothing references the duplicate at merge time. A write against the
--   duplicate after the merge (an admin tab still open on the old record, a cron job, an import that
--   matched the old record) would put new money or a new house link on an archived record nobody
--   looks at. The guard turns that into an error naming the record to use instead.
--   The lookup locks the resident row FOR KEY SHARE. An insert racing a merge therefore waits for
--   the merge to commit and then sees merged_into_resident_id; a plain read would see the old
--   snapshot, let the row in, and the foreign key check would only wait, not refuse.
--
-- SECURITY: SECURITY DEFINER with SET search_path = '', so the lookup sees the resident whatever the
--   inserting caller's RLS allows. It returns NEW or raises; it exposes no data. EXECUTE is revoked
--   from the API roles (a trigger function cannot be called directly anyway).
--
-- WHO IS AFFECTED: nobody until a merge has run. Inserts for any resident that was never merged are
--   unchanged. merge_residents writes its zero-amount wallet row on the duplicate before it sets
--   merged_into_resident_id, so the merge itself passes the guard.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS before each CREATE TRIGGER.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS payment_records_refuse_merged_resident ON public.payment_records;
--   DROP TRIGGER IF EXISTS invoices_refuse_merged_resident ON public.invoices;
--   DROP TRIGGER IF EXISTS resident_houses_refuse_merged_resident ON public.resident_houses;
--   DROP TRIGGER IF EXISTS wallet_transactions_refuse_merged_resident ON public.wallet_transactions;
--   DROP FUNCTION IF EXISTS public.refuse_merged_resident_reference();
--
-- VERIFY (read-only, after applying):
--   SELECT tgrelid::regclass, tgname FROM pg_trigger
--    WHERE tgname LIKE '%_refuse_merged_resident' ORDER BY 1;                -- four rows
--   The probe docs/security/probe-821-merge.sql exercises it after a rolled-back merge.

BEGIN;

CREATE OR REPLACE FUNCTION public.refuse_merged_resident_reference()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_resident uuid;
  v_merged_into uuid;
BEGIN
  IF TG_TABLE_NAME = 'wallet_transactions' THEN
    SELECT w.resident_id INTO v_resident FROM public.resident_wallets w WHERE w.id = NEW.wallet_id;
  ELSE
    -- payment_records, invoices and resident_houses all name the resident in resident_id.
    v_resident := NEW.resident_id;
  END IF;

  IF v_resident IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.merged_into_resident_id INTO v_merged_into
    FROM public.residents r
   WHERE r.id = v_resident
     FOR KEY SHARE;

  IF v_merged_into IS NOT NULL THEN
    RAISE EXCEPTION 'Resident % was merged into resident %; write to that record instead', v_resident, v_merged_into
      USING ERRCODE = '23503';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.refuse_merged_resident_reference() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.refuse_merged_resident_reference() IS
  'BEFORE INSERT guard: refuses a new payment, invoice, house link or wallet row for a resident that was merged into another (#987).';

DROP TRIGGER IF EXISTS payment_records_refuse_merged_resident ON public.payment_records;
CREATE TRIGGER payment_records_refuse_merged_resident
  BEFORE INSERT ON public.payment_records
  FOR EACH ROW EXECUTE FUNCTION public.refuse_merged_resident_reference();

DROP TRIGGER IF EXISTS invoices_refuse_merged_resident ON public.invoices;
CREATE TRIGGER invoices_refuse_merged_resident
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.refuse_merged_resident_reference();

DROP TRIGGER IF EXISTS resident_houses_refuse_merged_resident ON public.resident_houses;
CREATE TRIGGER resident_houses_refuse_merged_resident
  BEFORE INSERT ON public.resident_houses
  FOR EACH ROW EXECUTE FUNCTION public.refuse_merged_resident_reference();

DROP TRIGGER IF EXISTS wallet_transactions_refuse_merged_resident ON public.wallet_transactions;
CREATE TRIGGER wallet_transactions_refuse_merged_resident
  BEFORE INSERT ON public.wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION public.refuse_merged_resident_reference();

COMMIT;
