import { createAdminClient } from '@/lib/supabase/server';
import { extractRoleName } from '@/lib/auth/action-roles';

/**
 * Who may change whom (issue #475, owner decision).
 *
 * Role and account administration used to guard the role being *granted* but
 * never the account being *changed*, so anyone holding `system.assign_roles`
 * could demote or lock out a chairman or another super_admin. This module is the
 * single place that answers the second question.
 *
 * Rank order: super_admin (3) > chairman (2) > every other role (1), custom
 * roles included. An account with no role, or one that cannot be resolved, ranks
 * 0.
 *
 *  - A caller may change a target account only if rank(caller) >= rank(target's
 *    CURRENT role).
 *  - A caller may grant a role only if rank(caller) >= rank(role granted), and
 *    the two top roles are grantable by a super_admin alone (the pre-existing
 *    rule, kept).
 *
 * Both reads go through the service role: `profiles` is under RLS and a
 * caller-scoped read of someone else's row is not reliable. Treat a refusal here
 * as final; a lookup failure refuses rather than allows.
 */

export const ROLE_RANK_SUPER_ADMIN = 3;
export const ROLE_RANK_CHAIRMAN = 2;
export const ROLE_RANK_OTHER = 1;

export function getRoleRank(roleName: string | null | undefined): number {
  if (!roleName) return 0;
  if (roleName === 'super_admin') return ROLE_RANK_SUPER_ADMIN;
  if (roleName === 'chairman') return ROLE_RANK_CHAIRMAN;
  return ROLE_RANK_OTHER;
}

export type ManageTargetResult =
  | { ok: true; callerRoleName: string | null; targetRoleName: string | null; targetApprovalStatus: string | null }
  | { ok: false; error: string };

export const ACCOUNT_NOT_FOUND_ERROR = 'Account not found';

export const TARGET_OUTRANKS_CALLER_ERROR =
  'You cannot change an account whose role outranks your own';

type ProfileRoleLookup =
  | { ok: true; roleName: string | null; approvalStatus: string | null }
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

  const record = data as unknown as { approval_status: string | null; app_roles: unknown };

  return {
    ok: true,
    roleName: extractRoleName(record.app_roles),
    approvalStatus: record.approval_status ?? null,
  };
}

/**
 * Refuses when the target account's CURRENT role outranks the caller's CURRENT
 * role. Roles are read fresh from the database, not from a session or a client
 * argument.
 */
export async function assertCanManageTarget(
  callerProfileId: string,
  targetProfileId: string
): Promise<ManageTargetResult> {
  const caller = await lookupProfileRole(callerProfileId);
  if (!caller.ok) {
    return { ok: false, error: 'Could not verify your role' };
  }

  const target = await lookupProfileRole(targetProfileId);
  if (!target.ok) {
    return { ok: false, error: target.error };
  }

  if (getRoleRank(caller.roleName) < getRoleRank(target.roleName)) {
    return { ok: false, error: TARGET_OUTRANKS_CALLER_ERROR };
  }

  return {
    ok: true,
    callerRoleName: caller.roleName,
    targetRoleName: target.roleName,
    targetApprovalStatus: target.approvalStatus,
  };
}

/**
 * Whether a caller may grant `grantedRoleName`. Mirrors the guards already in
 * assignRoleToProfile: super_admin and chairman are grantable by a super_admin
 * only; anything else needs rank(caller) >= rank(role).
 */
export function canGrantRole(
  callerRoleName: string | null | undefined,
  grantedRoleName: string | null | undefined
): boolean {
  const roleRank = getRoleRank(grantedRoleName);
  if (roleRank >= ROLE_RANK_CHAIRMAN) return callerRoleName === 'super_admin';
  return getRoleRank(callerRoleName) >= roleRank;
}
