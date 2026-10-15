'use server';

import { cache } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { AuthorizationResult, Permission } from './action-roles';
import { resolveAccess, toAccessClient, type AccessResult } from './access';

/**
 * Resolves the current user's Access in one round trip. A failed lookup is
 * logged here and returned as-is; callers treat it as no access (fail closed).
 *
 * Memoized per request with React `cache()` (#215): several authorize* calls in
 * one server request share a single `get_my_access` round trip. `cache()` is
 * scoped to the current request, so nothing is shared across requests or users.
 * Keep this module-private (a 'use server' file may only export async
 * functions) and never replace it with a module-level Map or TTL.
 * Caveat: within one request a role/permission change is not re-read.
 */
const resolveCurrentAccess = cache(async (): Promise<AccessResult> => {
  const supabase = await createServerSupabaseClient();
  const access = await resolveAccess(toAccessClient(supabase));
  if (access.status === 'lookup-failed') {
    console.error('[Authorize] access lookup failed', {
      userId: access.userId,
      error: access.error,
    });
  }
  return access;
});

/**
 * Shared body of the authorize* functions: authenticate, resolve Access, then
 * apply `isAllowed` to the permission set. `denial` is the exact error string.
 */
async function authorizeWith(
  isAllowed: (permissions: string[]) => boolean,
  denial: string
): Promise<AuthorizationResult> {
  const access = await resolveCurrentAccess();

  if (access.status === 'no-access' && access.userId === null) {
    return {
      authorized: false,
      userId: null,
      roleName: null,
      roleId: null,
      permissions: [],
      error: 'Unauthorized: Not authenticated',
    };
  }

  if (access.status !== 'resolved') {
    return {
      authorized: false,
      userId: access.userId,
      roleName: null,
      roleId: null,
      permissions: [],
      error: denial,
    };
  }

  const { userId, roleName, roleId, permissions } = access;

  if (!isAllowed(permissions)) {
    return { authorized: false, userId, roleName, roleId, permissions, error: denial };
  }

  return { authorized: true, userId, roleName, roleId, permissions, error: null };
}

/**
 * Returns the current user's id and full permission set, without requiring
 * any specific permission.
 *
 * For endpoints (e.g. global search) that must independently filter several
 * result categories, each gated by a different permission -- calling
 * `authorizePermission()` once per category would re-run the lookup that many
 * times. This fetches it once; callers check `permissions.includes(...)` per
 * category themselves. `userId` is `null` when there is no authenticated user,
 * which callers should treat as a hard "no access at all", not merely "no
 * permissions".
 */
export async function getCurrentUserPermissions(): Promise<{
  userId: string | null;
  permissions: string[];
}> {
  const access = await resolveCurrentAccess();

  return {
    userId: access.userId,
    permissions: access.status === 'resolved' ? access.permissions : [],
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
  return authorizeWith(
    (permissions) => permissions.includes(requiredPermission),
    `Unauthorized: Missing permission '${requiredPermission}'`
  );
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
  return authorizeWith(
    (permissions) => requiredPermissions.some((p) => permissions.includes(p)),
    `Unauthorized: Missing required permissions. Need one of: ${requiredPermissions.join(', ')}`
  );
}
