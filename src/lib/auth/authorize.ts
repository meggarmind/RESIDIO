'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { UserRole } from '@/types/database';
import type { AuthorizationResult } from './action-roles';

/**
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
      error: 'Unauthorized: Not authenticated',
    };
  }

  // Get user profile with role
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return {
      authorized: false,
      userId: user.id,
      role: null,
      error: 'Unauthorized: Profile not found',
    };
  }

  const userRole = profile.role as UserRole;

  // Check if user's role is in the allowed roles
  if (!allowedRoles.includes(userRole)) {
    return {
      authorized: false,
      userId: user.id,
      role: userRole,
      error: `Unauthorized: Insufficient permissions. Required roles: ${allowedRoles.join(', ')}`,
    };
  }

  return {
    authorized: true,
    userId: user.id,
    role: userRole,
    error: null,
  };
}
