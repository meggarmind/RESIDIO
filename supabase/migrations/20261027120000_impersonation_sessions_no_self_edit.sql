-- Stop an admin editing the record of their own impersonation session (#1063).
--
-- WHAT CHANGES
--   1. DROP POLICY "admins_update_own_impersonation_sessions". It allowed UPDATE of any column
--      where admin_profile_id = auth.uid(), so the admin a session records could rewrite
--      started_at, the impersonated resident, the page-view trail, or re-open it.
--      With RLS on and no UPDATE policy left, a signed-in account cannot UPDATE the table at all.
--   2. public.end_impersonation_session(p_session_id): ends the caller's own ACTIVE session,
--      setting is_active = false and ended_at = now(). The caller chooses neither value.
--      Used by endImpersonationSession (src/actions/impersonation/index.ts).
--   3. public.log_impersonation_page_view(p_session_id, p_path): appends one {path, timestamp}
--      entry to the caller's own ACTIVE session. Append-only: earlier entries cannot be changed.
--      Used by logImpersonationPageView, which previously rewrote the whole page_views array.
--   4. end_previous_impersonation_sessions() becomes SECURITY DEFINER. This AFTER INSERT trigger
--      ends the inserting admin's earlier active sessions with an UPDATE; without the dropped
--      policy that UPDATE would match no rows under RLS. It only touches rows of
--      NEW.admin_profile_id, which the INSERT policy already pins to auth.uid().
--   Both new functions are SECURITY DEFINER with a fixed search_path, executable by
--   authenticated only, and match rows on admin_profile_id = auth.uid().
--
-- WHY
--   20260102095116_create_impersonation_system created the self-update policy with no column
--   limit. The impersonation log is an audit record of the admin it describes.
--
-- ORDERING: 20261023100500_rls_merge_permissive_admin_identity (#956) must already be applied.
--   Its policy-set guard on impersonation_sessions expects admins_update_own_impersonation_sessions,
--   so re-running 20261023100500 after this migration aborts at that guard.
--
-- IDEMPOTENT: DROP POLICY IF EXISTS, CREATE OR REPLACE FUNCTION, ALTER FUNCTION and the
-- grants all give the same result when re-run.
--
-- ROLLBACK (restores direct self-update by the session's admin):
--   BEGIN;
--   CREATE POLICY "admins_update_own_impersonation_sessions" ON public.impersonation_sessions
--     AS PERMISSIVE FOR UPDATE TO authenticated
--     USING ((admin_profile_id = (select auth.uid())))
--     WITH CHECK ((admin_profile_id = (select auth.uid())));
--   ALTER FUNCTION public.end_previous_impersonation_sessions() SECURITY INVOKER;
--   DROP FUNCTION IF EXISTS public.end_impersonation_session(uuid);
--   DROP FUNCTION IF EXISTS public.log_impersonation_page_view(uuid, text);
--   COMMIT;
--   Then revert the src/actions/impersonation/index.ts change in the same release, since it
--   calls the two functions dropped above.
--
-- VERIFY (run on the database after applying):
--   SELECT policyname FROM pg_policies
--     WHERE schemaname = 'public' AND tablename = 'impersonation_sessions' AND cmd = 'UPDATE';
--     -- expect 0 rows
--   SELECT proname, prosecdef FROM pg_proc
--     WHERE proname IN ('end_impersonation_session', 'log_impersonation_page_view',
--                       'end_previous_impersonation_sessions');
--     -- expect 3 rows, prosecdef = true on each
--   SELECT has_function_privilege('anon', 'public.end_impersonation_session(uuid)', 'EXECUTE');
--     -- expect false

BEGIN;

DROP POLICY IF EXISTS "admins_update_own_impersonation_sessions" ON public.impersonation_sessions;

CREATE OR REPLACE FUNCTION public.end_impersonation_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.impersonation_sessions
  SET is_active = false, ended_at = now()
  WHERE id = p_session_id
    AND admin_profile_id = (select auth.uid())
    AND is_active = true;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.log_impersonation_page_view(p_session_id uuid, p_path text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.impersonation_sessions
  SET page_views = coalesce(page_views, '[]'::jsonb)
    || jsonb_build_array(jsonb_build_object('path', left(p_path, 2048), 'timestamp', now()))
  WHERE id = p_session_id
    AND admin_profile_id = (select auth.uid())
    AND is_active = true;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.end_impersonation_session(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.log_impersonation_page_view(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.end_impersonation_session(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_impersonation_page_view(uuid, text) TO authenticated;

ALTER FUNCTION public.end_previous_impersonation_sessions() SECURITY DEFINER;

COMMIT;
