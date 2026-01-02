'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type {
  AppRole,
  AppPermission,
  AppRoleWithPermissions,
  AppRoleInsert,
  AppRoleUpdate,
} from '@/types/database';

// =====================================================
// Read Operations
// =====================================================

/**
 * Get all roles with their permissions
 */
export async function getRolesWithPermissions(): Promise<{
  success: boolean;
  data?: AppRoleWithPermissions[];
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get all roles
  const { data: roles, error: rolesError } = await supabase
    .from('app_roles')
    .select('*')
    .order('level', { ascending: true });

  if (rolesError) {
    return { success: false, error: rolesError.message };
  }

  // Get all permissions
  const { data: permissions } = await supabase
    .from('app_permissions')
    .select('*')
    .order('category', { ascending: true });

  // Get role-permission mappings
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('role_id, permission_id');

  // Build the result with permissions
  const rolesWithPermissions: AppRoleWithPermissions[] = (roles || []).map((role) => {
    const rolePermIds = rolePerms
      ?.filter((rp) => rp.role_id === role.id)
      .map((rp) => rp.permission_id) || [];

    const rolePermissions = permissions?.filter((p) =>
      rolePermIds.includes(p.id)
    ) || [];

    return {
      ...role,
      permissions: rolePermissions as AppPermission[],
    };
  });

  return { success: true, data: rolesWithPermissions };
}

/**
 * Get a single role with its permissions
 */
export async function getRoleById(roleId: string): Promise<{
  success: boolean;
  data?: AppRoleWithPermissions;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data: role, error: roleError } = await supabase
    .from('app_roles')
    .select('*')
    .eq('id', roleId)
    .single();

  if (roleError) {
    return { success: false, error: roleError.message };
  }

  // Get role's permissions via permission IDs
  const { data: rolePerms } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId);

  const permissionIds = rolePerms?.map((rp) => rp.permission_id) || [];

  let permissions: AppPermission[] = [];
  if (permissionIds.length > 0) {
    const { data: permsData } = await supabase
      .from('app_permissions')
      .select('*')
      .in('id', permissionIds);
    permissions = (permsData || []) as AppPermission[];
  }

  return {
    success: true,
    data: {
      ...role,
      permissions,
    } as AppRoleWithPermissions,
  };
}

/**
 * Get all available permissions
 */
export async function getAllPermissions(): Promise<{
  success: boolean;
  data?: AppPermission[];
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('app_permissions')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true })
    .order('name', { ascending: true });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, data: data as AppPermission[] };
}

// =====================================================
// Write Operations
// =====================================================

/**
 * Create a new role
 */
export async function createRole(roleData: AppRoleInsert): Promise<{
  success: boolean;
  data?: AppRole;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('app_roles')
    .insert({
      ...roleData,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'app_roles',
    entityId: data.id,
    entityDisplay: data.display_name,
    newValues: data,
  });

  return { success: true, data: data as AppRole };
}

/**
 * Update an existing role
 */
export async function updateRole(
  roleId: string,
  roleData: AppRoleUpdate
): Promise<{
  success: boolean;
  data?: AppRole;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get old values for audit
  const { data: oldRole } = await supabase
    .from('app_roles')
    .select('*')
    .eq('id', roleId)
    .single();

  // Check if it's a system role
  if (oldRole?.is_system_role) {
    // System roles can only have limited fields updated
    const allowedFields = ['display_name', 'description', 'is_active'];
    const updateData: Record<string, unknown> = {};
    for (const key of allowedFields) {
      if (key in roleData) {
        updateData[key] = roleData[key as keyof AppRoleUpdate];
      }
    }
    roleData = updateData as AppRoleUpdate;
  }

  const { data, error } = await supabase
    .from('app_roles')
    .update(roleData)
    .eq('id', roleId)
    .select()
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'app_roles',
    entityId: data.id,
    entityDisplay: data.display_name,
    oldValues: oldRole,
    newValues: data,
  });

  return { success: true, data: data as AppRole };
}

