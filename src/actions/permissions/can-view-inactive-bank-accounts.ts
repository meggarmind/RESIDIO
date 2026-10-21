// Server action to check if the current user can view inactive bank accounts.
// Follows the RLS policy gate (payments.manage_reference_records: super_admin, chairman, financial_officer). vice_chairman and project_manager are retired by #825.
// Uses BILLING_MANAGE_PROFILES as the canonical finance write permission.
'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

export async function canViewInactiveBankAccounts(): Promise<{ authorized: boolean }> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_PROFILES);
  return { authorized: auth.authorized };
}