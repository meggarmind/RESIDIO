// Server action to check if the current user can view inactive bank accounts.
// Mirrors the RLS policy gate: ['super_admin','chairman','vice_chairman','financial_officer'].
// Uses BILLING_MANAGE_PROFILES as the canonical finance write permission.
'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';

export async function canViewInactiveBankAccounts(): Promise<{ authorized: boolean }> {
  const auth = await authorizePermission(PERMISSIONS.BILLING_MANAGE_PROFILES);
  return { authorized: auth.authorized };
}