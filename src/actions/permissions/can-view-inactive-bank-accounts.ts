// Server action to check if the current user can view inactive bank accounts.
// Follows the RLS policy gate ['super_admin','chairman','vice_chairman','financial_officer'], except that
// billing.manage_profiles is also held by project_manager (#824 slice 2 found this; not changed here).
// Uses BILLING_MANAGE_PROFILES as the canonical finance write permission.
'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

export async function canViewInactiveBankAccounts(): Promise<{ authorized: boolean }> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_PROFILES);
  return { authorized: auth.authorized };
}