-- Who may grant or take away a role, enforced on profiles in the database (#991).
--
-- WHAT CHANGES
--   enforce_profile_role_rules() gains the grant rule of src/lib/auth/account-guards.ts and
--   src/lib/auth/board-roles.ts (#826, owner decision on #822), and its trigger
--   profiles_enforce_role_rules now also fires BEFORE DELETE:
--     - giving a profile super_admin, chairman or trustee needs system.assign_board_roles; any
--       other role needs system.assign_roles (INSERT with a role_id, or UPDATE that changes it);
--     - changing the role of, or deleting, a profile that holds super_admin or chairman needs
--       system.assign_board_roles; any other profile, a trustee's included, needs
--       system.assign_roles.
--   A refusal raises insufficient_privilege (42501) with the app's own messages. Every rule the
--   function already had (#823: title cleared on a role change, the resident link, the title's
--   role and seats) is unchanged and still runs on INSERT and UPDATE only.
--
-- WHY
--   The rule lived only in the server actions. The RLS policies on profiles let any holder of
--   system.assign_roles (chairman as well as super_admin) INSERT and DELETE rows, and nothing in
--   the database asked which role was being written, so a direct Data API call could set any
--   role. The database now asks the same question as the app, for every caller.
--
-- WHO IS CHECKED
--   Every write that carries a signed-in caller (auth.uid() not null): direct Data API writes,
--   and any SECURITY DEFINER function that writes profiles on that caller's behalf. The caller's
--   permissions come from public.has_permission(), the same helper the RLS policies use (an
--   active profile, its role, the role's active permissions).
--   Not checked, so they keep working:
--     - writes with no auth.uid(): service_role (every role write in the app goes through
--       createAdminClient), cron, migrations, and sign-up (handle_new_user() inserts role_id
--       NULL, which grants nothing in any case);
--     - removing a role (role_id set to NULL) from inside another trigger (pg_trigger_depth() > 1):
--       remove_resident_admin_roles() when a linked resident stops being active (#823), and the
--       ON DELETE SET NULL of profiles_role_id_fkey. Removal only: a nested write that sets a role
--       is checked like any other.
--   Grants are unchanged: authenticated still cannot UPDATE role_id at all (20261011120000), and
--   INSERT and DELETE still need system.assign_roles through RLS. This trigger is the second line
--   behind those, and the only one that knows which role is being written.
--
-- WHO IS AFFECTED: no app path. The app writes roles through the service role, and no session
--   client inserts or deletes profiles. A signed-in caller without the matching permission can no
--   longer write the role directly.
--
-- SECURITY: the function stays SECURITY DEFINER with SET search_path = '' and EXECUTE revoked from
--   the API roles (a trigger function cannot be called directly anyway); it reads app_roles past RLS
--   to name the role being written.
--
-- IDEMPOTENT: CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS before CREATE TRIGGER.
--
-- ROLLBACK (restores 20261022150000 exactly):
--   DROP TRIGGER IF EXISTS profiles_enforce_role_rules ON public.profiles;
--   CREATE TRIGGER profiles_enforce_role_rules
--     BEFORE INSERT OR UPDATE OF role_id, resident_id, title_id ON public.profiles
--     FOR EACH ROW
--     EXECUTE FUNCTION public.enforce_profile_role_rules();
--   Then re-run, unchanged, the CREATE OR REPLACE FUNCTION public.enforce_profile_role_rules() and
--   COMMENT ON FUNCTION statements of 20261022150000_admin_titles_and_resident_link.sql (its
--   section "4 and 5").
--
-- VERIFY (read-only, after applying):
--   SELECT pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname = 'profiles_enforce_role_rules';
--     -- BEFORE INSERT OR DELETE OR UPDATE OF role_id, resident_id, title_id
--   SELECT prosecdef, proconfig FROM pg_proc WHERE proname = 'enforce_profile_role_rules';
--     -- true, {search_path=""}
--   Then run docs/security/probe-991-role-grants.sql (rolled back): every row must say pass = true.

BEGIN;

CREATE OR REPLACE FUNCTION public.enforce_profile_role_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- The two lists of src/lib/auth/board-roles.ts. Trustee is deliberately absent from the second.
  v_board_grant_roles CONSTANT text[] := ARRAY['super_admin', 'chairman', 'trustee'];
  v_board_account_roles CONSTANT text[] := ARRAY['super_admin', 'chairman'];
  v_is_insert boolean := TG_OP = 'INSERT';
  v_old_role_name text;
  v_new_role_name text;
  v_role_name text;
  v_requires_resident boolean;
  v_title_name text;
  v_title_role uuid;
  v_seats integer;
  v_holders integer;
BEGIN
  -- SECURITY DEFINER: the seat count must see every profile and lock the title row, past RLS.

  -- Who may grant or take away a role (#991). No auth.uid(): service_role, cron, migrations, sign-up.
  IF (SELECT auth.uid()) IS NOT NULL THEN
    -- Taking a role away from, or deleting, an account: judged by the role it holds now.
    IF TG_OP = 'DELETE'
       OR (NOT v_is_insert
           AND NEW.role_id IS DISTINCT FROM OLD.role_id
           -- A removal made by another trigger (resident left, role deleted) is system policy.
           AND NOT (NEW.role_id IS NULL AND pg_trigger_depth() > 1)) THEN
      SELECT r.name INTO v_old_role_name FROM public.app_roles r WHERE r.id = OLD.role_id;

      IF NOT public.has_permission(
           CASE WHEN v_old_role_name = ANY (v_board_account_roles)
                THEN 'system.assign_board_roles' ELSE 'system.assign_roles' END) THEN
        RAISE EXCEPTION 'You do not have permission to change this account'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;

    -- Giving an account a role: judged by the role being given.
    IF TG_OP <> 'DELETE'
       AND NEW.role_id IS NOT NULL
       AND (v_is_insert OR NEW.role_id IS DISTINCT FROM OLD.role_id) THEN
      SELECT r.name INTO v_new_role_name FROM public.app_roles r WHERE r.id = NEW.role_id;

      IF NOT public.has_permission(
           CASE WHEN v_new_role_name = ANY (v_board_grant_roles)
                THEN 'system.assign_board_roles' ELSE 'system.assign_roles' END) THEN
        RAISE EXCEPTION 'You do not have permission to assign this role'
          USING ERRCODE = 'insufficient_privilege';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  -- A new role drops the old title unless this same UPDATE names a different one.
  IF NOT v_is_insert
     AND NEW.role_id IS DISTINCT FROM OLD.role_id
     AND NEW.title_id IS NOT DISTINCT FROM OLD.title_id THEN
    NEW.title_id := NULL;
  END IF;

  IF NEW.role_id IS NOT NULL
     AND NEW.resident_id IS NULL
     AND (v_is_insert
          OR NEW.role_id IS DISTINCT FROM OLD.role_id
          OR NEW.resident_id IS DISTINCT FROM OLD.resident_id) THEN
    SELECT r.name, r.requires_resident INTO v_role_name, v_requires_resident
    FROM public.app_roles r
    WHERE r.id = NEW.role_id;

    IF v_requires_resident THEN
      RAISE EXCEPTION 'The % role can only be held by an account linked to a resident', v_role_name
        USING ERRCODE = 'check_violation',
              HINT = 'Link the account to its resident record before assigning this role.';
    END IF;
  END IF;

  IF NEW.title_id IS NOT NULL
     AND (v_is_insert OR NEW.title_id IS DISTINCT FROM OLD.title_id) THEN
    -- The lock serializes writers claiming the same title, so the count below sees each other's rows.
    SELECT t.name, t.role_id, t.seats INTO v_title_name, v_title_role, v_seats
    FROM public.admin_titles t
    WHERE t.id = NEW.title_id
    FOR UPDATE;

    -- An unknown title_id is left to the foreign key, which reports it.
    IF FOUND THEN
      IF v_title_role IS DISTINCT FROM NEW.role_id THEN
        RAISE EXCEPTION 'The title % does not belong to this account''s role', v_title_name
          USING ERRCODE = 'check_violation';
      END IF;

      IF v_seats IS NOT NULL THEN
        SELECT count(*) INTO v_holders
        FROM public.profiles p
        WHERE p.title_id = NEW.title_id
          AND p.id <> NEW.id;

        IF v_holders >= v_seats THEN
          RAISE EXCEPTION 'The title % is full (% of % seats taken)', v_title_name, v_holders, v_seats
            USING ERRCODE = 'check_violation',
                  HINT = 'Remove the title from its current holder first.';
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_profile_role_rules() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.enforce_profile_role_rules() IS
'BEFORE INSERT OR DELETE OR UPDATE OF role_id, resident_id, title_id on profiles. For a signed-in caller (#991): granting super_admin, chairman or trustee needs system.assign_board_roles, any other role system.assign_roles; changing or deleting a super_admin or chairman account needs system.assign_board_roles, any other account system.assign_roles (a removal made by another trigger is exempt). On INSERT and UPDATE (#823): clears title_id on a role change, refuses a requires_resident role without resident_id, a title from another role, and a full title. Checks only values that change; never scans existing rows.';

DROP TRIGGER IF EXISTS profiles_enforce_role_rules ON public.profiles;
CREATE TRIGGER profiles_enforce_role_rules
  BEFORE INSERT OR DELETE OR UPDATE OF role_id, resident_id, title_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_rules();

COMMIT;
