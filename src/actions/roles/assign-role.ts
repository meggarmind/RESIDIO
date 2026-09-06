'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { isLastActiveSuperAdmin, LAST_SUPER_ADMIN_ERROR } from '@/lib/auth/super-admin-invariant';
import { sanitizeSearchInput } from '@/lib/utils';
import type { ProfileApprovalStatus } from '@/types/database';

// =====================================================
// Types
// =====================================================

export type ResidentSearchResult = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone_primary: string | null;
  house_address: string | null;
  profile_id: string | null;
  current_role_id: string | null;
  current_role_name: string | null;
  current_role_display_name: string | null;
};

// =====================================================
// Search Residents for Role Assignment
// =====================================================

/**
 * Search residents by name or email for role assignment
 * Returns residents with their current role information
 */
export async function searchResidentsForRoleAssignment(
  query: string
): Promise<{
  data?: ResidentSearchResult[];
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  if (!query || query.length < 2) {
    return { data: [] };
  }

  const supabase = await createServerSupabaseClient();
  const searchPattern = `%${sanitizeSearchInput(query)}%`;

  // Search residents by name or email
  // Join with resident_houses to get house information (many-to-many relationship)
  const { data: residents, error } = await supabase
    .from('residents')
    .select(`
      id,
      first_name,
      last_name,
      email,
      phone_primary,
      profile_id,
      resident_houses!resident_houses_resident_id_fkey (
        is_primary,
        is_active,
        houses (
          house_number,
          streets (
            name
          )
        )
      )
    `)
    .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern}`)
    .limit(20);

  if (error) {
    console.error('Error searching residents:', error);
    return { error: 'Failed to search residents' };
  }

  // Get profile IDs to fetch role information
  const profileIds = residents
    ?.filter(r => r.profile_id)
    .map(r => r.profile_id) || [];

  // Fetch profiles with roles if any have linked profiles
  const profileRoles: Map<string, { role_id: string | null; role_name: string | null; role_display_name: string | null }> = new Map();

  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, role_id')
      .in('id', profileIds);

    // Get role information
    if (profiles && profiles.length > 0) {
      const roleIds = profiles
        .filter(p => p.role_id)
        .map(p => p.role_id) as string[];

      if (roleIds.length > 0) {
        const { data: roles } = await supabase
          .from('app_roles')
          .select('id, name, display_name')
          .in('id', roleIds);

        const roleMap = new Map(roles?.map(r => [r.id, r]) || []);

        profiles.forEach(profile => {
          const role = profile.role_id ? roleMap.get(profile.role_id) : null;
          profileRoles.set(profile.id, {
            role_id: profile.role_id,
            role_name: role?.name || null,
            role_display_name: role?.display_name || null,
          });
        });
      }
    }
  }

  // Map results
  const results: ResidentSearchResult[] = (residents || []).map(resident => {
    // resident_houses is an array (many-to-many), get the primary or first active house
    type ResidentHouseJoin = {
      is_primary: boolean | null;
      is_active: boolean;
      houses: { house_number: string; streets: { name: string } | null } | null;
    };

    const residentHouses = resident.resident_houses as unknown as ResidentHouseJoin[];
    // Prefer primary house, otherwise use first active house
    const primaryHouse = residentHouses?.find(rh => rh.is_primary && rh.is_active)
      || residentHouses?.find(rh => rh.is_active)
      || residentHouses?.[0];

    const house = primaryHouse?.houses;
    const houseAddress = house
      ? `${house.house_number}${house.streets?.name ? `, ${house.streets.name}` : ''}`
      : null;

    const profileRole = resident.profile_id
      ? profileRoles.get(resident.profile_id)
      : null;

    return {
      id: resident.id,
      first_name: resident.first_name,
      last_name: resident.last_name,
      email: resident.email,
      phone_primary: resident.phone_primary,
      house_address: houseAddress,
      profile_id: resident.profile_id,
      current_role_id: profileRole?.role_id || null,
      current_role_name: profileRole?.role_name || null,
      current_role_display_name: profileRole?.role_display_name || null,
    };
  });

  return { data: results };
}


// =====================================================
// Search Profiles for Role Assignment
// =====================================================

export type ProfileSearchResult = {
  profile_id: string;
  email: string;
  full_name: string;
  approval_status: ProfileApprovalStatus;
  resident_id: string | null;
  current_role_id: string | null;
  current_role_name: string | null;
  current_role_display_name: string | null;
};

/**
 * Search accounts by email or name for role assignment.
 *
 * The account-centric counterpart to searchResidentsForRoleAssignment. That one
 * can only reach people who exist as a resident on an estate property, so staff
 * who only have a login — a hired security officer, a treasurer, anyone signed
 * in with Google but not living on the estate — were invisible to the role
 * assignment UI and could not be given any role at all.
 */
export async function searchProfilesForRoleAssignment(
  query: string
): Promise<{
  data?: ProfileSearchResult[];
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { error: auth.error || 'Unauthorized' };
  }

  if (!query || query.length < 2) {
    return { data: [] };
  }

  const supabase = await createServerSupabaseClient();
  const searchPattern = `%${sanitizeSearchInput(query)}%`;

  const { data: profiles, error } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      full_name,
      approval_status,
      resident_id,
      role_id,
      app_roles!profiles_role_id_fkey (name, display_name)
    `)
    .or(`email.ilike.${searchPattern},full_name.ilike.${searchPattern}`)
    .limit(20);

  if (error) {
    console.error('Error searching profiles:', error);
    return { error: 'Failed to search accounts' };
  }

  const results: ProfileSearchResult[] = (profiles || []).map((profile) => {
    const role = Array.isArray(profile.app_roles) ? profile.app_roles[0] : profile.app_roles;

    return {
      profile_id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      approval_status: profile.approval_status,
      resident_id: profile.resident_id,
      current_role_id: profile.role_id,
      current_role_name: role?.name ?? null,
      current_role_display_name: role?.display_name ?? null,
    };
  });

  return { data: results };
}

