/**
 * Who may change a role, in one pure rule shared by the server actions and the
 * Roles tab (#1318), so a button shows only when the action behind it would
 * succeed (CORE.md section 6, "Visibility follows access").
 *
 * Server side: updateRole, updateRolePermissions and the title actions call
 * roleWriteBlock. deleteRole refuses system roles itself, and a role someone
 * holds (the caller's own included) through its holder count.
 */

export interface RoleWriteCaller {
  roleName: string | null;
  roleId: string | null;
}

export interface RoleWriteTarget {
  id: string;
  name: string;
  is_system_role?: boolean | null;
}

/**
 * Rank guard (#475, #503): only a super admin may change super_admin, a system
 * role, or the role they hold themselves. A missing role counts as a system one.
 * Returns why the write is refused, or null when it is allowed.
 */
export function roleWriteBlock(
  caller: RoleWriteCaller,
  role: RoleWriteTarget | null | undefined
): 'rank' | 'own' | null {
  if (caller.roleName === 'super_admin') return null;
  if (!role || role.name === 'super_admin' || role.is_system_role) return 'rank';
  if (caller.roleId !== null && caller.roleId === role.id) return 'own';
  return null;
}

export interface RoleActionAccess {
  /** Edit the role's details (updateRole). */
  canEdit: boolean;
  /** Change the role's permissions (updateRolePermissions). */
  canManageAccess: boolean;
  /** Delete the role (deleteRole); holders are explained in the delete dialog. */
  canDelete: boolean;
}

/** Which role buttons to show to a caller, from the same checks the actions make. */
export function roleActionAccess(
  caller: RoleWriteCaller & { canManageRoles: boolean },
  role: RoleWriteTarget
): RoleActionAccess {
  if (!caller.canManageRoles) {
    return { canEdit: false, canManageAccess: false, canDelete: false };
  }
  const writable = roleWriteBlock(caller, role) === null;
  return {
    canEdit: writable,
    canManageAccess: writable,
    // System roles are never deleted; the caller holds their own role, so deleteRole refuses it.
    canDelete: !role.is_system_role && role.name !== 'super_admin' && caller.roleId !== role.id,
  };
}

/**
 * The stored key for a new role, from what the admin typed: accents are folded
 * (Trésorier -> tresorier), spaces become underscores, and anything else that is
 * not a-z, 0-9 or _ is dropped. Returns null when nothing usable is left, so the
 * form can say so instead of silently sending an empty or mangled name.
 */
export function deriveRoleKey(raw: string): string | null {
  const key = raw
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return key.length > 0 ? key : null;
}
