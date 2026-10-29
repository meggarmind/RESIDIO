'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { isLastActiveSuperAdmin, LAST_SUPER_ADMIN_ERROR } from '@/lib/auth/super-admin-invariant';
import { assertCanGrantRoles, assertCanManageTarget } from '@/lib/auth/account-guards';
import { roleWriteBlock } from '@/lib/auth/role-write-access';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
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
    .order('display_name', { ascending: true });

  if (rolesError) {
    return { success: false, error: rolesError.message };
  }

  // Active permissions only, so a role's privilege count matches what the picker
  // (getAllPermissions) shows and can change (#1318). Inactive grants stay stored.
  const { data: permissions, error: permissionsError } = await supabase
    .from('app_permissions')
    .select('*')
    .eq('is_active', true)
    .order('category', { ascending: true });

  if (permissionsError) {
    return { success: false, error: permissionsError.message };
  }

  // Role-permission mappings, paged: one read is capped at max_rows (#1318).
  const rolePermsResult = await fetchAllRows<{ role_id: string; permission_id: string }>((from, to) =>
    supabase
      .from('role_permissions')
      .select('role_id, permission_id')
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (rolePermsResult.error !== null) {
    return { success: false, error: rolePermsResult.error };
  }
  const rolePerms = rolePermsResult.data;

  // Holders per role, so the delete dialog can say who would be affected (#788).
  // A head count per role, the same query deleteRole uses: loading the rows would be capped by max_rows.
  // Service role (#1318): profiles is under RLS, and a caller without
  // system.view_all_profiles would count only their own row. The caller is authorised above.
  const admin = createAdminClient();
  const holderCounts = new Map<string, number | null>(
    await Promise.all(
      (roles || []).map(async (role) => {
        const { count, error } = await admin
          .from('profiles')
          .select('id', { count: 'exact', head: true })
          .eq('role_id', role.id);
        if (error) console.error('[getRolesWithPermissions] Could not count role holders:', error);
        return [role.id, error ? null : count] as const;
      })
    )
  );

  // Build the result with permissions
  const rolesWithPermissions: AppRoleWithPermissions[] = (roles || []).map((role) => {
    const rolePermIds = new Set(
      rolePerms.filter((rp) => rp.role_id === role.id).map((rp) => rp.permission_id)
    );

    const rolePermissions = (permissions ?? []).filter((p) => rolePermIds.has(p.id));

    return {
      ...role,
      permissions: rolePermissions as AppPermission[],
      user_count: holderCounts.get(role.id) ?? null,
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
 * Permission-escalation rule (#503), shared by createRoleWithPermissions and
 * updateRolePermissions: only a super_admin may put a permission on a role that
 * the caller does not hold themselves; anyone else may grant only a subset of
 * their own permissions. Otherwise a manage_roles holder could mint or edit a
 * role carrying permissions they lack and then (with assign_roles) hand it out.
 * An id that resolves to no permission is refused, and so is a failed lookup.
 * Returns an error message, or null when the grant is allowed.
 */
async function assertCallerMayGrantPermissions(
  auth: { roleName: string | null; permissions?: string[] },
  permissionIds: string[]
): Promise<string | null> {
  if (permissionIds.length === 0 || auth.roleName === 'super_admin') return null;

  const supabase = await createServerSupabaseClient();
  const { data: requested, error: lookupError } = await supabase
    .from('app_permissions')
    .select('id, name')
    .in('id', permissionIds);

  if (lookupError) {
    console.error('[roles] Could not resolve permissions for the grant check:', lookupError);
    return 'Could not verify the requested permissions';
  }

  const held = new Set(auth.permissions ?? []);
  const byId = new Map((requested ?? []).map((p) => [p.id, p.name]));
  const notAllowed = permissionIds.some((id) => {
    const permName = byId.get(id);
    return !permName || !held.has(permName);
  });

  return notAllowed
    ? 'Only Super Administrator can grant permissions you do not hold yourself'
    : null;
}

/**
 * Permissions the super_admin role always keeps (#1318): without them nobody could
 * manage roles or assign the top roles, and only a super admin can fix that.
 */
const SUPER_ADMIN_KEPT_PERMISSIONS = [
  PERMISSIONS.SYSTEM_MANAGE_ROLES,
  PERMISSIONS.SYSTEM_ASSIGN_ROLES,
  PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES,
] as string[];

/** Values the role form offers; anything else is refused rather than stored. */
const ROLE_CATEGORIES = ['exco', 'bot', 'staff', 'resident'];

/**
 * Names no custom role may take, whatever the database says: the two top roles,
 * plus the legacy names the RLS policies were written against (#503), so a custom
 * role can never carry a name a policy might key on. System role names are added
 * at check time from the database.
 */
const RESERVED_ROLE_NAMES = [
  'super_admin',
  'chairman',
  'admin',
  'financial_secretary',
  'financial_officer',
  'vice_chairman',
  'secretary',
  // Retired by #825; still keyed on by isResidentRole(), so never a custom name.
  'resident',
];

/**
 * Canonical form of a role name for comparison and storage: NFKC (so fullwidth
 * and compatibility look-alikes fold to ASCII), with zero-width, other format and
 * control characters removed, then trimmed. Callers lower-case it to compare.
 */
function cleanRoleName(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.normalize('NFKC').replace(/[\p{Cf}\p{Cc}]/gu, '').trim();
}

/**
 * Shared name guard for createRole, createRoleWithPermissions (via createRole)
 * and updateRole. Returns the cleaned name to store, or an error. The reserved
 * set is the static list above plus every existing is_system_role name, read now;
 * a failed read refuses rather than allows.
 */
async function checkRoleName(
  raw: unknown
): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = cleanRoleName(raw);
  if (!name) {
    return { ok: false, error: 'Role name is required' };
  }

  const supabase = await createServerSupabaseClient();
  const { data: systemRoles, error } = await supabase
    .from('app_roles')
    .select('name')
    .eq('is_system_role', true);

  if (error) {
    console.error('[roles] Could not read system role names for the name guard:', error);
    return { ok: false, error: 'Could not verify the role name' };
  }

  const reserved = new Set([
    ...RESERVED_ROLE_NAMES,
    ...(systemRoles ?? []).map((r) => cleanRoleName(r.name).toLowerCase()),
  ]);
  if (reserved.has(name.toLowerCase())) {
    return { ok: false, error: 'That role name is reserved' };
  }

  return { ok: true, name };
}

/** Validates the category and flags a role form can send against what the form offers. */
function checkRoleFields(data: { category?: unknown; requires_resident?: unknown }): string | null {
  if (data.category !== undefined && !ROLE_CATEGORIES.includes(data.category as string)) {
    return 'Unknown role category';
  }
  if (data.requires_resident !== undefined && typeof data.requires_resident !== 'boolean') {
    return 'Resident only must be true or false';
  }
  return null;
}

const DISPLAY_NAME_MAX = 100;

/** The display name to store, trimmed, or an error (#1318): the form's check is not enough. */
function checkDisplayName(raw: unknown): { ok: true; value: string } | { ok: false; error: string } {
  const value = cleanRoleName(raw);
  if (!value) return { ok: false, error: 'Display name is required' };
  if (value.length > DISPLAY_NAME_MAX) {
    return { ok: false, error: `Display name must be ${DISPLAY_NAME_MAX} characters or fewer` };
  }
  return { ok: true, value };
}

/** A unique-key violation on app_roles reads as a clash, not a database error (#1318). */
function roleWriteErrorMessage(error: { code?: string; message: string }): string {
  return error.code === '23505' ? 'A role with that name already exists' : error.message;
}

/** requires_resident is not in the generated types yet; the form sends it with the rest. */
type RoleFormFields = { requires_resident?: boolean };

/**
 * Create a new role
 */
export async function createRole(roleData: AppRoleInsert & RoleFormFields): Promise<{
  success: boolean;
  data?: AppRole;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Name guard (#503): see checkRoleName. The cleaned name is what is stored.
  const nameCheck = await checkRoleName(roleData.name);
  if (!nameCheck.ok) {
    return { success: false, error: nameCheck.error };
  }
  const name = nameCheck.name;

  const fieldError = checkRoleFields(roleData);
  if (fieldError) {
    return { success: false, error: fieldError };
  }

  const displayName = checkDisplayName(roleData.display_name);
  if (!displayName.ok) {
    return { success: false, error: displayName.error };
  }

  const supabase = await createServerSupabaseClient();

  // Fields are copied explicitly rather than spread from the client payload, and
  // is_system_role is always false (#503): system roles are seeded by migration,
  // never minted through this action, whatever the client sent.
  const { data, error } = await supabase
    .from('app_roles')
    .insert({
      name,
      display_name: displayName.value,
      description: roleData.description,
      category: roleData.category,
      is_active: roleData.is_active,
      can_be_assigned_to_resident: roleData.can_be_assigned_to_resident,
      requires_resident: roleData.requires_resident,
      is_system_role: false,
      created_by: auth.userId,
    })
    .select()
    .single();

  if (error) {
    return { success: false, error: roleWriteErrorMessage(error) };
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
 * Create a role and grant it permissions in one step.
 *
 * Creating and granting used to be two separate journeys — a role was born with
 * nothing and an admin had to remember to open a second dialog — so roles
 * routinely sat unpermissioned and looked broken.
 *
 * There is no transaction across the two writes, so this compensates instead:
 * if the grant fails, the role just created is deleted rather than left behind
 * as an unpermissioned shell that the admin has to notice and clean up.
 */
export async function createRoleWithPermissions(
  roleData: AppRoleInsert & RoleFormFields,
  permissionIds: string[]
): Promise<{
  success: boolean;
  data?: AppRole;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Permission guard (#503): see assertCallerMayGrantPermissions. Checked before
  // anything is written, so a refusal leaves no role behind.
  const grantRefusal = await assertCallerMayGrantPermissions(auth, permissionIds);
  if (grantRefusal) {
    return { success: false, error: grantRefusal };
  }

  const created = await createRole(roleData);
  if (!created.success || !created.data) return created;

  if (permissionIds.length === 0) return created;

  const granted = await updateRolePermissions(created.data.id, permissionIds);
  if (granted.success) return created;

  // Roll back so a failed grant does not leave a role nobody asked for.
  const rolledBack = await deleteRole(created.data.id);

  return {
    success: false,
    error: rolledBack.success
      ? `Could not grant permissions, so the role was not created: ${granted.error}`
      : `The role "${created.data.display_name}" was created but its permissions could not be ` +
        `set (${granted.error}), and it could not be removed. Edit or delete it manually.`,
  };
}

/**
 * Update an existing role
 */
export async function updateRole(
  roleId: string,
  roleData: AppRoleUpdate & RoleFormFields
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

  // Rank guard (#475): super_admin and system roles are editable by a super
  // admin only. Without this a manage_roles holder could rewrite the roles that
  // sit above them. Own-role guard (#503), mirroring updateRolePermissions: only
  // a super admin may edit the role they themselves hold. The rule is shared with
  // the Roles tab buttons (roleWriteBlock, #1318).
  const block = roleWriteBlock(auth, oldRole);
  if (block === 'rank') {
    return { success: false, error: 'Only Super Administrator can edit system roles' };
  }
  if (block === 'own') {
    return { success: false, error: 'You cannot edit your own role' };
  }

  // The super_admin role stays active (#1318): its holders are the last line of administration.
  if (oldRole?.name === 'super_admin' && 'is_active' in roleData && roleData.is_active !== true) {
    return { success: false, error: 'The Super Administrator role is always active' };
  }

  if ('display_name' in roleData) {
    const displayName = checkDisplayName(roleData.display_name);
    if (!displayName.ok) {
      return { success: false, error: displayName.error };
    }
    roleData = { ...roleData, display_name: displayName.value };
  }

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
  } else {
    // Custom role (#503): same validation as createRole, and an explicit field
    // whitelist so the client payload can never write is_system_role, id,
    // created_by or anything else. A rename (not offered by the form) must pass
    // the shared name guard.
    const incoming = roleData as Record<string, unknown>;
    const fieldError = checkRoleFields(incoming);
    if (fieldError) {
      return { success: false, error: fieldError };
    }

    const clean: Record<string, unknown> = {};
    for (const key of [
      'display_name',
      'description',
      'category',
      'is_active',
      'can_be_assigned_to_resident',
      'requires_resident',
    ]) {
      if (key in incoming) clean[key] = incoming[key];
    }
    if ('name' in incoming) {
      const nameCheck = await checkRoleName(incoming.name);
      if (!nameCheck.ok) {
        return { success: false, error: nameCheck.error };
      }
      clean.name = nameCheck.name;
    }
    roleData = clean as AppRoleUpdate;
  }

  const { data, error } = await supabase
    .from('app_roles')
    .update(roleData)
    .eq('id', roleId)
    .select()
    .single();

  if (error) {
    return { success: false, error: roleWriteErrorMessage(error) };
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

  // Check if it's a system role. Fail closed (#1318): a role that cannot be read
  // is not deleted, rather than treated as a custom role.
  const { data: role, error: roleError } = await supabase
    .from('app_roles')
    .select('*')
    .eq('id', roleId)
    .single();

  if (roleError || !role) {
    if (roleError) console.error('[deleteRole] Could not read the role:', roleError);
    return { success: false, error: 'Could not read the role; role not deleted' };
  }

  if (role.is_system_role || role.name === 'super_admin') {
    return { success: false, error: 'Cannot delete system roles' };
  }

  // Check if any users have this role
  // Explicit column: `*` would include profiles.two_factor_secret_encrypted, which API
  // roles cannot read (#455). Fail closed: if the count cannot be established, do not delete.
  // Service role (#1318): through RLS a caller without system.view_all_profiles sees
  // only their own row, so a held role could count as empty and be deleted, which
  // clears every holder's role_id. The caller is authorised above.
  const { count, error: countError } = await createAdminClient()
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('role_id', roleId);

  if (countError || count === null) {
    console.error('[deleteRole] Could not count users assigned to role:', countError);
    return { success: false, error: 'Could not verify that no users hold this role; role not deleted' };
  }

  if (count > 0) {
    return {
      success: false,
      error: `Cannot delete role: ${count} user(s) are assigned to this role`,
    };
  }

  // Titles under the role (#1318). admin_titles and role_assignment_rules both
  // reference app_roles ON DELETE CASCADE, so the delete below removes them; a
  // title someone still holds is refused first rather than cleared silently.
  const { data: titles, error: titlesError } = await supabase
    .from('admin_titles')
    .select('id, name')
    .eq('role_id', roleId);

  if (titlesError) {
    console.error('[deleteRole] Could not read the role titles:', titlesError);
    return { success: false, error: 'Could not check the titles under this role; role not deleted' };
  }

  const titleIds = (titles ?? []).map((t) => t.id as string);
  if (titleIds.length > 0) {
    // Service role: profiles is under RLS, so the caller may not see every holder.
    // Every status counts, as in the seat rule in the database.
    const { count: titleHolders, error: titleHoldersError } = await createAdminClient()
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .in('title_id', titleIds);

    if (titleHoldersError || titleHolders === null) {
      console.error('[deleteRole] Could not count title holders:', titleHoldersError);
      return { success: false, error: 'Could not check who holds the titles under this role; role not deleted' };
    }
    if (titleHolders > 0) {
      return {
        success: false,
        error: `Cannot delete role: ${titleHolders} user(s) hold a title under this role. Move them first.`,
      };
    }
  }

  // .select() makes a delete that RLS filtered out show as zero rows (#1318).
  const { data: deletedRoles, error } = await supabase
    .from('app_roles')
    .delete()
    .eq('id', roleId)
    .select('id');

  if (error) {
    return { success: false, error: error.message };
  }
  if (!deletedRoles || deletedRoles.length === 0) {
    return { success: false, error: 'The role was not deleted' };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'app_roles',
    entityId: roleId,
    entityDisplay: role.display_name || 'Unknown',
    // The titles went with the role (ON DELETE CASCADE); recorded so they can be restored.
    oldValues: { ...role, admin_titles: titles ?? [] },
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
    .select('name, display_name, is_system_role')
    .eq('id', roleId)
    .single();

  // Rank guard (#475): only a super admin may change the permissions of
  // super_admin or any system role, or of the role they themselves hold --
  // otherwise a manage_roles holder can grant their own role anything.
  const block = roleWriteBlock(auth, role ? { id: roleId, ...role } : null);
  if (block === 'rank') {
    return { success: false, error: 'Only Super Administrator can edit permissions of system roles' };
  }
  if (block === 'own') {
    return { success: false, error: 'You cannot edit the permissions of your own role' };
  }

  // Get old permissions. A failed read refuses: the diff below depends on it.
  const { data: oldPerms, error: oldPermsError } = await supabase
    .from('role_permissions')
    .select('permission_id')
    .eq('role_id', roleId);

  if (oldPermsError) {
    return { success: false, error: oldPermsError.message };
  }

  const oldPermIds = (oldPerms ?? []).map((p) => p.permission_id as string);
  const oldSet = new Set(oldPermIds);
  const wanted = new Set(permissionIds);
  const added = Array.from(wanted).filter((id) => !oldSet.has(id));
  let removed = oldPermIds.filter((id) => !wanted.has(id));

  // Escalation guard (#503): only permissions being ADDED are checked; keeping or
  // removing a permission the caller does not hold stays allowed.
  const grantRefusal = await assertCallerMayGrantPermissions(auth, added);
  if (grantRefusal) {
    return { success: false, error: grantRefusal };
  }

  // Grants to inactive permissions are kept (#1318): the picker only lists active
  // permissions, so their absence from permissionIds is not a request to revoke.
  if (removed.length > 0) {
    const { data: inactive, error: inactiveError } = await supabase
      .from('app_permissions')
      .select('id')
      .in('id', removed)
      .eq('is_active', false);

    if (inactiveError) {
      return { success: false, error: 'Could not check which permissions are inactive. The changes were not saved.' };
    }
    const inactiveIds = new Set((inactive ?? []).map((p) => p.id as string));
    removed = removed.filter((id) => !inactiveIds.has(id));
  }

  // super_admin keeps the permissions that manage roles and assign them (#1318).
  if (role?.name === 'super_admin' && removed.length > 0) {
    const { data: removedPerms, error: removedPermsError } = await supabase
      .from('app_permissions')
      .select('id, name')
      .in('id', removed);

    if (removedPermsError) {
      return { success: false, error: 'Could not check the permissions being removed. The changes were not saved.' };
    }
    const kept = (removedPerms ?? [])
      .filter((p) => removed.includes(p.id as string))
      .map((p) => p.name as string)
      .filter((name) => SUPER_ADMIN_KEPT_PERMISSIONS.includes(name));
    if (kept.length > 0) {
      return {
        success: false,
        error: `The Super Administrator role must keep ${kept.join(', ')}. The changes were not saved.`,
      };
    }
  }

  // Nothing to write, so nothing to audit.
  if (added.length === 0 && removed.length === 0) {
    return { success: true };
  }

  // Add first, then remove (#1318). The old order (delete everything, then insert)
  // left the role with no permissions at all when the insert failed. An insert
  // failure now changes nothing; a removal failure leaves extra grants, never
  // fewer. ignoreDuplicates makes a concurrent grant of the same row harmless.
  if (added.length > 0) {
    const { error: insertError } = await supabase
      .from('role_permissions')
      .upsert(
        added.map((permId) => ({
          role_id: roleId,
          permission_id: permId,
          created_by: auth.userId,
        })),
        { onConflict: 'role_id,permission_id', ignoreDuplicates: true }
      );

    if (insertError) {
      return { success: false, error: `${insertError.message}. The changes were not saved.` };
    }
  }

  if (removed.length > 0) {
    // .select() is not decoration: without it an RLS policy that filters the rows
    // out returns success with zero rows deleted, and the revocation vanishes
    // silently. Comparing the deleted count against what we asked for is the only
    // way to notice.
    const { data: deleted, error: deleteError } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', roleId)
      .in('permission_id', removed)
      .select('permission_id');

    const removedCount = deleted?.length ?? 0;
    if (deleteError || removedCount !== removed.length) {
      if (added.length > 0 || removedCount > 0) {
        await logAudit({
          action: 'UPDATE',
          entityType: 'role_permissions',
          entityId: roleId,
          entityDisplay: `Permissions for ${role?.display_name || 'role'} (partly saved)`,
          oldValues: { permissionIds: oldPermIds },
          newValues: {
            added,
            removed: (deleted ?? []).map((d) => d.permission_id),
          },
        });
      }
      // Say exactly what was saved, as the audit entry above records it.
      const partly = added.length > 0 || removedCount > 0;
      return {
        success: false,
        error: partly
          ? `The changes were saved in part: ${added.length} added, ${removedCount} of ${removed.length} removed. ` +
            'Reopen the role and try again.'
          : 'Could not remove the role\'s permissions. The changes were not saved.',
      };
    }
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'role_permissions',
    entityId: roleId,
    entityDisplay: `Permissions for ${role?.display_name || 'role'}`,
    oldValues: { permissionIds: oldPermIds },
    newValues: { permissionIds: [...oldPermIds.filter((id) => !removed.includes(id)), ...added] },
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

  // Target guard (#475, #826): changing an account that holds super_admin or
  // chairman needs system.assign_board_roles.
  const targetGuard = await assertCanManageTarget(auth.userId!, userId);
  if (!targetGuard.ok) {
    return { success: false, error: targetGuard.error };
  }

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

  if (!targetRole) {
    return { success: false, error: 'Role not found' };
  }

  // Grant guard (#475, #826): same rule as assignRoleToProfile --
  // super_admin, chairman and trustee need system.assign_board_roles.
  const grantGuard = await assertCanGrantRoles(auth.userId!, [targetRole.name]);
  if (!grantGuard.ok) {
    return { success: false, error: grantGuard.error };
  }

  // Bootstrap invariant (#184). This is a second role-assignment path alongside
  // assignRoleToProfile(), and it can demote the last administrator just as
  // easily, so it carries the same check.
  if (targetRole?.name !== 'super_admin' && (await isLastActiveSuperAdmin(userId))) {
    return { success: false, error: LAST_SUPER_ADMIN_ERROR };
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

  // Service role: profiles has no RLS policy letting an administrator update
  // another account's row, so this write through the caller's client matched
  // zero rows and returned no error - the action reported success while the
  // role was never assigned. Permission is enforced by authorizePermission()
  // above; .select() makes a zero-row write detectable.
  const { data: updated, error } = await createAdminClient()
    .from('profiles')
    .update({ role_id: roleId })
    .eq('id', userId)
    .select('id');

  if (error) {
    return { success: false, error: error.message };
  }

  if (!updated || updated.length === 0) {
    return { success: false, error: 'Failed to assign role: the account could not be updated' };
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
 * Get all users with a role. A plain resident holds none (role_id null, #825).
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
    /** The linked resident, if any; a resident-only role cannot be given without one. */
    resident_id: string | null;
    role_id: string;
    role_name: string;
    role_display_name: string;
    title_id: string | null;
    title_name: string | null;
  }>;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Service role (#1318): profiles is under RLS, and an assign_roles holder without
  // system.view_all_profiles sees only their own row. The caller is authorised above.
  const admin = createAdminClient();

  // Get profiles holding a role, joined with residents and roles
  const { data, error } = await admin
    .from('profiles')
    .select(`
      id,
      email,
      full_name,
      role_id,
      title_id,
      resident_id,
      admin_titles:title_id (
        id,
        name
      ),
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
        display_name
      )
    `)
    .not('role_id', 'is', null);

  if (error) {
    console.error('Error fetching current admins:', error);
    return { success: false, error: error.message };
  }

  // Drop any row whose role join came back empty, and map to clean format
  const admins = (data || [])
    // app_roles is a single object (not array) due to role_id FK
    .filter((profile) => profile.app_roles != null)
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
      };

      const title = profile.admin_titles as unknown as { id: string; name: string } | null;

      // Get primary or first active house
      const houses = resident?.resident_houses || [];
      const primaryHouse = houses.find((h) => h.is_primary && h.is_active)
        || houses.find((h) => h.is_active)
        || houses[0];
      const house = primaryHouse?.houses;
      const houseAddress = house
        ? `${house.house_number}${house.streets?.name ? `, ${house.streets.name}` : ''}`
        : null;

      // Admin accounts are not always linked to a resident record — the super
      // admin and chairman usually are not — so fall back to the profile's own
      // name and email instead of rendering "Unknown User".
      const [profileFirstName = '', ...profileRestName] =
        (profile.full_name || '').trim().split(/\s+/);
      const profileLastName = profileRestName.join(' ');

      return {
        id: resident?.id || profile.id,
        profile_id: profile.id,
        first_name: resident?.first_name || profileFirstName || profile.email || 'Unknown',
        last_name: resident?.last_name || profileLastName || '',
        email: resident?.email || profile.email || null,
        house_address: houseAddress,
        resident_id: profile.resident_id ?? null,
        role_id: role.id,
        role_name: role.name,
        role_display_name: role.display_name,
        title_id: profile.title_id ?? null,
        title_name: title?.name ?? null,
      };
    })
    .sort(
      (a, b) =>
        a.role_display_name.localeCompare(b.role_display_name) ||
        `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`)
    );

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

  // First get all profiles. Service role (#1318): profiles is under RLS and the
  // caller may see only their own row; the caller is authorised above. Paged, so
  // the list is not cut at max_rows; id breaks name ties so pages do not overlap.
  const admin = createAdminClient();
  const profilesResult = await fetchAllRows<{
    id: string;
    email: string;
    full_name: string;
    role_id: string | null;
  }>((from, to) =>
    admin
      .from('profiles')
      .select('id, email, full_name, role_id')
      .order('full_name', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to)
  );

  if (profilesResult.error !== null) {
    return { success: false, error: profilesResult.error };
  }
  const profiles = profilesResult.data;

  // Get all roles for lookup
  const { data: roles } = await supabase
    .from('app_roles')
    .select('id, name, display_name');

  const roleMap = new Map(
    roles?.map((r) => [r.id, { name: r.name, display_name: r.display_name }]) || []
  );

  const users = profiles.map((user) => {
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
