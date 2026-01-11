'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type {
  TwoFactorStatus,
  TwoFactorPolicy,
  TwoFactorPolicyWithRole,
  TwoFactorMethod,
  TwoFactorEnforcement,
} from '@/types/database';

/**
 * Get the 2FA status for the current user
 */
export async function getTwoFactorStatus(): Promise<{
  data: TwoFactorStatus | null;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Get profile with 2FA fields
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select(`
      two_factor_enabled,
      two_factor_method,
      two_factor_verified_at,
      two_factor_last_verified_at,
      two_factor_recovery_codes_used,
      role_id
    `)
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    return { data: null, error: 'Profile not found' };
  }

  // Count remaining backup codes
  const { count: backupCodesCount } = await adminClient
    .from('two_factor_backup_codes')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id)
    .is('used_at', null);

  // Get enforcement policy for user's role
  const policy = await getEffectivePolicy(profile.role_id);

  // Calculate if 2FA is required for this user
  const isRequired = calculateIsRequired(policy, profile.role_id);

  // Calculate grace period end date if applicable
  const gracePeriodEndsAt = calculateGracePeriod(profile, policy);

  // Get allowed methods from policy
  const allowedMethods = getAllowedMethods(policy);

  const status: TwoFactorStatus = {
    enabled: profile.two_factor_enabled || false,
    method: profile.two_factor_method as TwoFactorMethod | null,
    verifiedAt: profile.two_factor_verified_at,
    lastVerifiedAt: profile.two_factor_last_verified_at,
    backupCodesRemaining: backupCodesCount || 0,
    isRequired,
    gracePeriodEndsAt,
    allowedMethods,
  };

  return { data: status, error: null };
}

/**
 * Get the effective 2FA policy for a role (or global if no role-specific policy)
 */
async function getEffectivePolicy(roleId: string | null): Promise<TwoFactorPolicy | null> {
  const adminClient = createAdminClient();

  // First try to get role-specific policy
  if (roleId) {
    const { data: rolePolicy } = await adminClient
      .from('two_factor_policies')
      .select('*')
      .eq('role_id', roleId)
      .eq('is_active', true)
      .single();

    if (rolePolicy) {
      return rolePolicy as TwoFactorPolicy;
    }
  }

  // Fall back to global policy (role_id is null)
  const { data: globalPolicy } = await adminClient
    .from('two_factor_policies')
    .select('*')
    .is('role_id', null)
    .eq('is_active', true)
    .single();

  return globalPolicy as TwoFactorPolicy | null;
}

/**
 * Calculate if 2FA is required for a user based on policy
 */
function calculateIsRequired(
  policy: TwoFactorPolicy | null,
  roleId: string | null
): boolean {
  if (!policy) return false;

  switch (policy.enforcement) {
    case 'disabled':
      return false;
    case 'optional':
      return false;
    case 'required_admin':
      // Required only for users with a role (admin users)
      return roleId !== null;
    case 'required_all':
      return true;
    default:
      return false;
  }
}

/**
 * Calculate grace period end date
 */
function calculateGracePeriod(
  profile: { two_factor_enabled?: boolean; two_factor_verified_at?: string | null },
  policy: TwoFactorPolicy | null
): string | null {
  if (!policy || policy.grace_period_days <= 0) return null;
  if (profile.two_factor_enabled) return null;

  // Grace period starts from when the policy was activated
  // For simplicity, we'll calculate from profile creation date
  // In production, you might want to track when user first logged in after policy change
  return null; // Implement based on business requirements
}

/**
 * Get allowed 2FA methods from policy
 */
function getAllowedMethods(policy: TwoFactorPolicy | null): TwoFactorMethod[] {
  if (!policy) {
    return ['sms', 'authenticator', 'email'];
  }

  const methods: TwoFactorMethod[] = [];
  if (policy.allow_sms) methods.push('sms');
  if (policy.allow_authenticator) methods.push('authenticator');
  if (policy.allow_email) methods.push('email');

  return methods;
}

/**
 * Get the 2FA policy for a specific role (or global)
 */
export async function getTwoFactorPolicy(roleId: string | null): Promise<{
  data: TwoFactorPolicyWithRole | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_MANAGE_POLICIES);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();

  const query = adminClient
    .from('two_factor_policies')
    .select(`
      *,
      role:app_roles(id, name, display_name)
    `);

  if (roleId) {
    query.eq('role_id', roleId);
  } else {
    query.is('role_id', null);
  }

  const { data, error } = await query.single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as TwoFactorPolicyWithRole, error: null };
}

/**
 * Get all 2FA policies
 */
export async function getAllTwoFactorPolicies(): Promise<{
  data: TwoFactorPolicyWithRole[];
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_MANAGE_POLICIES);
  if (!auth.authorized) {
    return { data: [], error: auth.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();

  const { data, error } = await adminClient
    .from('two_factor_policies')
    .select(`
      *,
      role:app_roles(id, name, display_name)
    `)
    .order('role_id', { nullsFirst: true });

  if (error) {
    return { data: [], error: error.message };
  }

  return { data: data as TwoFactorPolicyWithRole[], error: null };
}