// =====================================================
// Assign Role to a Profile (primitive)
// =====================================================

/*
 * LEGACY_ROLE_MAP used to live here, and both actions below used it to mirror
 * every role assignment into the legacy `profiles.role` column.
 *
 * #193 -- this slice, not #194, which is what the tracker says -- deleted it,
 * and with it the `role: legacyRole` / `role: null` writes and the `role` field
 * in the audit oldValues/newValues. #194's remaining scope on this file is
 * therefore smaller than its issue body describes.
 *
 * It is safe because nothing reads the column by the time #193's migration
 * applies: every application reader is retargeted in the same change, and the
 * last four policy readers (ai_settings, ai_conversation_logs,
 * report_schedules, generated_reports) are dropped by #214, whose migration is
 * timestamped 20260906020000 and so applies first. The column that remains is
 * literally named role_deprecated_do_not_use; writing to it would be absurd.
 */

/**
 * Assign a role directly to an account.
 *
 * This is the primitive; assignRoleToResident wraps it. Works for any profile,
 * whether or not it is linked to a resident record.
 */
export async function assignRoleToProfile(
  profileId: string,
  roleId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role_id')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  const { data: role, error: roleError } = await supabase
    .from('app_roles')
    .select('id, name, display_name, is_active')
    .eq('id', roleId)
    .single();

  if (roleError || !role) {
    return { success: false, error: 'Role not found' };
  }

  if (!role.is_active) {
    return { success: false, error: 'Cannot assign an inactive role' };
  }

  // Escalation guards: the two highest roles may only be granted by a super
  // admin. This is the real enforcement — the UI merely mirrors it.
  if (role.name === 'super_admin' && auth.roleName !== 'super_admin') {
    return { success: false, error: 'Only Super Administrator can assign the Super Administrator role' };
  }

  if (role.name === 'chairman' && auth.roleName !== 'super_admin') {
    return { success: false, error: 'Only Super Administrator can assign the Chairman role' };
  }

  // Bootstrap invariant (#184): moving the last active super_admin onto another
  // role would leave the estate with no administrator. The database trigger
  // refuses this write regardless; the check is here so the administrator sees
  // why rather than a Postgres exception.
  if (role.name !== 'super_admin' && (await isLastActiveSuperAdmin(profileId))) {
    return { success: false, error: LAST_SUPER_ADMIN_ERROR };
  }

  // Written with the service role deliberately. profiles has no RLS policy
  // letting an administrator update anyone else's row, so this write through the
  // caller's own client matched zero rows and returned no error — the action
  // reported success while nothing changed.
  //
  // The service role is the right tool rather than a new RLS policy: the
  // escalation guards above (super_admin and chairman may only be granted by a
  // super_admin) live in this function, and a policy permissive enough to allow
  // this write would also let any assign_roles holder set their own role_id
  // straight through PostgREST, bypassing them.
  //
  // .select() makes a zero-row write impossible to mistake for success again.
  const { data: updated, error: updateError } = await createAdminClient()
    .from('profiles')
    .update({
      role_id: roleId,
    })
    .eq('id', profileId)
    .select('id');

  if (updateError) {
    console.error('Error updating role:', updateError);
    return { success: false, error: 'Failed to assign role' };
  }

  if (!updated || updated.length === 0) {
    console.error('Role assignment matched no rows for profile', profileId);
    return { success: false, error: 'Failed to assign role: the account could not be updated' };
  }

  await logAudit({
    action: 'ASSIGN',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: profile.full_name || profile.email,
    oldValues: { role_id: profile.role_id },
    newValues: { role_id: roleId, role_name: role.display_name },
  });

  return { success: true };
}

