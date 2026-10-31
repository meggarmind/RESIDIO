-- WhatsApp Admin tools in the bot main menu (#1292, owner decisions on #1290).
--
-- WHAT CHANGES
--   1. ADD COLUMN public.whatsapp_admin_bindings.code_required BOOLEAN NOT NULL DEFAULT true: the
--      per-admin "Code required" switch. Existing bindings keep needing the authenticator code.
--   2. system_settings key whatsapp_admin_code_required = true: the global "Code required" switch.
--      A code is needed when the global switch AND the admin's own switch are on.
--   3. Five permissions under the new whatsapp_admin category, one per Admin tools menu item:
--      whatsapp_admin.resident_status, .debt_report, .collections, .clearance_queue, .approve_payment.
--   4. Grants (owner decision 4): whatsapp_admin.query and whatsapp_admin.resident_status to every
--      staff role (app_roles.category exco, bot or staff); debt_report, collections and
--      clearance_queue to chairman, financial_officer and super_admin; approve_payment to
--      financial_officer and super_admin.
--   Nothing is dropped or deleted. Requires 20261104120000 (the enum value) to be applied first.
--
-- WHY
--   Admin mode moves from typed ADMIN commands into "6. Admin tools" on the main menu. Every staff
--   role may open it; each item is granted per role and is editable in Settings.
--
-- IDEMPOTENT: ADD COLUMN IF NOT EXISTS, ON CONFLICT DO NOTHING.
--
-- ROLLBACK (roll the application code back first: it reads the column, the setting and the permissions):
--   BEGIN;
--   DELETE FROM public.role_permissions WHERE permission_id IN (SELECT id FROM public.app_permissions
--     WHERE name IN ('whatsapp_admin.resident_status', 'whatsapp_admin.debt_report', 'whatsapp_admin.collections',
--                    'whatsapp_admin.clearance_queue', 'whatsapp_admin.approve_payment'));
--   DELETE FROM public.app_permissions WHERE name IN ('whatsapp_admin.resident_status', 'whatsapp_admin.debt_report',
--     'whatsapp_admin.collections', 'whatsapp_admin.clearance_queue', 'whatsapp_admin.approve_payment');
--   DELETE FROM public.role_permissions rp USING public.app_roles r, public.app_permissions p
--     WHERE rp.role_id = r.id AND rp.permission_id = p.id AND p.name = 'whatsapp_admin.query'
--       AND r.name NOT IN ('super_admin', 'chairman', 'financial_officer');
--   DELETE FROM public.system_settings WHERE key = 'whatsapp_admin_code_required';
--   ALTER TABLE public.whatsapp_admin_bindings DROP COLUMN IF EXISTS code_required;
--   COMMIT;
--   The query-grant rollback also removes a grant an owner added by hand after this migration.
--
-- VERIFY (run on the database after applying):
--   SELECT p.name, string_agg(r.name, ', ' ORDER BY r.name) FROM public.role_permissions rp
--     JOIN public.app_roles r ON r.id = rp.role_id JOIN public.app_permissions p ON p.id = rp.permission_id
--     WHERE p.name LIKE 'whatsapp_admin.%' GROUP BY 1 ORDER BY 1;
--   SELECT value FROM public.system_settings WHERE key = 'whatsapp_admin_code_required';  -- expect true
--   SELECT count(*) FROM public.whatsapp_admin_bindings WHERE code_required IS DISTINCT FROM true;  -- expect 0

ALTER TABLE public.whatsapp_admin_bindings
  ADD COLUMN IF NOT EXISTS code_required BOOLEAN NOT NULL DEFAULT true;

INSERT INTO public.system_settings (key, value, description, category)
VALUES (
  'whatsapp_admin_code_required',
  'true'::jsonb,
  'WhatsApp Admin tools need an authenticator code. Off: no admin needs a code; on: a code is needed unless that admin''s own switch is off.',
  'notifications'
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('whatsapp_admin.resident_status', 'WhatsApp: Resident status', 'Open Resident status in WhatsApp Admin tools: what a house owes', 'whatsapp_admin', true),
  ('whatsapp_admin.debt_report', 'WhatsApp: Security debt status', 'Open the security debt status report in WhatsApp Admin tools', 'whatsapp_admin', true),
  ('whatsapp_admin.collections', 'WhatsApp: Collections', 'Open Collections in WhatsApp Admin tools', 'whatsapp_admin', true),
  ('whatsapp_admin.clearance_queue', 'WhatsApp: Clearance queue', 'Open the clearance certificate queue in WhatsApp Admin tools', 'whatsapp_admin', true),
  ('whatsapp_admin.approve_payment', 'WhatsApp: Approve payment report', 'Approve a payment a resident reported, from WhatsApp Admin tools', 'whatsapp_admin', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.category IN ('exco', 'bot', 'staff')
  AND p.name IN ('whatsapp_admin.query', 'whatsapp_admin.resident_status')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'financial_officer')
  AND p.name IN ('whatsapp_admin.debt_report', 'whatsapp_admin.collections', 'whatsapp_admin.clearance_queue')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'financial_officer')
  AND p.name = 'whatsapp_admin.approve_payment'
ON CONFLICT DO NOTHING;
