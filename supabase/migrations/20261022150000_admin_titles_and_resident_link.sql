-- Admin titles, seats and the resident-link rule for admin roles (#823, slice 1 of the RBAC redesign #822).
--
-- WHAT CHANGES
--   1. app_roles.requires_resident boolean NOT NULL DEFAULT false. A role flagged true may only be
--      held by a profile linked to a resident (profiles.resident_id).
--   2. public.admin_titles: the controlled list of titles under a role, such as Vice Chairman under
--      chairman. seats NULL means unlimited, otherwise >= 1. Name unique per role, at most one
--      principal title per role. RLS: any signed-in user may read; writes need system.manage_roles.
--   3. profiles.title_id, nullable, ON DELETE SET NULL. Signed-in users may read it (the per-column
--      SELECT convention of 20261012210000); only service_role may write it (20261011120000).
--   4. Trigger profiles_enforce_role_rules (BEFORE INSERT OR UPDATE OF role_id, resident_id, title_id):
--        - a changed role_id clears title_id unless the same UPDATE gives a new title_id;
--        - refuses a requires_resident role with resident_id NULL;
--        - refuses a title that does not belong to role_id;
--        - refuses a title whose seats are already taken by other profiles.
--      Each rule runs only when a column it reads actually changes value, or on INSERT. Existing
--      rows are never scanned, and a write that names a column without changing it is not
--      re-checked: Stage has existing violators that slice 6 fixes.
--   5. Trigger residents_remove_admin_roles (AFTER UPDATE OF account_status, only when the status
--      moves from 'active' to anything else): every profile linked to that resident whose role has
--      requires_resident loses role_id and title_id, with one audit_logs row each
--      (action UNASSIGN, entity_type 'profiles', entity_id the profile id). Moving back to 'active'
--      does not restore the role.
--
-- WHY
--   profiles held one role_id and nothing else: no "Vice Chairman under the chairman role", no seat
--   limit, and nothing stopped a resident admin role going to a profile with no resident, so
--   officers who move out kept admin access. Owner decisions on #822 (2026-10-19).
--
-- MOVE-OUT (checked 2026-10-21): confirmMoveOut in src/actions/residents/move-out-renter.ts and
--   the owner move-out in src/actions/residents/move-out-owner.ts both set residents.account_status
--   to 'inactive', so both reach the removal trigger. delete-resident.ts archives (account_status
--   'archived'), which also reaches it. update-resident-status.ts can set any status.
--
-- WHO IS AFFECTED: nobody yet. No role is flagged requires_resident by this migration (slice 3 seeds
--   the flags and the titles), so the resident rule and the automatic removal cannot fire;
--   admin_titles starts empty, so no profile can carry a title; no existing profile row is
--   updated or validated.
--
-- SECURITY
--   Both trigger functions are SECURITY DEFINER with SET search_path = '':
--   - enforce_profile_role_rules must count every holder of a title and lock the title row, and
--     profiles and admin_titles are under RLS, so an invoker who sees only their own profile would
--     undercount seats, and SELECT ... FOR UPDATE would need admin_titles UPDATE rights.
--   - remove_resident_admin_roles updates other users' profiles and writes audit_logs on behalf of
--     whoever changed the resident, including service_role and cron callers with no auth.uid().
--   Neither takes arguments or returns data to the caller; EXECUTE is revoked from the API roles
--   (a trigger function cannot be called directly anyway).
--   Seats: the title row is locked FOR UPDATE before the holders are counted, so two writers taking
--   the last seat serialize and the second sees the first's row. shortcut: this relies on
--   READ COMMITTED (the PostgREST and Supabase default); a REPEATABLE READ writer counts from its
--   own snapshot and could overfill a seat. Switch to a seat-claim table with a unique index if a
--   caller ever needs a stricter isolation level.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, CREATE TABLE / INDEX IF NOT EXISTS, DROP ... IF EXISTS
--   before each policy and trigger, CREATE OR REPLACE FUNCTION.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS residents_remove_admin_roles ON public.residents;
--   DROP TRIGGER IF EXISTS profiles_enforce_role_rules ON public.profiles;
--   DROP FUNCTION IF EXISTS public.remove_resident_admin_roles();
--   DROP FUNCTION IF EXISTS public.enforce_profile_role_rules();
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS title_id;
--   DROP TABLE IF EXISTS public.admin_titles;
--   ALTER TABLE public.app_roles DROP COLUMN IF EXISTS requires_resident;
--   (Roles removed by the trigger are not restored; their old role_id is in audit_logs.old_values.)
--
-- VERIFY (read-only, run on the database after applying):
--   SELECT count(*) FROM public.app_roles WHERE requires_resident;              -- 0 until slice 3
--   SELECT count(*) FROM public.admin_titles;                                    -- 0 until slice 3
--   SELECT count(*) FROM public.profiles WHERE title_id IS NOT NULL;             -- 0
--   SELECT proname, prosecdef, proconfig FROM pg_proc
--   WHERE proname IN ('enforce_profile_role_rules', 'remove_resident_admin_roles');
--     -- two rows, prosecdef true, proconfig {search_path=""}
--   SELECT tgname, tgenabled FROM pg_trigger
--   WHERE tgname IN ('profiles_enforce_role_rules', 'residents_remove_admin_roles');  -- two rows, 'O'
--   SELECT policyname, cmd FROM pg_policies WHERE tablename = 'admin_titles';   -- select, insert, update, delete
--   SELECT has_column_privilege('authenticated', 'public.profiles', 'title_id', 'SELECT'),  -- true
--          has_column_privilege('authenticated', 'public.profiles', 'title_id', 'UPDATE');  -- false
--
--   -- Probe: exercises every rule, then ROLLBACK leaves nothing behind. Needs three profiles that
--   -- do not hold super_admin and an active resident with no linked profile. Prints
--   -- 'admin_titles probe passed'; any other outcome raises.
--   BEGIN;
--   DO $probe$
--   DECLARE
--     v_role uuid; v_other_role uuid; v_title uuid; v_other_title uuid; v_resident uuid;
--     v_p1 uuid; v_p2 uuid; v_p3 uuid; v_role_after uuid; v_title_after uuid;
--   BEGIN
--     SELECT id INTO v_role FROM public.app_roles WHERE name = 'secretary';
--     SELECT id INTO v_other_role FROM public.app_roles WHERE name = 'security_officer';
--     UPDATE public.app_roles SET requires_resident = true WHERE id = v_role;
--     INSERT INTO public.admin_titles (role_id, name, is_principal, seats)
--       VALUES (v_role, 'Probe Secretary', true, 1) RETURNING id INTO v_title;
--     INSERT INTO public.admin_titles (role_id, name, is_principal, seats)
--       VALUES (v_other_role, 'Probe CSO', true, 1) RETURNING id INTO v_other_title;
--     SELECT id INTO v_p1 FROM public.profiles p
--       WHERE p.role_id IS DISTINCT FROM (SELECT id FROM public.app_roles WHERE name = 'super_admin')
--       ORDER BY id LIMIT 1;
--     SELECT id INTO v_p2 FROM public.profiles p
--       WHERE p.role_id IS DISTINCT FROM (SELECT id FROM public.app_roles WHERE name = 'super_admin')
--       ORDER BY id OFFSET 1 LIMIT 1;
--     SELECT id INTO v_p3 FROM public.profiles p
--       WHERE p.role_id IS DISTINCT FROM (SELECT id FROM public.app_roles WHERE name = 'super_admin')
--       ORDER BY id OFFSET 2 LIMIT 1;
--     SELECT r.id INTO v_resident FROM public.residents r
--       WHERE r.account_status = 'active'
--         AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.resident_id = r.id)
--       LIMIT 1;
--     IF v_p3 IS NULL OR v_resident IS NULL THEN RAISE EXCEPTION 'probe setup: not enough rows'; END IF;
--
--     -- 1. A requires_resident role on a profile with no resident_id is refused.
--     UPDATE public.profiles SET resident_id = NULL WHERE id = v_p1;
--     BEGIN
--       UPDATE public.profiles SET role_id = v_role WHERE id = v_p1;
--       RAISE EXCEPTION 'probe 1 failed: resident role accepted without resident_id';
--     EXCEPTION WHEN check_violation THEN NULL;
--     END;
--     UPDATE public.profiles SET resident_id = v_resident, role_id = v_role, title_id = v_title
--       WHERE id = v_p1;                                                       -- accepted
--
--     -- 2. A title from another role is refused.
--     BEGIN
--       UPDATE public.profiles SET title_id = v_other_title WHERE id = v_p1;
--       RAISE EXCEPTION 'probe 2 failed: wrong-role title accepted';
--     EXCEPTION WHEN check_violation THEN NULL;
--     END;
--
--     -- 3. A full title is refused (seats = 1).
--     UPDATE public.profiles SET role_id = v_other_role, title_id = v_other_title WHERE id = v_p2;
--     BEGIN
--       UPDATE public.profiles SET role_id = v_other_role, title_id = v_other_title WHERE id = v_p3;
--       RAISE EXCEPTION 'probe 3 failed: second holder accepted for a one-seat title';
--     EXCEPTION WHEN check_violation THEN NULL;
--     END;
--
--     -- 4. Changing role_id without a new title clears title_id.
--     UPDATE public.profiles SET title_id = NULL WHERE id = v_p2;
--     UPDATE public.profiles SET role_id = v_other_role WHERE id = v_p1;
--     SELECT title_id INTO v_title_after FROM public.profiles WHERE id = v_p1;
--     IF v_title_after IS NOT NULL THEN RAISE EXCEPTION 'probe 4 failed: title kept across role change'; END IF;
--     UPDATE public.profiles SET role_id = v_role, title_id = v_title WHERE id = v_p1;
--
--     -- 5. The resident leaving 'active' removes the role and title and writes an audit row.
--     UPDATE public.residents SET account_status = 'inactive' WHERE id = v_resident;
--     SELECT role_id, title_id INTO v_role_after, v_title_after FROM public.profiles WHERE id = v_p1;
--     IF v_role_after IS NOT NULL OR v_title_after IS NOT NULL THEN
--       RAISE EXCEPTION 'probe 5 failed: role kept after the resident became inactive';
--     END IF;
--     IF NOT EXISTS (SELECT 1 FROM public.audit_logs
--                    WHERE entity_type = 'profiles' AND entity_id = v_p1
--                      AND action = 'UNASSIGN' AND created_at = now()) THEN
--       RAISE EXCEPTION 'probe 5 failed: no UNASSIGN audit row';
--     END IF;
--
--     RAISE NOTICE 'admin_titles probe passed';
--   END
--   $probe$;
--   ROLLBACK;