/**
 * Delete a role (only non-system roles)
 */
export async function deleteRole(roleId: string): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Check if it's a system role
  const { data: role } = await supabase
    .from('app_roles')
    .select('*')
    .eq('id', roleId)
    .single();

  if (role?.is_system_role) {
    return { success: false, error: 'Cannot delete system roles' };
  }

  // Check if any users have this role
  const { count } = await supabase
    .from('profiles')
    .select('*', { count: 'exact', head: true })
    .eq('role_id', roleId);

  if (count && count > 0) {
    return {
      success: false,
      error: `Cannot delete role: ${count} user(s) are assigned to this role`,
    };
  }

  const { error } = await supabase
    .from('app_roles')
    .delete()
    .eq('id', roleId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'app_roles',
    entityId: roleId,
    entityDisplay: role?.display_name || 'Unknown',
    oldValues: role,
  });

  return { success: true };
}

// =====================================================
// Permission Assignment Operations
// =====================================================

/**
 * Update permissions for a role
 */
export async function updateRolePermissions(
  roleId: string,
  permissionIds: string[]
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get role for audit
  const { data: role } = await supabase
    .from('app_roles')
    .select('display_name')
    .eq('id', roleId)
    .single();

  // Get old permissions
  const { data: oldPerms } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId);

  const oldPermIds = oldPerms?.map((p) => p.permission_id) || [];

  // Delete all existing permissions for this role
  const { error: deleteError } = await supabase
    .from('role_permissions')
    .delete()
    .eq('role_id', roleId);

  if (deleteError) {
    return { success: false, error: deleteError.message };
  }

  // Insert new permissions
  if (permissionIds.length > 0) {
    const { error: insertError } = await supabase
      .from('role_permissions')
      .insert(
        permissionIds.map((permId) => ({
          role_id: roleId,
          permission_id: permId,
          created_by: auth.userId,
        }))
      );

    if (insertError) {
      return { success: false, error: insertError.message };
    }
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'role_permissions',
    entityId: roleId,
    entityDisplay: `Permissions for ${role?.display_name || 'role'}`,
    oldValues: { permissionIds: oldPermIds },
    newValues: { permissionIds },
  });

  return { success: true };
}

// =====================================================
// User Role Assignment
// =====================================================

/**
 * Assign a role to a user
 */
export async function assignRoleToUser(
  userId: string,
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

  // Check role assignment rules
  const { checkRoleAssignmentAllowed } = await import('./assignment-rules');
  const ruleCheck = await checkRoleAssignmentAllowed(userId, roleId);
  if (!ruleCheck.allowed) {
    return {
      success: false,
      error: ruleCheck.reason || 'Role assignment not allowed for this user type',
    };
  }

  // Get role info to check if it requires verification
  const { data: targetRole } = await supabase
    .from('app_roles')
    .select('name')
    .eq('id', roleId)
    .single();

  // For the "resident" role, verify the user's linked resident is verified
  if (targetRole?.name === 'resident') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('resident_id')
      .eq('id', userId)
      .single();

    if (profile?.resident_id) {
      const { isResidentVerified } = await import('../residents/verify-resident');
      const verificationCheck = await isResidentVerified(profile.resident_id);

      if (!verificationCheck.isVerified) {
        return {
          success: false,
          error: `Cannot assign "Resident" role: the linked resident must be verified first (current status: ${verificationCheck.status || 'unknown'})`,
        };
      }
    }
  }

  // Get old role for audit
  const { data: oldProfile } = await supabase
    .from('profiles')
    .select('role_id, full_name')
    .eq('id', userId)
    .single();

  // Get new role info
  const { data: newRole } = await supabase
    .from('app_roles')
    .select('name, display_name')
    .eq('id', roleId)
    .single();

  // Update user's role
  const { error } = await supabase
    .from('profiles')
    .update({ role_id: roleId })
    .eq('id', userId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'ASSIGN',
    entityType: 'profiles',
    entityId: userId,
    entityDisplay: oldProfile?.full_name || 'User',
    oldValues: { role_id: oldProfile?.role_id },
    newValues: { role_id: roleId, role_name: newRole?.display_name },
  });

  return { success: true };
}

