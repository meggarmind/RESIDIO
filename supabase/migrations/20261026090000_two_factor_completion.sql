-- Finish two-factor login (#1029).
--
-- WHAT CHANGES
--   1. CREATE TABLE public.two_factor_verified_sessions: one row per sign-in session that completed
--      the second step. session_id is the `session_id` claim of the Supabase login token (JWT), so
--      the row belongs to exactly one login token's session and dies with it (24-hour expiry, the
--      same as the signed residio_2fa cookie). Written by the server after a code check succeeds.
--   2. CREATE FUNCTION public.two_factor_session_ok(): true when the caller's account has two-factor
--      off, or when the caller's login token session has a live row in (1). STABLE SECURITY DEFINER.
--   3. The admin permission helpers now also require (2): has_permission, get_my_permissions,
--      get_my_access, get_my_role_name, is_super_admin (now through get_my_role_name), and the documents.view branch of
--      can_read_document_file. Bodies are otherwise copied unchanged from the live definitions.
--      Accounts with two-factor off see no change.
--   6. ALTER POLICY on the 17 policies that check a permission with their own inline
--      profiles/role_permissions join rather than through (3): role_assignment_rules (4),
--      document_access_logs (1), document_categories (4), documents (3), entity_notes (4) and
--      report_archive (1). Each inline check now also requires (2). With (3) and (6), every admin
--      public-schema RLS policy and SECURITY DEFINER permission check requires the second step, so a
--      session that skipped it gets no admin rows from the database, not only a web redirect. The
--      four storage.objects policies for the documents bucket are covered by
--      20261026100000_two_factor_storage_documents_policies (#1041).
--   4. CREATE TABLE public.two_factor_attempts and FUNCTION public.two_factor_claim_attempt(profile,
--      purpose, now): claims one code try in a single statement BEFORE the code is checked, so
--      parallel guesses cannot exceed 5 tries per 15 minutes. Purposes: 'login' (sign-in codes and
--      backup codes) and 'manage' (making new backup codes, turning two-factor off). The server
--      deletes the row after a correct code.
--   5. CREATE TABLE public.two_factor_totp_steps and FUNCTION public.two_factor_accept_totp_step:
--      stores the last accepted authenticator time step per account, so each authenticator code is
--      accepted once (same idea as whatsapp_admin_bindings.last_totp_step, #972).
--   New tables are service_role only, like the other two-factor tables. The two write functions are
--   service_role only; two_factor_session_ok is callable by authenticated.
--
-- WHY
--   The "second step done" check lived only in the Next.js middleware, so a session holding only a
--   password sign-in could still read admin data straight from the database API. Wrong-code counting
--   read a count and then inserted, so parallel requests all passed the 5-try check.
--
-- DEPLOY ORDER: apply this migration before deploying the application code that calls the new tables
--   and functions. Applying it first is safe: no account has two-factor on, and the old code path
--   does not touch the new objects.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, CREATE OR REPLACE FUNCTION, DROP POLICY IF EXISTS.
--
-- ROLLBACK (restores the helper functions without the two-factor check; loses the attempt counters,
-- accepted steps and verified sessions, which are all short-lived):
--   BEGIN;
--   -- Re-run the CREATE OR REPLACE FUNCTION bodies below with the `AND public.two_factor_session_ok()`
--   -- line (or the `public.two_factor_session_ok() AND` term) removed, for has_permission,
--   -- get_my_permissions, get_my_access, get_my_role_name and can_read_document_file. is_super_admin
--   -- needs no change: it reads get_my_role_name().
--   -- Re-run the ALTER POLICY statements in (6) with the `(select public.two_factor_session_ok()) AND`
--   -- term removed (role_assignment_rules_select is restored by 20261023100500).
--   DROP FUNCTION IF EXISTS public.two_factor_session_ok();
--   DROP FUNCTION IF EXISTS public.two_factor_claim_attempt(UUID, TEXT, TIMESTAMPTZ);
--   DROP FUNCTION IF EXISTS public.two_factor_accept_totp_step(UUID, BIGINT);
--   DROP TABLE IF EXISTS public.two_factor_verified_sessions;
--   DROP TABLE IF EXISTS public.two_factor_attempts;
--   DROP TABLE IF EXISTS public.two_factor_totp_steps;
--   COMMIT;
--   Roll the application code back first: it reads and writes the three tables.
--
-- VERIFY (run on the database after applying):
--   SELECT has_table_privilege('authenticated', 'public.two_factor_attempts', 'SELECT');          -- expect false
--   SELECT has_function_privilege('authenticated', 'public.two_factor_claim_attempt(uuid,text,timestamptz)', 'EXECUTE');  -- expect false
--   SELECT count(*) FROM pg_proc WHERE proname IN ('has_permission','get_my_permissions','get_my_access',
--     'get_my_role_name','can_read_document_file')
--     AND pg_get_functiondef(oid) LIKE '%two_factor_session_ok()%';                              -- expect 5
--   SELECT schemaname, tablename, policyname FROM pg_policies
--     WHERE coalesce(qual, '') || coalesce(with_check, '') LIKE '%role_permissions%'
--       AND coalesce(qual, '') || coalesce(with_check, '') NOT LIKE '%two_factor_session_ok()%';  -- expect 0 rows

CREATE TABLE IF NOT EXISTS public.two_factor_verified_sessions (
  session_id UUID PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_two_factor_verified_sessions_profile
  ON public.two_factor_verified_sessions (profile_id);

CREATE TABLE IF NOT EXISTS public.two_factor_attempts (
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purpose TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  window_started_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now()),
  PRIMARY KEY (profile_id, purpose),
  CONSTRAINT two_factor_attempts_purpose_check CHECK (purpose IN ('login', 'manage'))
);

CREATE TABLE IF NOT EXISTS public.two_factor_totp_steps (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_step BIGINT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc', now())
);

ALTER TABLE public.two_factor_verified_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_factor_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.two_factor_totp_steps ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.two_factor_verified_sessions, public.two_factor_attempts, public.two_factor_totp_steps
  FROM anon, authenticated;
GRANT ALL ON TABLE public.two_factor_verified_sessions, public.two_factor_attempts, public.two_factor_totp_steps
  TO service_role;

DROP POLICY IF EXISTS "two_factor_verified_sessions_service_role_all" ON public.two_factor_verified_sessions;
CREATE POLICY "two_factor_verified_sessions_service_role_all"
  ON public.two_factor_verified_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "two_factor_attempts_service_role_all" ON public.two_factor_attempts;
CREATE POLICY "two_factor_attempts_service_role_all"
  ON public.two_factor_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "two_factor_totp_steps_service_role_all" ON public.two_factor_totp_steps;
CREATE POLICY "two_factor_totp_steps_service_role_all"
  ON public.two_factor_totp_steps FOR ALL TO service_role USING (true) WITH CHECK (true);

-- (4) Claims one try before the code is checked. The row lock taken by ON CONFLICT serialises
-- parallel calls, so at most 5 succeed per 15-minute window.
CREATE OR REPLACE FUNCTION public.two_factor_claim_attempt(p_profile_id UUID, p_purpose TEXT, p_now TIMESTAMPTZ)
RETURNS TABLE (allowed BOOLEAN, remaining INTEGER, retry_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_attempts INTEGER;
  v_window TIMESTAMPTZ;
BEGIN
  INSERT INTO public.two_factor_attempts AS a (profile_id, purpose, attempts, window_started_at, updated_at)
  VALUES (p_profile_id, p_purpose, 1, p_now, p_now)
  ON CONFLICT (profile_id, purpose) DO UPDATE SET
    attempts = CASE WHEN a.window_started_at <= p_now - interval '15 minutes' THEN 1 ELSE a.attempts + 1 END,
    window_started_at = CASE WHEN a.window_started_at <= p_now - interval '15 minutes' THEN p_now ELSE a.window_started_at END,
    updated_at = p_now
  WHERE a.window_started_at <= p_now - interval '15 minutes' OR a.attempts < 5
  RETURNING a.attempts INTO v_attempts;

  IF v_attempts IS NOT NULL THEN
    RETURN QUERY SELECT TRUE, 5 - v_attempts, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  SELECT a.window_started_at INTO v_window
  FROM public.two_factor_attempts a
  WHERE a.profile_id = p_profile_id AND a.purpose = p_purpose;

  RETURN QUERY SELECT FALSE, 0, v_window + interval '15 minutes';
END;
$$;

REVOKE ALL ON FUNCTION public.two_factor_claim_attempt(UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.two_factor_claim_attempt(UUID, TEXT, TIMESTAMPTZ) TO service_role;

-- (5) True only for a step newer than the last accepted one, so a code works once.
CREATE OR REPLACE FUNCTION public.two_factor_accept_totp_step(p_profile_id UUID, p_step BIGINT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH accepted AS (
    INSERT INTO public.two_factor_totp_steps AS t (profile_id, last_step, updated_at)
    VALUES (p_profile_id, p_step, timezone('utc', now()))
    ON CONFLICT (profile_id) DO UPDATE SET last_step = EXCLUDED.last_step, updated_at = EXCLUDED.updated_at
    WHERE t.last_step < EXCLUDED.last_step
    RETURNING 1
  )
  SELECT EXISTS (SELECT 1 FROM accepted);
$$;

REVOKE ALL ON FUNCTION public.two_factor_accept_totp_step(UUID, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.two_factor_accept_totp_step(UUID, BIGINT) TO service_role;

-- (2) The database-level "second step done" check.
CREATE OR REPLACE FUNCTION public.two_factor_session_ok()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $$
  SELECT NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND two_factor_enabled IS TRUE
    )
    OR EXISTS (
      SELECT 1 FROM public.two_factor_verified_sessions s
      WHERE s.profile_id = auth.uid()
        AND s.session_id::TEXT = auth.jwt() ->> 'session_id'
        AND s.expires_at > now()
    );
$$;

REVOKE ALL ON FUNCTION public.two_factor_session_ok() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.two_factor_session_ok() TO authenticated, service_role;

-- (3) Admin permission helpers: unchanged bodies plus the check.
CREATE OR REPLACE FUNCTION public.has_permission(p_permission_name text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_has_perm BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM profiles pr
        JOIN role_permissions rp ON rp.role_id = pr.role_id
        JOIN app_permissions ap ON ap.id = rp.permission_id
        WHERE pr.id = auth.uid()
          AND pr.approval_status = 'active'
          AND ap.name = p_permission_name
          AND ap.is_active = TRUE
    ) AND public.two_factor_session_ok() INTO v_has_perm;

    RETURN COALESCE(v_has_perm, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_permissions()
 RETURNS TABLE(permission_name text, category permission_category)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT ap.name::TEXT, ap.category
    FROM profiles pr
    JOIN role_permissions rp ON rp.role_id = pr.role_id
    JOIN app_permissions ap ON ap.id = rp.permission_id
    WHERE pr.id = auth.uid()
      AND pr.approval_status = 'active'
      AND ap.is_active = TRUE
      AND public.two_factor_session_ok();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_access()
 RETURNS TABLE(role_id uuid, role_name text, permission_name text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
BEGIN
    RETURN QUERY
    SELECT pr.role_id, ar.name::TEXT, ap.name::TEXT
    FROM profiles pr
    JOIN app_roles ar ON ar.id = pr.role_id
    LEFT JOIN role_permissions rp ON rp.role_id = pr.role_id
    LEFT JOIN app_permissions ap ON ap.id = rp.permission_id AND ap.is_active = TRUE
    WHERE pr.id = auth.uid()
      AND pr.approval_status = 'active'
      AND public.two_factor_session_ok();
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_my_role_name()
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
DECLARE
    v_role_name TEXT;
BEGIN
    SELECT ar.name INTO v_role_name
    FROM profiles pr
    JOIN app_roles ar ON ar.id = pr.role_id
    WHERE pr.id = auth.uid()
      AND pr.approval_status = 'active'
      AND public.two_factor_session_ok();

    RETURN v_role_name;
END;
$function$;

-- Same meaning as before (an active profile whose role is super_admin), now through
-- get_my_role_name(), which carries the approval and two-factor checks.
CREATE OR REPLACE FUNCTION public.is_super_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
    SELECT COALESCE(public.get_my_role_name() = 'super_admin', FALSE);
$function$;

CREATE OR REPLACE FUNCTION public.can_read_document_file(p_object_name text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'auth', 'extensions', 'pg_temp'
AS $function$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.documents d WHERE d.file_path = p_object_name) THEN
      public.two_factor_session_ok()
      AND EXISTS (
        SELECT 1
        FROM public.profiles p
          JOIN public.role_permissions rp ON rp.role_id = p.role_id
          JOIN public.app_permissions ap ON ap.id = rp.permission_id
        WHERE p.id = auth.uid() AND ap.name = 'documents.view'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.documents d
        WHERE d.file_path = p_object_name
          AND NOT public.can_view_private_document(d.resident_id, d.house_id)
      )
    ELSE public.has_permission('documents.update')
  END;
$function$;

-- (6) Policies that check a permission with their own profiles/role_permissions join instead of
-- has_permission: the same check plus two_factor_session_ok(), otherwise unchanged. Branches that do
-- not grant admin access (active categories, confidential_roles) are left as they were.
ALTER POLICY "Admins can manage role assignment rules (insert)" ON public.role_assignment_rules
  WITH CHECK ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))));
ALTER POLICY "Admins can manage role assignment rules (update)" ON public.role_assignment_rules
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))));
ALTER POLICY "Admins can manage role assignment rules (delete)" ON public.role_assignment_rules
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))));
ALTER POLICY "role_assignment_rules_select" ON public.role_assignment_rules
  USING (((select has_permission('system.manage_roles'::text)) OR (select has_permission('system.assign_roles'::text)) OR ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'system.manage_roles'::text)))))));

