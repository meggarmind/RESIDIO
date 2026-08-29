'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { assignRoleToProfile } from '@/actions/roles/assign-role';

/**
 * Administrator review queue for new accounts.
 *
 * Signing up — whether with Google or with a password — provisions a profile
 * with approval_status 'pending', no role and no resident link. Until an
 * administrator approves it here, the account is denied by every RLS policy,
 * because the SECURITY DEFINER helpers those policies call resolve to
 * NULL/false for any status other than 'active'.
 */

export type PendingAccount = {
  id: string;
  email: string;
  full_name: string;
  created_at: string;
  /** Sign-in method, e.g. 'google' or 'email'. Null if it cannot be determined. */
  provider: string | null;
  last_sign_in_at: string | null;
  email_confirmed: boolean;
  /** Set when the account was already matched to a resident record. */
  resident_id: string | null;
};

// =====================================================
// List pending accounts
// =====================================================

export async function getPendingAccounts(): Promise<{
  accounts: PendingAccount[];
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { accounts: [], error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select('id, email, full_name, created_at, resident_id')
    .eq('approval_status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error loading pending accounts:', error);
    return { accounts: [], error: 'Failed to load pending accounts' };
  }

  if (!profiles || profiles.length === 0) {
    return { accounts: [] };
  }

  // Sign-in provider and confirmation state live on auth.users, which is only
  // reachable with the service role. A failure here degrades the display rather
  // than the queue itself, so it is tolerated.
  const authUsersById = new Map<
    string,
    { provider: string | null; last_sign_in_at: string | null; email_confirmed: boolean }
  >();

  try {
    const adminClient = createAdminClient();
    const { data: authData } = await adminClient.auth.admin.listUsers();

    for (const user of authData?.users ?? []) {
      authUsersById.set(user.id, {
        provider: user.app_metadata?.provider ?? null,
        last_sign_in_at: user.last_sign_in_at ?? null,
        email_confirmed: Boolean(user.email_confirmed_at),
      });
    }
  } catch (err) {
    console.error('Could not enrich pending accounts with auth metadata:', err);
  }

  const accounts: PendingAccount[] = profiles.map((profile) => {
    const authUser = authUsersById.get(profile.id);

    return {
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      created_at: profile.created_at,
      resident_id: profile.resident_id,
      provider: authUser?.provider ?? null,
      last_sign_in_at: authUser?.last_sign_in_at ?? null,
      email_confirmed: authUser?.email_confirmed ?? false,
    };
  });

  return { accounts };
}

// =====================================================
// Approve
// =====================================================

/**
 * Approve a pending account, assign its role, and optionally link it to a
 * resident record.
 *
 * The role write is delegated to assignRoleToProfile so the super_admin and
 * chairman escalation guards apply here too — approving someone is not a way
 * around them.
 */
export async function approveAccount(
  profileId: string,
  roleId: string,
  residentId?: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, approval_status, resident_id')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  if (profile.approval_status === 'active') {
    return { success: false, error: 'This account has already been approved' };
  }

  // Assign the role first. If the caller is not allowed to grant this role, the
  // account stays pending rather than being activated with no role.
  const roleResult = await assignRoleToProfile(profileId, roleId);
  if (!roleResult.success) {
    return roleResult;
  }

  if (residentId) {
    const { data: existingLink } = await supabase
      .from('profiles')
      .select('id')
      .eq('resident_id', residentId)
      .neq('id', profileId)
      .maybeSingle();

    if (existingLink) {
      return {
        success: false,
        error: 'That resident is already linked to a different account.',
      };
    }
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      approval_status: 'active',
      approved_at: new Date().toISOString(),
      approved_by: auth.userId,
      rejection_reason: null,
      ...(residentId ? { resident_id: residentId } : {}),
    })
    .eq('id', profileId);

  if (updateError) {
    console.error('Error approving account:', updateError);
    return { success: false, error: 'Failed to approve account' };
  }

  await logAudit({
    action: 'APPROVE',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: profile.full_name || profile.email,
    oldValues: { approval_status: profile.approval_status, resident_id: profile.resident_id },
    newValues: {
      approval_status: 'active',
      role_id: roleId,
      resident_id: residentId ?? profile.resident_id,
    },
    description: 'Account approved and role assigned',
  });

  return { success: true };
}

// =====================================================
// Reject
// =====================================================

export async function rejectAccount(
  profileId: string,
  reason: string
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const trimmedReason = reason?.trim();
  if (!trimmedReason) {
    return { success: false, error: 'A reason is required so the applicant knows why' };
  }

  if (profileId === auth.userId) {
    return { success: false, error: 'You cannot reject your own account' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, approval_status')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      approval_status: 'rejected',
      rejection_reason: trimmedReason,
      role_id: null,
      role: null,
      approved_at: null,
      approved_by: null,
    })
    .eq('id', profileId);

  if (updateError) {
    console.error('Error rejecting account:', updateError);
    return { success: false, error: 'Failed to reject account' };
  }

  await logAudit({
    action: 'REJECT',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: profile.full_name || profile.email,
    oldValues: { approval_status: profile.approval_status },
    newValues: { approval_status: 'rejected', rejection_reason: trimmedReason },
    description: 'Account application rejected',
  });

  return { success: true };
}