/**
 * Get all users with admin roles (excluding base 'resident' role)
 * Used to display the current admins list
 */
export async function getCurrentAdmins(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    profile_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    house_address: string | null;
    role_id: string;
    role_name: string;
    role_display_name: string;
    role_level: number;
  }>;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get profiles with non-resident roles, joined with residents and roles
  const { data, error } = await supabase
    .from('profiles')
    .select(`
      id,
      role_id,
      resident_id,
      residents:resident_id (
        id,
        first_name,
        last_name,
        email,
        resident_houses!resident_houses_resident_id_fkey (
          is_active,
          is_primary,
          houses (
            house_number,
            streets (name)
          )
        )
      ),
      app_roles:role_id (
        id,
        name,
        display_name,
        level
      )
    `)
    .not('role_id', 'is', null);

  if (error) {
    console.error('Error fetching current admins:', error);
    return { success: false, error: error.message };
  }

  // Filter to only include non-resident roles and map to clean format
  const admins = (data || [])
    .filter((profile) => {
      // app_roles is a single object (not array) due to role_id FK
      const role = profile.app_roles as unknown as { name: string } | null;
      return role && role.name !== 'resident';
    })
    .map((profile) => {
      // residents is a single object (not array) due to resident_id FK
      const resident = profile.residents as unknown as {
        id: string;
        first_name: string;
        last_name: string;
        email: string | null;
        resident_houses: Array<{
          is_active: boolean;
          is_primary: boolean | null;
          houses: { house_number: string; streets: { name: string } | null } | null;
        }>;
      } | null;

      const role = profile.app_roles as unknown as {
        id: string;
        name: string;
        display_name: string;
        level: number;
      };

      // Get primary or first active house
      const houses = resident?.resident_houses || [];
      const primaryHouse = houses.find((h) => h.is_primary && h.is_active)
        || houses.find((h) => h.is_active)
        || houses[0];
      const house = primaryHouse?.houses;
      const houseAddress = house
        ? `${house.house_number}${house.streets?.name ? `, ${house.streets.name}` : ''}`
        : null;

      return {
        id: resident?.id || profile.id,
        profile_id: profile.id,
        first_name: resident?.first_name || 'Unknown',
        last_name: resident?.last_name || 'User',
        email: resident?.email || null,
        house_address: houseAddress,
        role_id: role.id,
        role_name: role.name,
        role_display_name: role.display_name,
        role_level: role.level,
      };
    })
    .sort((a, b) => a.role_level - b.role_level); // Sort by role level (highest first)

  return { success: true, data: admins };
}

/**
 * Get users with their roles (for role management UI)
 */
export async function getUsersWithRoles(): Promise<{
  success: boolean;
  data?: Array<{
    id: string;
    email: string;
    full_name: string;
    role_id: string | null;
    role_name: string | null;
    role_display_name: string | null;
  }>;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // First get all profiles
  const { data: profiles, error: profilesError } = await supabase
    .from('profiles')
    .select('id, email, full_name, role_id')
    .order('full_name', { ascending: true });

  if (profilesError) {
    return { success: false, error: profilesError.message };
  }

  // Get all roles for lookup
  const { data: roles } = await supabase
    .from('app_roles')
    .select('id, name, display_name');

  const roleMap = new Map(
    roles?.map((r) => [r.id, { name: r.name, display_name: r.display_name }]) || []
  );

  const users = profiles?.map((user) => {
    const appRole = user.role_id ? roleMap.get(user.role_id) : null;
    return {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role_id: user.role_id,
      role_name: appRole?.name || null,
      role_display_name: appRole?.display_name || null,
    };
  });

  return { success: true, data: users };
}
