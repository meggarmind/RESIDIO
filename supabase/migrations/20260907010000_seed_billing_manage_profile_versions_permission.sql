-- Issue #242: give the historical rate schedule a write path.
--
-- `billing_profile_versions` was read-only from the application: every profile
-- carried exactly one version, so any billing period earlier than it was priced
-- by the earliest-version fallback in `resolveProfileVersion` and reported as a
-- success. Entering the rate that actually applied needs a permission of its
-- own.
--
-- Held apart from `billing.manage_profiles` deliberately. Editing a rate card
-- changes what future invoices charge; writing a version with a past
-- `effective_from` changes what a *backfill* charges, and those invoice numbers
-- are permanent. The two should be grantable separately.
--
-- No enum change is needed: category `billing` already exists in
-- `permission_category` (seeded by 20251222000000_create_rbac_system.sql).
--
-- No RLS policy is added either, and none is needed. Two separate facts, both
-- re-verified against the migration history on 2026-09-07:
--
--   * Table privileges. 20260812235852_invoice_generation_redesign.sql REVOKEs
--     ALL on both tables from `anon` and `authenticated`, then GRANTs
--     `authenticated` SELECT only; `service_role` keeps ALL. Nothing since has
--     changed those grants, so `authenticated` still has no INSERT, UPDATE or
--     DELETE privilege here at all.
--   * The SELECT policy. The two policies created by 20260812235852 no longer
--     exist: 20260905000000_policies_part_a_follow_permissions.sql dropped and
--     recreated both as `USING (public.has_permission('billing.manage_profiles'))`.
--     That is the policy in force today. No INSERT/UPDATE/DELETE policy was
--     ever created on either table.
--
-- The server actions therefore write through the service role after
-- `authorizePermission()`, the same shape as the invoice-generation runs, and
-- this migration grants nothing new at the table level. Seeding
-- `billing.manage_profile_versions` does not widen the SELECT policy, which
-- keys off `billing.manage_profiles` and is untouched here.

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
    'billing.manage_profile_versions',
    'Manage Billing Rate Versions',
    'Create and edit billing profile rate versions, including versions effective from a past month',
    'billing',
    true
)
ON CONFLICT (name) DO NOTHING;

-- Roles that already hold `billing.manage_profiles` at the estate-finance level.
-- `project_manager` is deliberately excluded: it may maintain rate cards, but
-- not rewrite the historical schedule that a backfill prices against.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'vice_chairman', 'financial_officer')
  AND p.name = 'billing.manage_profile_versions'
ON CONFLICT DO NOTHING;

COMMIT;