BEGIN;

-- 1. The resident-link flag. Defaults false, so no role is affected until slice 3 sets it.
ALTER TABLE public.app_roles
  ADD COLUMN IF NOT EXISTS requires_resident boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.app_roles.requires_resident IS
'When true, only a profile linked to a resident (profiles.resident_id) may hold this role, and the role is removed automatically when that resident stops being active (#823).';

-- 2. Titles under a role.
CREATE TABLE IF NOT EXISTS public.admin_titles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid NOT NULL REFERENCES public.app_roles(id) ON DELETE CASCADE,
  name text NOT NULL,
  is_principal boolean NOT NULL DEFAULT false,
  seats integer NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  updated_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  CONSTRAINT admin_titles_role_name_key UNIQUE (role_id, name),
  CONSTRAINT admin_titles_seats_check CHECK (seats IS NULL OR seats >= 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS admin_titles_one_principal_per_role
  ON public.admin_titles (role_id) WHERE is_principal;

COMMENT ON TABLE public.admin_titles IS
'Controlled list of titles under an admin role, such as Vice Chairman under chairman (#822). seats NULL means unlimited.';

DROP TRIGGER IF EXISTS admin_titles_updated_at ON public.admin_titles;
CREATE TRIGGER admin_titles_updated_at
  BEFORE UPDATE ON public.admin_titles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.admin_titles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.admin_titles FROM anon;
GRANT ALL ON TABLE public.admin_titles TO service_role;

DROP POLICY IF EXISTS admin_titles_select ON public.admin_titles;
CREATE POLICY admin_titles_select ON public.admin_titles
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS admin_titles_insert ON public.admin_titles;
CREATE POLICY admin_titles_insert ON public.admin_titles
  FOR INSERT TO authenticated
  WITH CHECK ((select public.has_permission('system.manage_roles')));

DROP POLICY IF EXISTS admin_titles_update ON public.admin_titles;
CREATE POLICY admin_titles_update ON public.admin_titles
  FOR UPDATE TO authenticated
  USING ((select public.has_permission('system.manage_roles')))
  WITH CHECK ((select public.has_permission('system.manage_roles')));

DROP POLICY IF EXISTS admin_titles_delete ON public.admin_titles;
CREATE POLICY admin_titles_delete ON public.admin_titles
  FOR DELETE TO authenticated
  USING ((select public.has_permission('system.manage_roles')));

-- 3. The title a profile holds.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS title_id uuid NULL REFERENCES public.admin_titles(id) ON DELETE SET NULL;

-- Seat counts and the ON DELETE SET NULL both look profiles up by title.
CREATE INDEX IF NOT EXISTS idx_profiles_title_id
  ON public.profiles (title_id) WHERE title_id IS NOT NULL;

-- Per-column SELECT convention (20261012210000). No UPDATE grant: writes stay service_role only.
GRANT SELECT (title_id) ON public.profiles TO authenticated;

-- 4 and 5. The rules on profiles as they are written.
CREATE OR REPLACE FUNCTION public.enforce_profile_role_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_is_insert boolean := TG_OP = 'INSERT';
  v_role_name text;
  v_requires_resident boolean;
  v_title_name text;
  v_title_role uuid;
  v_seats integer;
  v_holders integer;
BEGIN
  -- SECURITY DEFINER: the seat count must see every profile and lock the title row, past RLS.
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
'BEFORE INSERT OR UPDATE OF role_id, resident_id, title_id on profiles (#823): clears title_id on a role change, refuses a requires_resident role without resident_id, a title from another role, and a full title. Checks only values that change; never scans existing rows.';

DROP TRIGGER IF EXISTS profiles_enforce_role_rules ON public.profiles;
CREATE TRIGGER profiles_enforce_role_rules
  BEFORE INSERT OR UPDATE OF role_id, resident_id, title_id ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_role_rules();

-- 6. Automatic role removal when the linked resident stops being active.
CREATE OR REPLACE FUNCTION public.remove_resident_admin_roles()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_profile record;
  v_actor uuid;
BEGIN
  -- SECURITY DEFINER: the caller changed a resident, not the linked profile, and may hold no
  -- rights on profiles or audit_logs (or be service_role or cron, with no auth.uid()).
  -- actor_id references profiles, so an id with no profile row is recorded as NULL.
  SELECT p.id INTO v_actor FROM public.profiles p WHERE p.id = (SELECT auth.uid());

  FOR v_profile IN
    SELECT p.id, p.full_name, p.email, p.role_id, p.title_id, r.name AS role_name
    FROM public.profiles p
    JOIN public.app_roles r ON r.id = p.role_id
    WHERE p.resident_id = NEW.id
      AND r.requires_resident
    FOR UPDATE OF p
  LOOP
    UPDATE public.profiles
    SET role_id = NULL, title_id = NULL
    WHERE id = v_profile.id;

    INSERT INTO public.audit_logs
      (actor_id, action, entity_type, entity_id, entity_display, old_values, new_values, description, metadata)
    VALUES (
      v_actor,
      'UNASSIGN',
      'profiles',
      v_profile.id,
      coalesce(v_profile.full_name, v_profile.email),
      jsonb_build_object('role_id', v_profile.role_id, 'title_id', v_profile.title_id),
      jsonb_build_object('role_id', NULL, 'title_id', NULL),
      format('Removed the %s role automatically: the linked resident is now %s',
             v_profile.role_name, NEW.account_status),
      jsonb_build_object('resident_id', NEW.id, 'account_status', NEW.account_status,
                         'source', 'residents_remove_admin_roles')
    );
  END LOOP;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_resident_admin_roles() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.remove_resident_admin_roles() IS
'AFTER UPDATE OF account_status on residents, when it leaves active (#823): removes role_id and title_id from linked profiles whose role has requires_resident, with one UNASSIGN audit_logs row per profile.';

DROP TRIGGER IF EXISTS residents_remove_admin_roles ON public.residents;
CREATE TRIGGER residents_remove_admin_roles
  AFTER UPDATE OF account_status ON public.residents
  FOR EACH ROW
  WHEN (OLD.account_status = 'active' AND NEW.account_status IS DISTINCT FROM 'active')
  EXECUTE FUNCTION public.remove_resident_admin_roles();

COMMIT;
