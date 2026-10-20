-- #812: a dedicated payments.verify permission for verifying and un-verifying payments
--
-- manuallyVerifyPayment and unverifyPayment (src/actions/finance/manual-verification.ts) were
-- gated on manage_expenditure, the expenses and vendors permission. Owner decision 2026-10-19
-- (option c on #812): move them, and the new bulkVerifyPayments, onto payments.verify.
--
-- THIS CHANGES NO ACCESS. The permission is granted to exactly the roles that hold
-- manage_expenditure when the migration runs, read from role_permissions rather than from
-- hard-coded role names. Measured on 2026-10-20, identical on Residio_Stage and Residio_Prod:
-- chairman, financial_officer, super_admin, vice_chairman.
--
-- VERIFY (after applying; expected results in brackets):
--
--   -- roles holding manage_expenditure but not payments.verify, and the reverse [0 rows]
--   (SELECT rp.role_id FROM role_permissions rp JOIN app_permissions p ON p.id = rp.permission_id
--     WHERE p.name = 'manage_expenditure'
--    EXCEPT
--    SELECT rp.role_id FROM role_permissions rp JOIN app_permissions p ON p.id = rp.permission_id
--     WHERE p.name = 'payments.verify')
--   UNION ALL
--   (SELECT rp.role_id FROM role_permissions rp JOIN app_permissions p ON p.id = rp.permission_id
--     WHERE p.name = 'payments.verify'
--    EXCEPT
--    SELECT rp.role_id FROM role_permissions rp JOIN app_permissions p ON p.id = rp.permission_id
--     WHERE p.name = 'manage_expenditure');
--
-- ROLLBACK (deploy the previous app release first, which checks manage_expenditure again; the
-- role_permissions rows go with the permission by ON DELETE CASCADE):
--
--   DELETE FROM public.app_permissions WHERE name = 'payments.verify';

INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  ('payments.verify', 'Verify Payments', 'Can mark payments verified, singly or in bulk, and un-verify them. A verified payment''s amount, payer, property and status are locked.', 'payments', true)
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT rp.role_id, verify.id
FROM public.role_permissions rp
JOIN public.app_permissions expenditure ON expenditure.id = rp.permission_id
CROSS JOIN public.app_permissions verify
WHERE expenditure.name = 'manage_expenditure'
  AND verify.name = 'payments.verify'
ON CONFLICT (role_id, permission_id) DO NOTHING;
