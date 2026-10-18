-- Migration: Only super_admin may change the email import auto-process limit (#710)
--
-- The owner decision on #710 limits changes to email_import_auto_process_limit to super_admin,
-- because a very large value switches the approval control off. updateSetting, updateSettings
-- and createSetting enforce that, but the system_settings INSERT/UPDATE policies also admit
-- chairman and vice_chairman, so either could write the row straight through the Data API and
-- skip the action's role check, validator and audit.
--
-- Why a trigger and not a policy change: the existing policies govern every other setting and
-- stay as they are. This guards one key only.
--
-- Rule: an INSERT, UPDATE or DELETE whose old or new row has the guarded key, made by a caller
-- running as authenticated (or anon) whose role is not super_admin, raises 42501. Not affected:
--   * every other system_settings key,
--   * super_admin through the session client (the settings actions),
--   * service_role (createAdminClient: the fetch-emails cron reads with it),
--   * SQL with no API role (postgres, pg_cron, migrations) and SECURITY DEFINER functions, where
--     current_user is the function owner.
--
-- Idempotent: CREATE OR REPLACE / DROP TRIGGER IF EXISTS.

CREATE OR REPLACE FUNCTION public.guard_email_import_auto_process_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  guarded_key CONSTANT text := 'email_import_auto_process_limit';
  touched boolean := false;
BEGIN
  IF TG_OP <> 'INSERT' THEN
    touched := OLD.key = guarded_key;
  END IF;
  IF TG_OP <> 'DELETE' THEN
    touched := touched OR NEW.key = guarded_key;
  END IF;

  IF touched
    AND current_user IN ('authenticated', 'anon')
    AND public.get_my_role_name() IS DISTINCT FROM 'super_admin' THEN
    RAISE EXCEPTION 'system_settings: only a super admin can change %', guarded_key
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS system_settings_guard_email_import_auto_process_limit ON public.system_settings;
CREATE TRIGGER system_settings_guard_email_import_auto_process_limit
  BEFORE INSERT OR UPDATE OR DELETE ON public.system_settings
  FOR EACH ROW EXECUTE FUNCTION public.guard_email_import_auto_process_limit();

-- ROLLBACK:
-- DROP TRIGGER IF EXISTS system_settings_guard_email_import_auto_process_limit ON public.system_settings;
-- DROP FUNCTION IF EXISTS public.guard_email_import_auto_process_limit();
