'use server';

import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
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
  const adminClient = createAdminClient();
  const supabase = await createServerSupabaseClient();

  try {
    // Get all auth users
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();

    if (authError) {
      console.error('Error listing auth users:', authError);
      return { accounts: [], error: 'Failed to search accounts' };
    }

    // Filter by email (case-insensitive partial match)
    const matchingUsers = authUsers.users.filter(
      (u) => u.email?.toLowerCase().includes(searchTerm)
    );

    // Get profile information for these users (to find linked residents)
    const userIds = matchingUsers.map((u) => u.id);

    const { data: profiles } = await supabase
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
      // The join returns an array, but there's only one resident per profile
      const residentsArray = profile.residents as Array<{ first_name: string; last_name: string }> | null;
      const resident = residentsArray?.[0] ?? null;
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

  const adminClient = createAdminClient();
  const supabase = await createServerSupabaseClient();

  try {
    // Get all auth users
    const { data: authUsers, error: authError } = await adminClient.auth.admin.listUsers();

    if (authError) {
      console.error('Error listing auth users:', authError);
      return { accounts: [], error: 'Failed to fetch accounts' };
    }

    // Get all profiles with resident links
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, resident_id')
      .not('resident_id', 'is', null);

    // Build set of linked user IDs
    const linkedUserIds = new Set((profiles || []).map((p) => p.id));

    // Filter to orphaned accounts (have profile but no resident_id, or no profile at all)
    const { data: allProfiles } = await supabase.from('profiles').select('id');
    const profileUserIds = new Set((allProfiles || []).map((p) => p.id));

    const orphanedAccounts: OrphanedAuthAccount[] = authUsers.users
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
      }))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return { accounts: orphanedAccounts };
  } catch (error) {
    console.error('Error fetching orphaned accounts:', error);
    return { accounts: [], error: 'An error occurred while fetching orphaned accounts' };
  }
}

const linkAccountSchema = z.object({
  authUserId: z.string().uuid('Invalid auth user ID'),
  residentId: z.string().uuid('Invalid resident ID'),
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

  const adminClient = createAdminClient();
  const supabase = await createServerSupabaseClient();

  try {
    // 1. Verify auth user exists
    const { data: authUserData, error: authUserError } = await adminClient.auth.admin.getUserById(authUserId);
    if (authUserError || !authUserData.user) {
      return { success: false, error: 'Auth account not found' };
    }

    const authUser = authUserData.user;

    // 2. Verify resident exists
    const { data: resident, error: residentError } = await supabase
      .from('residents')
      .select('id, first_name, last_name, email')
      .eq('id', residentId)
      .single();

    if (residentError || !resident) {
      return { success: false, error: 'Resident not found' };
    }

    // 3. Check if there's already a profile for this auth user
    const { data: existingProfile } = await supabase
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
      .eq('id', authUserId)
      .single();

    let previousResidentId: string | undefined;
    let previousResidentName: string | undefined;

    if (existingProfile?.resident_id) {
      // Account is already linked to a resident
      if (existingProfile.resident_id === residentId) {
        return { success: false, error: 'This account is already linked to this resident' };
      }

      // The join returns an array, but there's only one resident per profile
      const prevResidentsArray = existingProfile.residents as Array<{ first_name: string; last_name: string }> | null;
      const prevResident = prevResidentsArray?.[0] ?? null;
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
    const { data: existingResidentLink } = await supabase
      .from('profiles')
      .select('id')
      .eq('resident_id', residentId)
      .single();

    if (existingResidentLink && existingResidentLink.id !== authUserId) {
      return {
        success: false,
        error: 'This resident is already linked to a different account. Please unlink that account first.',
      };
    }

    // 5. Create or update profile
    const fullName = `${resident.first_name} ${resident.last_name}`;

    if (existingProfile) {
      // Update existing profile
      const { error: updateError } = await supabase
        .from('profiles')
        .update({
          resident_id: residentId,
          full_name: fullName,
          email: authUser.email,
          updated_at: new Date().toISOString(),
        })
        .eq('id', authUserId);

      if (updateError) {
        console.error('Error updating profile:', updateError);
        return { success: false, error: 'Failed to link account' };
      }
    } else {
      // Create new profile
      const { error: insertError } = await supabase.from('profiles').insert({
        id: authUserId,
        resident_id: residentId,
        full_name: fullName,
        email: authUser.email,
        role: 'security_officer', // Default role
      });

      if (insertError) {
        console.error('Error creating profile:', insertError);
        return { success: false, error: 'Failed to link account' };
      }
    }

    // 6. Update resident's profile_id for bidirectional link
    const { error: residentUpdateError } = await supabase
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
      oldValues: previousResidentId ? { resident_id: previousResidentId } : undefined,
      newValues: { resident_id: residentId },
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

  const supabase = await createServerSupabaseClient();

  try {
    // Get current profile info for audit
    const { data: profile } = await supabase
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

    // The join returns an array, but there's only one resident per profile
    const residentsArray = profile.residents as Array<{ first_name: string; last_name: string }> | null;
    const resident = residentsArray?.[0] ?? null;
    const residentName = resident ? `${resident.first_name} ${resident.last_name}` : 'Unknown';

    // Remove resident link
    const { error: updateError } = await supabase
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
    const { error: residentUpdateError } = await supabase
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
