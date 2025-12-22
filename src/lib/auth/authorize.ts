'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserRole, AppRoleName } from '@/types/database';
import type { AuthorizationResult, Permission } from './action-roles';

/**
 * Get user's permissions from the new RBAC system.
 * Returns an array of permission strings the user has.
 */
async function getUserPermissions(userId: string): Promise<{
  permissions: string[];
  roleName: AppRoleName | null;
  roleId: string | null;
}> {
  const supabase = await createServerSupabaseClient();

  // Get user's role_id
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role_id')
    .eq('id', userId)
    .single();

  if (error || !profile?.role_id) {
    return { permissions: [], roleName: null, roleId: null };
  }

  // Get role details
  const { data: roleData } = await supabase
    .from('app_roles')
    .select('id, name')
    .eq('id', profile.role_id)
    .single();

  // Get permission IDs for this role
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', profile.role_id);

  const permissionIds = rolePerms?.map((rp) => rp.permission_id) || [];

  // Get permission names
  let permissions: string[] = [];
  if (permissionIds.length > 0) {
    const { data: permsData } = await supabase
      .from('app_permissions')
      .select('name')
      .in('id', permissionIds);
    permissions = permsData?.map((p) => p.name) || [];
  }

  return {
    permissions,
    roleName: roleData?.name as AppRoleName | null,
    roleId: profile.role_id,
  };
}

/**
 * Check if the current user has a specific permission.
 * Uses the new RBAC permission system.
 *
 * @param requiredPermission - The permission string to check
 * @returns Authorization result with user info or error
 */
export async function authorizePermission(
  requiredPermission: Permission
): Promise<AuthorizationResult> {
  const supabase = await createServerSupabaseClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      userId: null,
      role: null,
      roleName: null,
      roleId: null,
      permissions: [],
      error: 'Unauthorized: Not authenticated',
    };
  }

  // Get user's permissions
  const { permissions, roleName, roleId } = await getUserPermissions(user.id);

  // Get legacy role for backwards compatibility
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const legacyRole = profile?.role as UserRole | null;

  // Check if user has the required permission
  if (!permissions.includes(requiredPermission)) {
    return {
      authorized: false,
      userId: user.id,
      role: legacyRole,
      roleName,
      roleId,
      permissions,
      error: `Unauthorized: Missing permission '${requiredPermission}'`,
    };
  }

  return {
    authorized: true,
    userId: user.id,
    role: legacyRole,
    roleName,
    roleId,
    permissions,
    error: null,
  };
}

/**
 * Check if the current user has ANY of the specified permissions.
 * Useful for OR-style permission checks.
 *
 * @param requiredPermissions - Array of permission strings (user needs at least one)
 * @returns Authorization result with user info or error
 */
export async function authorizeAnyPermission(
  requiredPermissions: Permission[]
): Promise<AuthorizationResult> {
  const supabase = await createServerSupabaseClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      userId: null,
      role: null,
      roleName: null,
      roleId: null,
      permissions: [],
      error: 'Unauthorized: Not authenticated',
    };
  }

  const { permissions, roleName, roleId } = await getUserPermissions(user.id);

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  const legacyRole = profile?.role as UserRole | null;

  // Check if user has ANY of the required permissions
  const hasAnyPermission = requiredPermissions.some(p => permissions.includes(p));

  if (!hasAnyPermission) {
    return {
      authorized: false,
      userId: user.id,
      role: legacyRole,
      roleName,
      roleId,
      permissions,
      error: `Unauthorized: Missing required permissions. Need one of: ${requiredPermissions.join(', ')}`,
    };
  }

  return {
    authorized: true,
    userId: user.id,
    role: legacyRole,
    roleName,
    roleId,
    permissions,
    error: null,
  };
}

/**
 * @deprecated Use authorizePermission() instead.
 * Check if the current user is authorized for a specific action.
 * Returns user info if authorized, error otherwise.
 *
 * @param allowedRoles - Array of roles that are allowed to perform the action
 * @returns Authorization result with user info or error
 */
export async function authorizeAction(
  allowedRoles: UserRole[]
): Promise<AuthorizationResult> {
  const supabase = await createServerSupabaseClient();

  // Check if user is authenticated
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      authorized: false,
      userId: null,
      role: null,
      roleName: null,
      roleId: null,
      permissions: [],
      error: 'Unauthorized: Not authenticated',
    };
  }

  // Get user profile with role (legacy) and new role_id
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role, role_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return {
      authorized: false,
      userId: user.id,
      role: null,
      roleName: null,
      roleId: null,
      permissions: [],
      error: 'Unauthorized: Profile not found',
    };
  }

  const userRole = profile.role as UserRole;

  // Get new RBAC info
  const { permissions, roleName, roleId } = await getUserPermissions(user.id);

  // Check if user's role is in the allowed roles
  if (!allowedRoles.includes(userRole)) {
    return {
      authorized: false,
      userId: user.id,
      role: userRole,
      roleName,
      roleId,
      permissions,
      error: `Unauthorized: Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`,
    };
  }

  return {
    authorized: true,
    userId: user.id,
    role: userRole,
    roleName,
    roleId,
    permissions,
    error: null,
  };
}
