'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { ACCOUNT_NOT_FOUND_ERROR, assertCanManageTarget } from '@/lib/auth/account-guards';
import { listAllAuthUsers } from '@/lib/supabase/list-all-auth-users';
import { z } from 'zod';

// Types for auth account search results
export interface AuthAccountSearchResult {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  linked_resident_id: string | null;
  linked_resident_name: string | null;
}

export interface OrphanedAuthAccount {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  email_confirmed_at: string | null;
  /** The account's approval status; null when it has no profile row. */
  approval_status: string | null;
}

const emailSearchSchema = z.string().email().or(z.string().min(3));

/**
 * Search for auth accounts by email (for admin linking).
 *
 * Returns accounts with their current linking status.
 * Only accessible by users with SYSTEM_ASSIGN_ROLES permission.
 */
export async function searchAuthAccountsByEmail(
  email: string
): Promise<{ accounts: AuthAccountSearchResult[]; error?: string }> {
  // Check permissions
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { accounts: [], error: 'Unauthorized' };
  }

  const parsed = emailSearchSchema.safeParse(email);
  if (!parsed.success) {
    return { accounts: [], error: 'Invalid search query' };
  }

  const searchTerm = email.toLowerCase().trim();
  // Other users' profiles and residents are read with the service role: RLS shows
  // the caller only their own row unless they hold system.view_all_profiles, which
  // would make an "already linked" account read as available. Permission is
  // enforced by the authorizePermission() check above.
  const adminClient = createAdminClient();

  try {
    // Get all auth users
    const { users: authUsers, error: authError } = await listAllAuthUsers(adminClient);

    if (authError || !authUsers) {
      console.error('Error listing auth users:', authError);
      return { accounts: [], error: 'Failed to search accounts' };
    }

    // Filter by email (case-insensitive partial match)
    const matchingUsers = authUsers.filter(
      (u) => u.email?.toLowerCase().includes(searchTerm)
    );

    // Get profile information for these users (to find linked residents)
    const userIds = matchingUsers.map((u) => u.id);

    const { data: profiles } = await adminClient
      .from('profiles')
      .select(`
        id,
        resident_id,
        residents:resident_id (
          id,
          first_name,
          last_name
        )
      `)
      .in('id', userIds);

    // Build profile lookup map
    const profileMap = new Map<string, {
      resident_id: string | null;
      resident_name: string | null;
    }>();

    for (const profile of profiles || []) {
      // resident_id is a many-to-one FK, so the join is a single object (not an array)
      const resident = profile.residents as unknown as { first_name: string; last_name: string } | null;
      profileMap.set(profile.id, {
        resident_id: profile.resident_id,
        resident_name: resident ? `${resident.first_name} ${resident.last_name}` : null,
      });
    }

    // Build result
    const accounts: AuthAccountSearchResult[] = matchingUsers.map((user) => {
      const profileInfo = profileMap.get(user.id);
      return {
        id: user.id,
        email: user.email || '',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at || null,
        linked_resident_id: profileInfo?.resident_id || null,
        linked_resident_name: profileInfo?.resident_name || null,
      };
    });

    return { accounts };
  } catch (error) {
    console.error('Error searching auth accounts:', error);
    return { accounts: [], error: 'An error occurred while searching' };
  }
}

/**
 * Get all auth accounts that are not linked to any resident.
 *
 * These are "orphaned" accounts that may need to be linked to residents.
 * Only accessible by users with SYSTEM_ASSIGN_ROLES permission.
 */
