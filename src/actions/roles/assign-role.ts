'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { sanitizeSearchInput } from '@/lib/utils';

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
  let profileRoles: Map<string, { role_id: string | null; role_name: string | null; role_display_name: string | null }> = new Map();

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
// Assign Role to Resident
// =====================================================

/**
 * Assign an admin role to a resident
 * If the resident has a linked profile, updates the profile's role_id
 * If no profile exists, this will fail (resident needs an account first)
 */
export async function assignRoleToResident(
  residentId: string,
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

  // Get resident info
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, profile_id')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, error: 'Resident not found' };
  }

  if (!resident.profile_id) {
    return {
      success: false,
      error: 'This resident does not have an account. They must register and link their account first.'
    };
  }

  // Get role info
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

  // Check if trying to assign super_admin (only super_admin can do this)
  if (role.name === 'super_admin' && auth.roleName !== 'super_admin') {
    return { success: false, error: 'Only Super Administrator can assign the Super Administrator role' };
  }

  // Check if trying to assign chairman (only super_admin can do this)
  if (role.name === 'chairman' && auth.roleName !== 'super_admin') {
    return { success: false, error: 'Only Super Administrator can assign the Chairman role' };
  }

  // Get old role for audit
  const { data: oldProfile } = await supabase
    .from('profiles')
    .select('role_id, role')
    .eq('id', resident.profile_id)
    .single();

  // Map app_role name to legacy role for backwards compatibility
  // The legacy 'role' field is still used by some components during migration
  const legacyRoleMap: Record<string, string | null> = {
    super_admin: 'admin',
    chairman: 'chairman',
    financial_officer: 'financial_secretary',
    security_officer: 'security_officer',
    // Other roles (vice_chairman, secretary, project_manager, resident) don't have legacy equivalents
  };
  const legacyRole = legacyRoleMap[role.name] || null;

  // Update the profile's role (both new RBAC role_id and legacy role field)
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      role_id: roleId,
      role: legacyRole,  // Sync legacy field for backwards compatibility
    })
    .eq('id', resident.profile_id);

  if (updateError) {
    console.error('Error updating role:', updateError);
    return { success: false, error: 'Failed to assign role' };
  }

  // Audit log
  await logAudit({
    action: 'ASSIGN',
    entityType: 'profiles',
    entityId: resident.profile_id,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    oldValues: { role_id: oldProfile?.role_id, role: oldProfile?.role },
    newValues: { role_id: roleId, role: legacyRole, role_name: role.display_name },
  });

  return { success: true };
}

// =====================================================
// Remove Role from Resident
// =====================================================

/**
 * Remove admin role from a resident (set back to base resident role)
 */
export async function removeRoleFromResident(
  residentId: string
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get resident info
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, profile_id')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, error: 'Resident not found' };
  }

  if (!resident.profile_id) {
    return { success: false, error: 'This resident does not have an account' };
  }

  // Get current role for permission check
  const { data: profile } = await supabase
    .from('profiles')
    .select('role_id, role')
    .eq('id', resident.profile_id)
    .single();

  if (profile?.role_id) {
    // Get the role being removed
    const { data: currentRole } = await supabase
      .from('app_roles')
      .select('name')
      .eq('id', profile.role_id)
      .single();

    // Only super_admin can remove chairman or super_admin roles
    if (currentRole?.name === 'chairman' && auth.roleName !== 'super_admin') {
      return { success: false, error: 'Only Super Administrator can remove the Chairman role' };
    }
    if (currentRole?.name === 'super_admin') {
      return { success: false, error: 'Cannot remove the Super Administrator role' };
    }
  }

  // Get the base resident role ID
  const { data: residentRole } = await supabase
    .from('app_roles')
    .select('id')
    .eq('name', 'resident')
    .single();

  if (!residentRole) {
    return { success: false, error: 'Base resident role not found' };
  }

  // Update the profile to have the base resident role
  // Also clear the legacy role field since 'resident' has no legacy equivalent
  const { error: updateError } = await supabase
    .from('profiles')
    .update({
      role_id: residentRole.id,
      role: null,  // Clear legacy field when removing admin role
    })
    .eq('id', resident.profile_id);

  if (updateError) {
    console.error('Error removing role:', updateError);
    return { success: false, error: 'Failed to remove role' };
  }

  // Audit log
  await logAudit({
    action: 'UNASSIGN',
    entityType: 'profiles',
    entityId: resident.profile_id,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    oldValues: { role_id: profile?.role_id, role: profile?.role },
    newValues: { role_id: residentRole.id, role: null, role_name: 'Resident' },
  });

  return { success: true };
}
