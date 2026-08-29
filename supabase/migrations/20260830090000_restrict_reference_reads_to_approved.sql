-- ============================================================================
-- Migration: Restrict reference and config reads to approved accounts
-- ============================================================================
-- The approval gate added in 20260829100200 works through the SECURITY DEFINER
-- helpers, so it only reaches policies that actually call one. Several tables
-- carry a SELECT policy whose permissive branch never references the user at
-- all, typically:
--
--     USING (is_active = true OR public.get_my_role() IN ('admin', ...))
--
-- The left-hand branch is true for every authenticated session, approved or
-- not. Verified empirically on 2026-08-30 against the live project: a freshly
-- created pending account could read houses, streets, house_types,
-- estate_bank_accounts (including full account numbers), ai_settings,
-- report_schedules and two_factor_policies.
--
-- This predates the approval work — it was simply invisible while every new
-- signup was silently granted 'security_officer' anyway.
--
-- Approach: add a RESTRICTIVE policy rather than rewriting the existing ones.
-- Restrictive policies are ANDed with the permissive set, so this can only ever
-- narrow access, never widen it, and it does not depend on knowing the current
-- name or body of each existing policy. Several of these tables were created
-- out of band and have no policy definition in this repository, so rewriting
-- them by name would be guesswork.
--
-- Scope is SELECT only. Writes on these tables already go through get_my_role()
-- and are therefore gated already; leaving writes untouched keeps this change
-- off the signup and provisioning paths.
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Approval predicate. Distinct from get_my_role(), which returns NULL for
-- roles that have no legacy equivalent (resident, secretary, project_manager) —
-- gating on "get_my_role() IS NOT NULL" would lock residents out of the very
-- reference data the portal needs.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_approved()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, auth, extensions, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND approval_status = 'active'
  )
$fn$;

COMMENT ON FUNCTION public.is_approved() IS
'TRUE when the current user holds an approved (active) account, regardless of which
role they have. Used by RESTRICTIVE policies on reference and configuration tables whose
permissive policies do not otherwise reference the user.';

REVOKE EXECUTE ON FUNCTION public.is_approved() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_approved() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Apply the restriction. Skips any table that is not present so the migration
-- stays valid across environments that differ in which features are installed.
-- ---------------------------------------------------------------------------
DO $apply$
DECLARE
    v_table TEXT;
    v_tables CONSTANT TEXT[] := ARRAY[
        'houses',                 -- full estate property register
        'streets',
        'house_types',
        'estate_bank_accounts',   -- account numbers; the most sensitive of these
        'ai_settings',            -- has an api_key column
        'report_schedules',
        'two_factor_policies'     -- reveals 2FA enforcement posture
    ];
BEGIN
    FOREACH v_table IN ARRAY v_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_tables
            WHERE schemaname = 'public' AND tablename = v_table
        ) THEN
            RAISE NOTICE '[restrict_reference_reads] %: table not present, skipped.', v_table;
            CONTINUE;
        END IF;

        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON public.%I',
            'Approved accounts only can read', v_table
        );

        EXECUTE format(
            'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING (public.is_approved())',
            'Approved accounts only can read', v_table
        );

        RAISE NOTICE '[restrict_reference_reads] %: SELECT now requires an approved account.', v_table;
    END LOOP;
END
$apply$;

-- ---------------------------------------------------------------------------
-- app_roles, app_permissions and role_permissions are deliberately left open to
-- any authenticated session. They hold the RBAC catalogue rather than estate
-- data, the client reads them while resolving a session's own permissions, and
-- the disclosure is limited to role and permission names. Revisit only with a
-- deliberate decision.
-- ---------------------------------------------------------------------------

COMMIT;