/**
 * Revoke a role from an account.
 *
 * A resident-linked account drops to the base 'resident' role so the portal
 * keeps working. An account with no resident link has no floor to drop to, so
 * it loses its role entirely and returns to pending — leaving it role-less but
 * active would give it a dashboard with nothing on it.
 */
export async function removeRoleFromProfile(
  profileId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role_id, resident_id, approval_status')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  if (profile.role_id) {
    const { data: currentRole } = await supabase
      .from('app_roles')
      .select('name')
      .eq('id', profile.role_id)
      .single();

    if (currentRole?.name === 'chairman' && auth.roleName !== 'super_admin') {
      return { success: false, error: 'Only Super Administrator can remove the Chairman role' };
    }
    if (currentRole?.name === 'super_admin') {
      return { success: false, error: 'Cannot remove the Super Administrator role' };
    }
  }

  let newRoleId: string | null = null;
  let newRoleLabel = 'None';
  let newStatus = profile.approval_status;

  if (profile.resident_id) {
    const { data: residentRole } = await supabase
      .from('app_roles')
      .select('id')
      .eq('name', 'resident')
      .single();

    if (!residentRole) {
      return { success: false, error: 'Base resident role not found' };
    }

    newRoleId = residentRole.id;
    newRoleLabel = 'Resident';
  } else {
    newStatus = 'pending';
  }

  // Service role for the same reason as assignRoleToProfile above.
  const { data: updated, error: updateError } = await createAdminClient()
    .from('profiles')
    .update({
      role_id: newRoleId,
      approval_status: newStatus,
    })
    .eq('id', profileId)
    .select('id');

  if (updateError) {
    console.error('Error removing role:', updateError);
    return { success: false, error: 'Failed to remove role' };
  }

  if (!updated || updated.length === 0) {
    console.error('Role removal matched no rows for profile', profileId);
    return { success: false, error: 'Failed to remove role: the account could not be updated' };
  }

  await logAudit({
    action: 'UNASSIGN',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: profile.full_name || profile.email,
    oldValues: { role_id: profile.role_id, approval_status: profile.approval_status },
    newValues: { role_id: newRoleId, role_name: newRoleLabel, approval_status: newStatus },
  });

  return { success: true };
}

// =====================================================
// Resident-scoped wrappers
// =====================================================

/**
 * Assign a role to the account linked to a resident.
 *
 * Thin wrapper over assignRoleToProfile; kept because the resident-centric
 * search is still the primary way admins find people who live on the estate.
 */
export async function assignRoleToResident(
  residentId: string,
  roleId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const profileId = await resolveResidentProfileId(residentId);
  if ('error' in profileId) {
    return { success: false, error: profileId.error };
  }

  return assignRoleToProfile(profileId.profileId, roleId);
}

/**
 * Remove the role from the account linked to a resident.
 */
export async function removeRoleFromResident(
  residentId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const profileId = await resolveResidentProfileId(residentId);
  if ('error' in profileId) {
    return { success: false, error: profileId.error };
  }

  return removeRoleFromProfile(profileId.profileId);
}

/**
 * Resolve a resident to the profile its role actually lives on.
 *
 * Note that residents.profile_id and profiles.resident_id are two independent
 * links; this checks both so a resident linked from either direction resolves.
 */
async function resolveResidentProfileId(
  residentId: string
): Promise<{ profileId: string } | { error: string }> {
  const supabase = await createServerSupabaseClient();

  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, profile_id')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { error: 'Resident not found' };
  }

  if (resident.profile_id) {
    return { profileId: resident.profile_id };
  }

  const { data: linkedProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('resident_id', residentId)
    .maybeSingle();

  if (linkedProfile?.id) {
    return { profileId: linkedProfile.id };
  }

  return {
    error: 'This resident does not have an account. They must register and link their account first.',
  };
}
