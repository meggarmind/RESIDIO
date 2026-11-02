-- WhatsApp Admin tools item 6, Unverified payments (#1424, owner pick Option A on 2 Nov 2026).
--
-- WHAT CHANGES
--   1. One permission under the existing whatsapp_admin category: whatsapp_admin.unverified_payments.
--   2. Grant to chairman, financial_officer and super_admin. These roles already hold every
--      permission the item also needs (payments.verify, payments.create, email_imports.process,
--      and imports.approve for an alert over the email auto-process limit).
--   Nothing is dropped or deleted. Requires 20261104120000 (the whatsapp_admin enum value).
--
-- WHY
--   The admin can clear the email-import review queue (bank alerts with no resident) and verify
--   receipt payments with no bank proof from WhatsApp, without opening the dashboard.
--
-- IDEMPOTENT: ON CONFLICT DO NOTHING.
--
-- ROLLBACK (roll the application code back first: it reads the permission):
--   BEGIN;
--   DELETE FROM public.role_permissions WHERE permission_id IN (SELECT id FROM public.app_permissions
--     WHERE name = 'whatsapp_admin.unverified_payments');
--   DELETE FROM public.app_permissions WHERE name = 'whatsapp_admin.unverified_payments';
--   COMMIT;
--   The rollback also removes a grant an owner added by hand in Settings after this migration.
--
-- VERIFY (run on the database after applying):
--   SELECT p.name, string_agg(r.name, ', ' ORDER BY r.name) FROM public.role_permissions rp
--     JOIN public.app_roles r ON r.id = rp.role_id JOIN public.app_permissions p ON p.id = rp.permission_id
--     WHERE p.name = 'whatsapp_admin.unverified_payments' GROUP BY 1;
--   -- expect: chairman, financial_officer, super_admin

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES (
  'whatsapp_admin.unverified_payments',
  'WhatsApp: Unverified payments',
  'Settle bank alerts with no resident and payments with no bank proof, from WhatsApp Admin tools',
  'whatsapp_admin',
  true
)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'financial_officer')
  AND p.name = 'whatsapp_admin.unverified_payments'
ON CONFLICT DO NOTHING;
