-- Issue #1286 (follow-up to #1283): the financial officer edits bank accounts and transaction tags.
--
-- Owner decision (29 Oct 2026): add one narrow permission for the two Banking settings instead of
-- granting settings.manage_reference, which also unlocks Streets, House types and Property.
-- This migration:
--   1. Adds settings.manage_banking_reference (category settings). The app accepts it OR
--      settings.manage_reference on the bank account and transaction tag actions and sections.
--   2. Grants it to financial_officer, and to every role that holds settings.manage_reference when
--      this runs (chairman, secretary, super_admin on Residio_Stage), so no editor loses access.
--   3. Grants payments.write_transaction_tags to financial_officer only. The transaction_tags write
--      policies check that permission (super_admin only before this), so without it the database
--      refuses the officer's tag saves. RLS is unchanged; database tag writes widen to the
--      financial officer only.
-- Bank account writes need no grant: their policies check payments.manage_reference_records, and
-- creating one needs approvals.approve_reject; financial_officer already holds both.
-- Out of scope: PDF statement passwords (email_imports.manage_passwords) are unchanged.
--
-- ROLLBACK:
-- BEGIN;
-- DELETE FROM public.role_permissions
--  WHERE role_id = (SELECT id FROM public.app_roles WHERE name = 'financial_officer')
--    AND permission_id = (SELECT id FROM public.app_permissions WHERE name = 'payments.write_transaction_tags');
-- DELETE FROM public.role_permissions WHERE permission_id IN
--   (SELECT id FROM public.app_permissions WHERE name = 'settings.manage_banking_reference');
-- DELETE FROM public.app_permissions WHERE name = 'settings.manage_banking_reference';
-- COMMIT;
--
-- VERIFY (read-only, after applying):
--   SELECT p.name, string_agg(r.name, ', ' ORDER BY r.name) AS roles
--     FROM public.role_permissions rp
--     JOIN public.app_roles r ON r.id = rp.role_id
--     JOIN public.app_permissions p ON p.id = rp.permission_id
--    WHERE p.name IN ('settings.manage_banking_reference', 'settings.manage_reference',
--                     'payments.write_transaction_tags')
--    GROUP BY p.name ORDER BY p.name;
--     -- payments.write_transaction_tags   | financial_officer, super_admin
--     -- settings.manage_banking_reference | chairman, financial_officer, secretary, super_admin
--     -- settings.manage_reference         | chairman, secretary, super_admin   (unchanged)

BEGIN;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
    'settings.manage_banking_reference',
    'Manage Bank Accounts and Transaction Tags',
    'Can add, edit and remove estate bank accounts and transaction tags on Settings > Banking',
    'settings',
    true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE p.name = 'settings.manage_banking_reference'
  AND (
    r.name = 'financial_officer'
    OR r.id IN (
        SELECT rp.role_id
        FROM public.role_permissions rp
        JOIN public.app_permissions ref ON ref.id = rp.permission_id
        WHERE ref.name = 'settings.manage_reference'
    )
  )
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name = 'financial_officer'
  AND p.name = 'payments.write_transaction_tags'
ON CONFLICT DO NOTHING;

COMMIT;