export async function getOrphanedAuthAccounts(): Promise<{
  accounts: OrphanedAuthAccount[];
  error?: string;
}> {
  // Check permissions
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { accounts: [], error: 'Unauthorized' };
  }

  // Service role: a caller without system.view_all_profiles sees only their own
  // profile row through RLS, which would list every other account as orphaned.
  const adminClient = createAdminClient();

  try {
    // Get all auth users
    const { users: authUsers, error: authError } = await listAllAuthUsers(adminClient);

    if (authError || !authUsers) {
      console.error('Error listing auth users:', authError);
      return { accounts: [], error: 'Failed to fetch accounts' };
    }

    const { data: allProfiles, error: profilesError } = await adminClient
      .from('profiles')
      .select('id, resident_id, approval_status');

    if (profilesError) {
      console.error('Error fetching profiles for orphaned accounts:', profilesError);
      return { accounts: [], error: 'Failed to fetch accounts' };
    }

    // Build set of linked user IDs
    const linkedUserIds = new Set(
      (allProfiles || []).filter((p) => p.resident_id).map((p) => p.id)
    );
    const profileUserIds = new Set((allProfiles || []).map((p) => p.id));
    const approvalByUserId = new Map(
      (allProfiles || []).map((p) => [p.id, p.approval_status as string | null])
    );

    const orphanedAccounts: OrphanedAuthAccount[] = authUsers
      .filter((user) => {
        // Include if:
        // 1. Has a profile but no resident link, OR
        // 2. Has no profile at all
        const hasProfile = profileUserIds.has(user.id);
        const hasResidentLink = linkedUserIds.has(user.id);
        return hasProfile ? !hasResidentLink : true;
      })
      .map((user) => ({
        id: user.id,
        email: user.email || '',
        created_at: user.created_at,
        last_sign_in_at: user.last_sign_in_at || null,
        email_confirmed_at: user.email_confirmed_at || null,
        approval_status: approvalByUserId.get(user.id) ?? null,
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { accounts: orphanedAccounts };
  } catch (error) {
    console.error('Error fetching orphaned accounts:', error);
    return { accounts: [], error: 'An error occurred while fetching orphaned accounts' };
  }
}

const linkAccountSchema = z.object({
  authUserId: z.guid('Invalid auth user ID'),
  residentId: z.guid('Invalid resident ID'),
  forceRelink: z.boolean().optional(),
});

export interface LinkAccountResult {
  success: boolean;
  error?: string;
  previousResidentId?: string;
  previousResidentName?: string;
}

/**
 * Manually link an auth account to a resident.
 *
 * This creates or updates the profile to establish the resident_id connection.
 * If the account is already linked to another resident and forceRelink is not true,
 * it will return an error with the current link details.
 *
 * Only accessible by users with SYSTEM_ASSIGN_ROLES permission.
 */
export async function linkAuthAccountToResident(
  authUserId: string,
  residentId: string,
  forceRelink?: boolean
): Promise<LinkAccountResult> {
  // Check permissions
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = linkAccountSchema.safeParse({ authUserId, residentId, forceRelink });
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message || 'Invalid input' };
  }

  // Every read and write below runs with the service role, after the permission
  // check above: RLS hides other users' profiles and residents from the caller, so
  // the "already linked" guards would otherwise read nothing and pass.
  const adminClient = createAdminClient();

  try {
    // 1. Verify auth user exists
    const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(authUserId);
    if (authUserError || !authUserData.user) {
      return { success: false, error: 'Auth account not found' };
    }

    const authUser = authUserData.user;

    // 2. Verify resident exists
    const { data: resident, error: residentError } = await adminClient
      .from('residents')
      .select('id, first_name, last_name, email')
      .eq('id', residentId)
      .single();

    if (residentError || !resident) {
      return { success: false, error: 'Resident not found' };
    }

    // 3. Check if there's already a profile for this auth user
    const { data: existingProfile } = await adminClient
      .from('profiles')
      .select(`
        id,
        resident_id,
        role_id,
        approval_status,
        residents:resident_id (
          id,
          first_name,
          last_name
        )
      `)
      .eq('id', authUserId)
      .single();

    // Target guard (#475, #826): an account holding super_admin or chairman needs
    // system.assign_board_roles. Read through the service role so RLS hiding the row
    // from the caller cannot turn into a bypass. "Not found" is tolerated only
    // because the insert path below provisions accounts that predate the
    // handle_new_user() trigger.
    const targetGuard = await assertCanManageTarget(auth.userId!, authUserId);
    if (!targetGuard.ok && targetGuard.error !== ACCOUNT_NOT_FOUND_ERROR) {
      return { success: false, error: targetGuard.error };
    }

    // Linking force-sets approval_status to 'active'. That is right for a
    // pending account; for a rejected or suspended one it would silently undo an
    // administrator's decision.
    if (
      targetGuard.ok &&
      (targetGuard.targetApprovalStatus === 'rejected' ||
        targetGuard.targetApprovalStatus === 'suspended')
    ) {
      return {
        success: false,
        error: `This account is ${targetGuard.targetApprovalStatus}. Reinstate it before linking it to a resident.`,
      };
    }

    let previousResidentId: string | undefined;
    let previousResidentName: string | undefined;

    if (existingProfile?.resident_id) {
      // Account is already linked to a resident
      if (existingProfile.resident_id === residentId) {
        return { success: false, error: 'This account is already linked to this resident' };
      }

      // resident_id is a many-to-one FK, so the join is a single object (not an array)
      const prevResident = existingProfile.residents as unknown as { first_name: string; last_name: string } | null;
      previousResidentId = existingProfile.resident_id;
      previousResidentName = prevResident ? `${prevResident.first_name} ${prevResident.last_name}` : 'Unknown';

      if (!forceRelink) {
        return {
          success: false,
          error: `This account is already linked to ${previousResidentName}. Use forceRelink to unlink and relink.`,
          previousResidentId,
          previousResidentName,
        };
      }
    }

    // 4. Check if the target resident is already linked to another account
    const { data: existingResidentLinks } = await adminClient
      .from('profiles')
      .select('id')
      .eq('resident_id', residentId);

    if ((existingResidentLinks ?? []).some((p) => p.id !== authUserId)) {
      return {
        success: false,
        error: 'This resident is already linked to a different account. Please unlink that account first.',
      };
    }

    // 5. Create or update profile
    const fullName = `${resident.first_name} ${resident.last_name}`;

    // Linking an account to a resident is an explicit administrative act, so it
    // also approves the account — otherwise it would stay pending and remain
    // locked out of everything, including the portal it was just linked to.
    // An account that already holds a role keeps it, so linking never demotes
    // an admin who also happens to live on the estate. A plain resident holds no
    // role (role_id null): the 'resident' role was retired by #825.
    if (existingProfile) {
      // Written with the service role: profiles carries no RLS policy allowing
      // an administrator to update another account's row, so this write through
      // the caller's own client matched zero rows and reported no error.
      // Permission is enforced by the authorizePermission() check above.
      const { data: updated, error: updateError } = await createAdminClient()
        .from('profiles')
        .update({
          resident_id: residentId,
          full_name: fullName,
          email: authUser.email,
          role_id: existingProfile.role_id ?? null,
          approval_status: 'active',
          approved_at: new Date().toISOString(),
          approved_by: auth.userId,
          rejection_reason: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUserId)
        .select('id');

      if (updateError) {
        console.error('Error updating profile:', updateError);
        return { success: false, error: 'Failed to link account' };
      }

      if (!updated || updated.length === 0) {
        console.error('Account link matched no rows for profile', authUserId);
        return { success: false, error: 'Failed to link account: the profile could not be updated' };
      }
    } else {
      // Create new profile. Normally unreachable — handle_new_user() provisions
      // a row for every auth user — but kept for accounts predating that trigger.
      const { error: insertError } = await createAdminClient().from('profiles').insert({
        id: authUserId,
        resident_id: residentId,
        full_name: fullName,
        email: authUser.email,
        role_id: null,
        approval_status: 'active',
        approved_at: new Date().toISOString(),
        approved_by: auth.userId,
      });

      if (insertError) {
        console.error('Error creating profile:', insertError);
        return { success: false, error: 'Failed to link account' };
      }
    }

    // 6. Update resident's profile_id for bidirectional link
    // On a relink, free the previous resident first so it does not keep pointing at
    // an account that now belongs to someone else.
    if (previousResidentId) {
      const { error: previousClearError } = await adminClient
        .from('residents')
        .update({ profile_id: null, updated_at: new Date().toISOString() })
        .eq('id', previousResidentId)
        .eq('profile_id', authUserId);

      if (previousClearError) {
        console.error('Error clearing previous resident profile_id:', previousClearError);
      }
    }

    const { error: residentUpdateError } = await adminClient
      .from('residents')
      .update({
        profile_id: authUserId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', residentId);

    if (residentUpdateError) {
      console.error('Error updating resident profile_id:', residentUpdateError);
      // Don't fail the whole operation - the primary link is established
      // but log the issue for debugging
    }

    // 7. Log audit
    await logAudit({
      action: 'ASSIGN',
      entityType: 'profiles',
      entityId: authUserId,
      entityDisplay: authUser.email || authUserId,
      oldValues: previousResidentId
        ? { resident_id: previousResidentId, resident_name: previousResidentName }
        : undefined,
      newValues: { resident_id: residentId, resident_name: fullName },
      description: previousResidentId
        ? `Relinked auth account from ${previousResidentName} to ${fullName}`
        : `Linked auth account to ${fullName}`,
    });

    return {
      success: true,
      previousResidentId,
      previousResidentName,
    };
  } catch (error) {
    console.error('Error linking account:', error);
    return { success: false, error: 'An error occurred while linking the account' };
  }
}

/**
 * Unlink an auth account from its resident.
 *
 * This removes the resident_id from the profile but keeps the profile intact.
 * Only accessible by users with SYSTEM_ASSIGN_ROLES permission.
 */
export async function unlinkAuthAccount(
  authUserId: string
): Promise<{ success: boolean; error?: string }> {
  // Check permissions
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: 'Unauthorized' };
  }

  const adminClient = createAdminClient();

  try {
    // Get current profile info for audit (service role: RLS hides other users' rows)
    const { data: profile } = await adminClient
      .from('profiles')
      .select(`
        id,
        email,
        resident_id,
        residents:resident_id (
          first_name,
          last_name
        )
      `)
      .eq('id', authUserId)
      .single();

    if (!profile) {
      return { success: false, error: 'Profile not found' };
    }

    if (!profile.resident_id) {
      return { success: false, error: 'Account is not linked to any resident' };
    }

    // Target guard (#826): unlinking changes the account as much as linking it
    // does, so it carries the same guard as linkAuthAccountToResident.
    const targetGuard = await assertCanManageTarget(auth.userId!, authUserId);
    if (!targetGuard.ok) {
      return { success: false, error: targetGuard.error };
    }

    // resident_id is a many-to-one FK, so the join is a single object (not an array)
    const resident = profile.residents as unknown as { first_name: string; last_name: string } | null;
    const residentName = resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown';

    // Remove resident link
    const { error: updateError } = await adminClient
      .from('profiles')
      .update({
        resident_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', authUserId);

    if (updateError) {
      console.error('Error unlinking account:', updateError);
      return { success: false, error: 'Failed to unlink account' };
    }

    // Also clear resident's profile_id for bidirectional unlink
    const { error: residentUpdateError } = await adminClient
      .from('residents')
      .update({
        profile_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.resident_id);

    if (residentUpdateError) {
      console.error('Error clearing resident profile_id:', residentUpdateError);
      // Don't fail - primary unlink is complete
    }

    // Log audit
    await logAudit({
      action: 'UNASSIGN',
      entityType: 'profiles',
      entityId: authUserId,
      entityDisplay: profile.email || authUserId,
      oldValues: { resident_id: profile.resident_id },
      newValues: { resident_id: null },
      description: `Unlinked auth account from ${residentName}`,
    });

    return { success: true };
  } catch (error) {
    console.error('Error unlinking account:', error);
    return { success: false, error: 'An error occurred while unlinking the account' };
  }
}
