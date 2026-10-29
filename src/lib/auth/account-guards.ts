import { createAdminClient } from '@/lib/supabase/server';
import { extractRoleName } from '@/lib/auth/action-roles';
import { permissionToGrant, permissionToManage } from '@/lib/auth/board-roles';

export { permissionToGrant, permissionToManage };

/**
 * Who may grant which role, and who may change whom (#475, #826).
 *
 * Role and account administration used to rank roles by name (super_admin >
 * chairman > everyone else). The owner decided on 2026-10-19 (#822) that
 * privilege comes from role permissions only, so both questions are answered by
 * the caller's permissions:
 *
 *  - Granting super_admin, chairman or trustee needs `system.assign_board_roles`.
 *    Any other role needs `system.assign_roles`.
 *  - Changing an account (role change, approve or reject, link or unlink, 2FA
 *    reset) that currently holds super_admin or chairman needs
 *    `system.assign_board_roles`. Any other account, a Trustee's included, needs
 *    `system.assign_roles`: a Chairman may manage Trustee accounts but cannot
 *    appoint one.
 *
 * The caller's permissions and the target's role are read fresh through the
 * service role, never from a session or a client argument: `profiles` is under
 * RLS and a caller-scoped read of someone else's row is not reliable. The caller
 * resolves exactly as get_my_access() does (an approved profile, its role, the
 * role's active permissions). Treat a refusal here as final; a lookup failure
 * refuses rather than allows.
 */

export type ManageTargetResult =
  | { ok: true; targetRoleName: string | null; targetApprovalStatus: string | null }
  | { ok: false; error: string };

export type GrantRoleResult = { ok: true } | { ok: false; error: string };

export const ACCOUNT_NOT_FOUND_ERROR = 'Account not found';

export const CALLER_NOT_VERIFIED_ERROR = 'Could not verify your permissions';

export const CANNOT_CHANGE_ACCOUNT_ERROR = 'You do not have permission to change this account';

export const CANNOT_GRANT_ROLE_ERROR = 'You do not have permission to assign this role';

type ProfileRoleLookup =
  | { ok: true; roleId: string | null; roleName: string | null; approvalStatus: string | null }
  | { ok: false; error: string };

async function lookupProfileRole(profileId: string): Promise<ProfileRoleLookup> {
  const { data, error } = await createAdminClient()
    .from('profiles')
    .select('id, approval_status, role_id, app_roles!profiles_role_id_fkey (name)')
    .eq('id', profileId)
    .maybeSingle();

  // A read failure must not look like "no such account": link-account tolerates
  // only the latter, so conflating them would turn a database error into a bypass.
  if (error) {
    return { ok: false, error: 'Could not verify the account' };
  }

  if (!data) {
    return { ok: false, error: ACCOUNT_NOT_FOUND_ERROR };
  }

  const record = data as unknown as {
    approval_status: string | null;
    role_id: string | null;
    app_roles: unknown;
  };

  return {
    ok: true,
    roleId: record.role_id ?? null,
    roleName: extractRoleName(record.app_roles),
    approvalStatus: record.approval_status ?? null,
  };
}

type PermissionLookup = { ok: true; permissions: Set<string> } | { ok: false };

/** The caller's permissions, resolved as get_my_access() resolves them. */
async function lookupCallerPermissions(callerProfileId: string): Promise<PermissionLookup> {
  const caller = await lookupProfileRole(callerProfileId);
  if (!caller.ok) return { ok: false };

  // Not approved, or no role: get_my_access() returns no rows, so no permissions.
  if (caller.approvalStatus !== 'active' || !caller.roleId) {
    return { ok: true, permissions: new Set() };
  }

  const { data, error } = await createAdminClient()
    .from('role_permissions')
    .select('permission:app_permissions!inner(name, is_active)')
    .eq('role_id', caller.roleId);

  if (error || !data) return { ok: false };

  const permissions = new Set<string>();
  for (const row of data as unknown as Array<{ permission: unknown }>) {
    const joined = Array.isArray(row.permission) ? row.permission[0] : row.permission;
    const perm = joined as { name?: unknown; is_active?: unknown } | null;
    if (perm && typeof perm.name === 'string' && perm.is_active === true) {
      permissions.add(perm.name);
    }
  }
  return { ok: true, permissions };
}

/**
 * Whether an account holds a permission, read as get_my_access() would for it. For work with no
 * session, such as a scheduled publish acting for the person who scheduled it (#1328). A lookup
 * failure is false.
 */
export async function profileHasPermission(profileId: string, permission: string): Promise<boolean> {
  const caller = await lookupCallerPermissions(profileId);
  return caller.ok && caller.permissions.has(permission);
}

/**
 * Refuses unless the caller holds the permission that the target account's
 * CURRENT role requires (see permissionToManage).
 */
export async function assertCanManageTarget(
  callerProfileId: string,
  targetProfileId: string
): Promise<ManageTargetResult> {
  const caller = await lookupCallerPermissions(callerProfileId);
  if (!caller.ok) {
    return { ok: false, error: CALLER_NOT_VERIFIED_ERROR };
  }

  const target = await lookupProfileRole(targetProfileId);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }

  if (!caller.permissions.has(permissionToManage(target.roleName))) {
    return { ok: false, error: CANNOT_CHANGE_ACCOUNT_ERROR };
  }

  return {
    ok: true,
    targetRoleName: target.roleName,
    targetApprovalStatus: target.approvalStatus,
  };
}

/**
 * Refuses unless the caller holds the permission each of `roleNames` requires
 * (see permissionToGrant). Role names must come from the database, never from
 * the client.
 */
export async function assertCanGrantRoles(
  callerProfileId: string,
  roleNames: string[]
): Promise<GrantRoleResult> {
  const caller = await lookupCallerPermissions(callerProfileId);
  if (!caller.ok) {
    return { ok: false, error: CALLER_NOT_VERIFIED_ERROR };
  }

  if (roleNames.some((name) => !caller.permissions.has(permissionToGrant(name)))) {
    return { ok: false, error: CANNOT_GRANT_ROLE_ERROR };
  }

  return { ok: true };
}
