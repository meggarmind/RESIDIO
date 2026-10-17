-- Migration: Limit what a resident can change on their own residents row (#728)
--
-- The "Residents can update own contact info" policy selects rows (id = get_my_resident_id())
-- but RLS cannot restrict columns, and authenticated holds table-level UPDATE on every column.
-- A signed-in resident could therefore set their own verification_status, account_status,
-- resident_type, portal_enabled, profile_id, verification timestamps or WhatsApp PIN hash
-- straight through the Data API.
--
-- Why a trigger and not column grants (the profiles fix, 20261011120000): admin edits to
-- residents run through the session client as authenticated, not through createAdminClient.
-- updateResident, updateResidentStatus, verifyResident, deleteResident, the move-out actions
-- and linkAuthAccountToResident all write admin-controlled columns as authenticated, under the
-- "Admins chairmen fin sec can update residents" policy. Revoking those columns from
-- authenticated would break every one of them.
--
-- Rule: a caller running as authenticated (or anon) whose role is not one of the roles in the
-- admin update policy may change only the self-service columns below. Any other column change
-- raises 42501. Changing email or phone_primary on the self path clears email_verified_at or
-- phone_verified_at, so a new contact never inherits the old one's verification. Not affected:
--   * the admin roles of "Admins chairmen fin sec can update residents" (same role list),
--   * service_role (createAdminClient: cron, webhooks, contact verification, WhatsApp),
--   * SQL with no API role (postgres, pg_cron) and SECURITY DEFINER functions, where
--     current_user is the function owner.
-- Columns added later are admin-only on the self path unless this list is widened.
-- notes is deliberately not self-service.
--
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.guard_residents_self_service_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  -- updated_at is set by the residents_updated_at trigger regardless of what the caller sends.
  self_service CONSTANT text[] := ARRAY[
    'email',
    'phone_primary',
    'phone_secondary',
    'emergency_contact_name',
    'emergency_contact_phone',
    'emergency_contact_relationship',
    'emergency_contact_resident_id',
    'liaison_contact_name',
    'liaison_contact_phone',
    'photo_url',
    'updated_at'
  ];
  blocked text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;

  -- Same role list as the "Admins chairmen fin sec can update residents" policy.
  IF public.get_my_role_name() = ANY (ARRAY['super_admin'::text, 'chairman'::text, 'vice_chairman'::text, 'financial_officer'::text]) THEN
    RETURN NEW;
  END IF;

  SELECT string_agg(n.key, ', ' ORDER BY n.key) INTO blocked
  FROM jsonb_each(to_jsonb(NEW)) AS n
  JOIN jsonb_each(to_jsonb(OLD)) AS o USING (key)
  WHERE n.value IS DISTINCT FROM o.value
    AND n.key <> ALL (self_service);

  IF blocked IS NOT NULL THEN
    RAISE EXCEPTION 'residents: only contact details may be changed on your own record (blocked: %)', blocked
      USING ERRCODE = '42501';
  END IF;

  -- A new email or phone is unverified, whatever the old one was.
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    NEW.email_verified_at := NULL;
  END IF;
  IF NEW.phone_primary IS DISTINCT FROM OLD.phone_primary THEN
    NEW.phone_verified_at := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS residents_guard_self_service_columns ON public.residents;
CREATE TRIGGER residents_guard_self_service_columns
  BEFORE UPDATE ON public.residents
  FOR EACH ROW EXECUTE FUNCTION public.guard_residents_self_service_columns();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS residents_guard_self_service_columns ON public.residents;
-- DROP FUNCTION IF EXISTS public.guard_residents_self_service_columns();
