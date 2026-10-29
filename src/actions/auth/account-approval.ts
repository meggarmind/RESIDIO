'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { listAllAuthUsers } from '@/lib/supabase/list-all-auth-users';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { isLastActiveSuperAdmin, LAST_SUPER_ADMIN_ERROR } from '@/lib/auth/super-admin-invariant';
import { assertCanGrantRoles, assertCanManageTarget } from '@/lib/auth/account-guards';
import {
  checkTitleForRole,
  evaluateRoleAssignmentRules,
  noResidentError,
} from '@/lib/auth/role-assignment-checks';

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

  // Service role after the permission check: RLS on profiles shows other
  // people's rows only to system.view_all_profiles.
  const adminClient = createAdminClient();

  const { data: profiles, error } = await adminClient
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
    // Every page: one listUsers() call returns only the first 50 logins (#1315).
    const { users, error: listError } = await listAllAuthUsers(adminClient);
    if (listError) {
      console.error('Could not enrich pending accounts with auth metadata:', listError);
    }

    for (const user of users ?? []) {
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
 * Approve a pending account: optionally link it to a resident record, give it
 * a role (and optionally a title), and activate it.
 *
 * Everything is checked before anything is written: the account's status, who
 * may grant the role and change the account, the resident link, "Who can hold
 * each role" and the title's seats. Then the resident is linked, so a role that
 * only a resident may hold can be given, and the role is written together with
 * the activation. If that second write fails, the link is undone, so a failed
 * approval leaves the account as it was.
 *
 * It does not call assignRoleToProfile, which refuses accounts that are not
 * active; the same guards run here instead.
 */
export async function approveAccount(
  profileId: string,
  roleId: string,
  residentId?: string | null,
  titleId?: string | null
): Promise<{ success: boolean; error?: string }> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Service role after the permission check: RLS on profiles shows other
  // people's rows only to system.view_all_profiles, and no policy lets an
  // administrator update another account's row.
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, approval_status, resident_id, role_id, title_id')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  if (profile.approval_status === 'active') {
    return { success: false, error: 'This account has already been approved' };
  }
  if (profile.approval_status === 'rejected') {
    return {
      success: false,
      error: 'This sign-up was rejected, so it cannot be approved. The person must sign up again.',
    };
  }
  if (profile.approval_status !== 'pending') {
    return {
      success: false,
      error: `This account is ${profile.approval_status}, so it cannot be approved here.`,
    };
  }

  const { data: role, error: roleError } = await admin
    .from('app_roles')
    .select('id, name, display_name, is_active, requires_resident')
    .eq('id', roleId)
    .single();

  if (roleError || !role) {
    return { success: false, error: 'Role not found' };
  }
  if (!role.is_active) {
    return { success: false, error: 'Cannot assign an inactive role' };
  }

  // Target and grant guards (#475, #826), as in assignRoleToProfile: approving
  // someone is not a way around them.
  const targetGuard = await assertCanManageTarget(auth.userId!, profileId);
  if (!targetGuard.ok) {
    return { success: false, error: targetGuard.error };
  }
  const grantGuard = await assertCanGrantRoles(auth.userId!, [role.name]);
  if (!grantGuard.ok) {
    return { success: false, error: grantGuard.error };
  }

  // The resident link. An account already linked keeps its link; changing it
  // is the job of the link and unlink actions.
  const newResidentId = residentId || null;
  if (newResidentId && profile.resident_id && profile.resident_id !== newResidentId) {
    return {
      success: false,
      error: 'This account is already linked to a different resident record.',
    };
  }
  const linking = Boolean(newResidentId && newResidentId !== profile.resident_id);

  if (linking) {
    const { data: resident, error: residentError } = await admin
      .from('residents')
      .select('id, profile_id')
      .eq('id', newResidentId!)
      .maybeSingle();

    if (residentError) {
      console.error('Error reading resident for approval:', residentError);
      return { success: false, error: 'Could not check the resident record' };
    }
    if (!resident) {
      return { success: false, error: 'Resident not found' };
    }

    const { data: existingLink, error: linkError } = await admin
      .from('profiles')
      .select('id')
      .eq('resident_id', newResidentId!)
      .neq('id', profileId)
      .maybeSingle();

    if (linkError) {
      console.error('Error checking resident link for approval:', linkError);
      return { success: false, error: 'Could not check the resident record' };
    }
    if (existingLink || (resident.profile_id && resident.profile_id !== profileId)) {
      return {
        success: false,
        error: 'That resident is already linked to a different account.',
      };
    }
  }

  const effectiveResidentId = newResidentId ?? profile.resident_id;

  if (role.requires_resident && !effectiveResidentId) {
    return { success: false, error: noResidentError(role.display_name) };
  }

  const ruleCheck = await evaluateRoleAssignmentRules(effectiveResidentId, role.id);
  if (!ruleCheck.allowed) {
    return { success: false, error: ruleCheck.reason };
  }

  const titleCheck = await checkTitleForRole(role.id, titleId ?? null, profileId);
  if (!titleCheck.ok) {
    return { success: false, error: titleCheck.error };
  }
  const title = titleCheck.title;

  // Step 1: link the resident, from both sides as linkAuthAccount does.
  // The account stays pending, so the link alone grants nothing.
  if (linking) {
    const { data: linked, error: linkWriteError } = await admin
      .from('profiles')
      .update({ resident_id: newResidentId })
      .eq('id', profileId)
      .select('id');

    if (linkWriteError || !linked || linked.length === 0) {
      console.error('Error linking resident during approval:', linkWriteError ?? 'no rows matched');
      return { success: false, error: 'Failed to link the resident record' };
    }

    const { error: residentWriteError } = await admin
      .from('residents')
      .update({ profile_id: profileId })
      .eq('id', newResidentId!);

    if (residentWriteError) {
      console.error('Error linking resident during approval:', residentWriteError);
      await undoResidentLink(admin, profileId, profile.resident_id, null);
      return { success: false, error: 'Failed to link the resident record' };
    }
  }

  // Step 2: the role, the title and the activation, in one write.
  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({
      role_id: role.id,
      title_id: title?.id ?? null,
      approval_status: 'active',
      approved_at: new Date().toISOString(),
      approved_by: auth.userId,
      rejection_reason: null,
    })
    .eq('id', profileId)
    .eq('approval_status', 'pending')
    .select('id');

  if (updateError || !updated || updated.length === 0) {
    console.error('Error approving account:', updateError ?? `no rows matched for profile ${profileId}`);
    if (linking) {
      await undoResidentLink(admin, profileId, profile.resident_id, newResidentId);
    }
    // The trigger (#823) is the last line of defence: a seat taken between the
    // check above and this write comes back as a check violation.
    return {
      success: false,
      error:
        updateError?.code === '23514'
          ? updateError.message
          : updateError
            ? 'Failed to approve account'
            : 'Failed to approve account: the account could not be updated',
    };
  }

  const person = profile.full_name || profile.email;
  await logAudit({
    action: 'APPROVE',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: title ? `${person} (${title.name})` : person,
    oldValues: {
      approval_status: profile.approval_status,
      resident_id: profile.resident_id,
      role_id: profile.role_id,
      title_id: profile.title_id ?? null,
    },
    newValues: {
      approval_status: 'active',
      role_id: role.id,
      role_name: role.display_name,
      title_id: title?.id ?? null,
      title_name: title?.name ?? null,
      resident_id: effectiveResidentId,
    },
    description: 'Account approved and role assigned',
  });

  return { success: true };
}