ALTER POLICY "Admins can view access logs" ON public.document_access_logs
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = ANY (ARRAY['documents.manage_categories'::text, 'audit.view'::text]))))));

ALTER POLICY "Admins can manage categories (insert)" ON public.document_categories
  WITH CHECK ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))));
ALTER POLICY "Admins can manage categories (update)" ON public.document_categories
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))));
ALTER POLICY "Admins can manage categories (delete)" ON public.document_categories
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text)))));
ALTER POLICY "Authenticated users can view active categories" ON public.document_categories
  USING ((is_active = true) OR ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.manage_categories'::text))))));

ALTER POLICY "Users can upload documents" ON public.documents
  WITH CHECK ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.upload'::text)))));
ALTER POLICY "Users can update documents" ON public.documents
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.update'::text)))));
ALTER POLICY "Users can delete documents" ON public.documents
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'documents.delete'::text)))));

ALTER POLICY "Users can create notes" ON public.entity_notes
  WITH CHECK ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM (((profiles p JOIN app_roles ar ON ((ar.id = p.role_id))) JOIN role_permissions rp ON ((rp.role_id = ar.id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.create'::text)))));
ALTER POLICY "Users can update notes" ON public.entity_notes
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM (((profiles p JOIN app_roles ar ON ((ar.id = p.role_id))) JOIN role_permissions rp ON ((rp.role_id = ar.id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.update'::text)))));
ALTER POLICY "Users can delete notes" ON public.entity_notes
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM (((profiles p JOIN app_roles ar ON ((ar.id = p.role_id))) JOIN role_permissions rp ON ((rp.role_id = ar.id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.delete'::text)))));
ALTER POLICY "Users can view notes based on permissions" ON public.entity_notes
  USING ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM (((profiles p JOIN app_roles ar ON ((ar.id = p.role_id))) JOIN role_permissions rp ON ((rp.role_id = ar.id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.view'::text)))) AND ((is_confidential = false) OR (EXISTS ( SELECT 1 FROM (((profiles p JOIN app_roles ar ON ((ar.id = p.role_id))) JOIN role_permissions rp ON ((rp.role_id = ar.id))) JOIN app_permissions ap ON ((ap.id = rp.permission_id))) WHERE ((p.id = (select auth.uid())) AND ((ap.name)::text = 'notes.view_confidential'::text)))) OR (EXISTS ( SELECT 1 FROM (profiles p JOIN app_roles ar ON ((ar.id = p.role_id))) WHERE ((p.id = (select auth.uid())) AND ((ar.name)::text = ANY (entity_notes.confidential_roles)))))));

ALTER POLICY "Users with report export can insert" ON public.report_archive
  WITH CHECK ((select public.two_factor_session_ok()) AND (EXISTS ( SELECT 1 FROM ((profiles p JOIN role_permissions rp ON ((rp.role_id = p.role_id))) JOIN app_permissions ap ON (((ap.id = rp.permission_id) AND ((ap.name)::text = 'reports.export'::text)))) WHERE (p.id = (select auth.uid())))));
