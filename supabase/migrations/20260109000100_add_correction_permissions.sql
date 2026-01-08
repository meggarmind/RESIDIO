-- Migration: Add Invoice Correction Permissions
-- Description: Seeds permissions for creating invoice corrections and managing wallet allocations
-- Author: Claude Code
-- Date: 2026-01-09

BEGIN;

-- Insert new permissions for invoice correction functionality
INSERT INTO public.app_permissions (name, display_name, description, category, is_active)
VALUES
  (
    'billing.create_invoice',
    'Create Invoice Corrections',
    'Can create debit and credit notes to correct invoice errors',
    'billing',
    true
  ),
  (
    'billing.manage_wallets',
    'Manage Wallet Allocations',
    'Can reverse payment allocations and manage resident wallet balances',
    'billing',
    true
  )
ON CONFLICT (name) DO NOTHING;

-- Assign permissions to super_admin, chairman, and financial_officer roles
-- These roles are authorized to handle billing corrections
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.app_roles r
CROSS JOIN public.app_permissions p
WHERE r.name IN ('super_admin', 'chairman', 'financial_officer')
  AND p.name IN ('billing.create_invoice', 'billing.manage_wallets')
ON CONFLICT DO NOTHING;

COMMIT;
