'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { authorizeAnyPermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { AppRole } from '@/types/database';

/** What the assignment forms need to offer a role (#1316). */
export type AssignableRole = Pick<
  AppRole,
  'id' | 'name' | 'display_name' | 'description' | 'is_active' | 'category'
> & {
  /** Only a profile linked to a resident may hold the role (#823). */
  requires_resident: boolean;
};

/**
 * Active roles for the Change role, Assign Roles and Approve dialogs.
 *
 * getRolesWithPermissions needs system.manage_roles, so a Chairman holding only
 * system.assign_roles saw an empty role list. This read is guarded by the
 * permission those dialogs' writes need. Which of these roles the caller may
 * grant is filtered in the UI by grantableRoles and enforced by the write
 * actions.
 */
export async function getAssignableRoles(): Promise<{
  success: boolean;
  data?: AssignableRole[];
  error?: string;
}> {
  const auth = await authorizeAnyPermission([
    PERMISSIONS.SYSTEM_ASSIGN_ROLES,
    PERMISSIONS.SYSTEM_MANAGE_ROLES,
  ]);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const { data, error } = await createAdminClient()
    .from('app_roles')
    .select('id, name, display_name, description, is_active, requires_resident, category')
    .eq('is_active', true)
    .order('display_name', { ascending: true });

  if (error) {
    console.error('[getAssignableRoles] Could not load roles:', error);
    return { success: false, error: 'Could not load the roles' };
  }

  return {
    success: true,
    data: (data ?? []).map((role) => ({
      ...role,
      requires_resident: Boolean(role.requires_resident),
    })) as AssignableRole[],
  };
}