/** Put a failed approval's resident link back as it was. Failures are logged, not thrown. */
async function undoResidentLink(
  admin: ReturnType<typeof createAdminClient>,
  profileId: string,
  previousResidentId: string | null,
  linkedResidentId: string | null
): Promise<void> {
  const { error: profileError } = await admin
    .from('profiles')
    .update({ resident_id: previousResidentId })
    .eq('id', profileId);
  if (profileError) {
    console.error('Could not undo the resident link on the account', profileId, profileError);
  }

  if (linkedResidentId) {
    const { error: residentError } = await admin
      .from('residents')
      .update({ profile_id: null })
      .eq('id', linkedResidentId)
      .eq('profile_id', profileId);
    if (residentError) {
      console.error('Could not undo the resident link on resident', linkedResidentId, residentError);
    }
  }
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

  // Service role after the permission check, as in approveAccount.
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, approval_status, role_id, title_id')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  // Target guard (#475, #826): rejecting clears role_id, so an account holding
  // super_admin or chairman needs system.assign_board_roles.
  const targetGuard = await assertCanManageTarget(auth.userId!, profileId);
  if (!targetGuard.ok) {
    return { success: false, error: targetGuard.error };
  }

  // Rejection is the pending queue's action. Aimed at an active, suspended or
  // already-rejected account it would strip a working account of its role.
  if (profile.approval_status !== 'pending') {
    return { success: false, error: 'Only pending accounts can be rejected' };
  }

  // Bootstrap invariant (#184). Rejection is not only a pending-queue action:
  // it clears role_id and moves approval_status off 'active', so it can strand
  // the estate if aimed at the last administrator.
  if (await isLastActiveSuperAdmin(profileId)) {
    return { success: false, error: LAST_SUPER_ADMIN_ERROR };
  }

  // Service role for the same reason as approveAccount above.
  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({
      approval_status: 'rejected',
      rejection_reason: trimmedReason,
      role_id: null,
      title_id: null,
      approved_at: null,
      approved_by: null,
    })
    .eq('id', profileId)
    .select('id');

  if (updateError) {
    console.error('Error rejecting account:', updateError);
    return { success: false, error: 'Failed to reject account' };
  }

  if (!updated || updated.length === 0) {
    console.error('Rejection matched no rows for profile', profileId);
    return { success: false, error: 'Failed to reject account: the account could not be updated' };
  }

  await logAudit({
    action: 'REJECT',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: profile.full_name || profile.email,
    oldValues: {
      approval_status: profile.approval_status,
      role_id: profile.role_id,
      title_id: profile.title_id ?? null,
    },
    newValues: { approval_status: 'rejected', rejection_reason: trimmedReason, role_id: null, title_id: null },
    description: 'Account application rejected',
  });

  return { success: true };
}
