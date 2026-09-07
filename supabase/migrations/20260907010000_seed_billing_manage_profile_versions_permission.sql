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
-- No RLS policy is added either. `authenticated` holds only SELECT on these
-- tables (20260812235852_invoice_generation_redesign.sql), and the server
-- actions write through the service role after `authorizePermission()`, the
-- same shape as the invoice-generation runs. This migration therefore grants
-- nothing new at the table level.

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
