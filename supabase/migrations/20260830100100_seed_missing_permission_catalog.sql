-- ============================================================================
-- Migration: Seed the twelve permissions the app checks but never created
-- ============================================================================
-- Purpose: Twelve names in src/lib/auth/action-roles.ts PERMISSIONS have no
--          app_permissions row. authorizePermission() is pure set-membership
--          with no super-admin bypass, so every check against them has been
--          failing for every user since the features shipped:
--
--            impersonation.*  (4)  -> src/actions/impersonation/**
--            two_factor.*     (6)  -> src/actions/two-factor/**
--            billing.request_late_fee_waiver / approve_late_fee_waiver
--                             (2)  -> src/actions/billing/late-fee-waivers.ts
--
--          The impersonation nav entry (src/components/dashboard/sidebar.tsx)
--          gates on impersonation.start_session and has therefore never
--          rendered for anyone, super_admin included.
--
-- Note this migration makes dormant features live. That is the intent, but it
-- is a visible change: impersonation appears in the sidebar for the first time.
--
-- Depends on 20260830100000 having committed the two enum values.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------
INSERT INTO app_permissions (name, display_name, description, category, is_active)
VALUES
  -- Impersonation: viewing the portal as a resident, for support
  ('impersonation.view_sessions', 'View Impersonation Sessions', 'Can view the log of portal impersonation sessions', 'impersonation', true),
  ('impersonation.start_session', 'Start Impersonation Session', 'Can view the resident portal as a specific resident', 'impersonation', true),
  ('impersonation.approve_requests', 'Approve Impersonation Requests', 'Can approve another admin''s request to impersonate a resident', 'impersonation', true),
  ('impersonation.manage_settings', 'Manage Impersonation Settings', 'Can configure impersonation policy and session limits', 'impersonation', true),

  -- Two-factor authentication
  ('two_factor.view_status', 'View Two-Factor Status', 'Can see whether two-factor authentication is enabled on an account', 'two_factor', true),
  ('two_factor.enable', 'Enable Two-Factor', 'Can enrol an authenticator and turn on two-factor authentication', 'two_factor', true),
  ('two_factor.disable', 'Disable Two-Factor', 'Can turn off two-factor authentication', 'two_factor', true),
  ('two_factor.manage_policies', 'Manage Two-Factor Policies', 'Can set which roles are required to use two-factor authentication', 'two_factor', true),
  ('two_factor.view_audit_log', 'View Two-Factor Audit Log', 'Can view the two-factor authentication event log', 'two_factor', true),
  ('two_factor.reset_user', 'Reset User Two-Factor', 'Can clear another user''s two-factor enrolment so they can re-enrol', 'two_factor', true),

  -- Late fee waivers (maker-checker over an existing billing workflow)
  ('billing.request_late_fee_waiver', 'Request Late Fee Waiver', 'Can raise a request to waive a late fee', 'billing', true),
  ('billing.approve_late_fee_waiver', 'Approve Late Fee Waiver', 'Can approve or reject a late fee waiver request', 'billing', true)
ON CONFLICT (name) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------

-- Super admin holds everything. This is what makes the three modules work at
-- all — there is no role bypass in authorizePermission().
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'super_admin'
  AND p.name IN (
    'impersonation.view_sessions', 'impersonation.start_session',
    'impersonation.approve_requests', 'impersonation.manage_settings',
    'two_factor.view_status', 'two_factor.enable', 'two_factor.disable',
    'two_factor.manage_policies', 'two_factor.view_audit_log', 'two_factor.reset_user',
    'billing.request_late_fee_waiver', 'billing.approve_late_fee_waiver'
  )
ON CONFLICT DO NOTHING;

-- Chairman: support duties and the waiver approval, but not policy or reset.
-- Nothing here is in the settings or system categories, so the Chairman revoke
-- that follows this migration does not claw any of it back.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'chairman'
  AND p.name IN (
    'impersonation.view_sessions', 'impersonation.start_session',
    'impersonation.approve_requests', 'impersonation.manage_settings',
    'two_factor.view_audit_log',
    'billing.request_late_fee_waiver', 'billing.approve_late_fee_waiver'
  )
ON CONFLICT DO NOTHING;

-- Financial officer raises waivers; approval stays with chairman/super_admin so
-- the maker-checker split is real.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE r.name = 'financial_officer'
  AND p.name = 'billing.request_late_fee_waiver'
ON CONFLICT DO NOTHING;

-- Self-service two-factor is about the caller's own account, not about
-- administering anyone else's, so every role gets it. The alternative would be
-- dropping the permission check in src/actions/two-factor/setup.ts for
-- self-targeted calls; that is a wider change than this migration should make.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM app_roles r
CROSS JOIN app_permissions p
WHERE p.name IN ('two_factor.view_status', 'two_factor.enable', 'two_factor.disable')
ON CONFLICT DO NOTHING;
