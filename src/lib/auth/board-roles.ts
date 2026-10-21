import { PERMISSIONS, type Permission } from '@/lib/auth/action-roles';

/**
 * The pure half of the account guards (#826), kept apart from account-guards.ts
 * so client components can ask the same question the server asks without
 * importing the service-role client. The server still enforces; this only lets
 * the UI avoid offering a choice that would be refused.
 */

/** Roles only a `system.assign_board_roles` holder may grant. */
const BOARD_GRANT_ROLES: readonly string[] = ['super_admin', 'chairman', 'trustee'];

/** Accounts only a `system.assign_board_roles` holder may change. Trustee is deliberately absent. */
const BOARD_ACCOUNT_ROLES: readonly string[] = ['super_admin', 'chairman'];

export function permissionToGrant(roleName: string): Permission {
  return BOARD_GRANT_ROLES.includes(roleName)
    ? PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES
    : PERMISSIONS.SYSTEM_ASSIGN_ROLES;
}

export function permissionToManage(targetRoleName: string | null): Permission {
  return targetRoleName && BOARD_ACCOUNT_ROLES.includes(targetRoleName)
    ? PERMISSIONS.SYSTEM_ASSIGN_BOARD_ROLES
    : PERMISSIONS.SYSTEM_ASSIGN_ROLES;
}
