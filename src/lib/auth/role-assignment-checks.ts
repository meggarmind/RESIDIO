import { createAdminClient } from '@/lib/supabase/server';
import { RESIDENT_ROLE_LABELS, type ResidentRole } from '@/types/database';

/**
 * Checks shared by the role-assignment actions (#1316): assignRoleToProfile and
 * approveAccount.
 *
 * Deliberately NOT a 'use server' file. Every export of a 'use server' module is
 * a public endpoint, and these checks read other people's rows through the
 * service role, so they must only run after the calling action has authorized
 * the request. Nothing here checks permissions itself.
 */

export type RuleCheck = { allowed: true } | { allowed: false; reason: string };

export type TitleCheck =
  | { ok: true; title: { id: string; name: string } | null }
  | { ok: false; error: string };

export function noResidentError(roleDisplayName: string): string {
  return `The ${roleDisplayName} role can only be held by a resident. Link this account to a resident record first.`;
}

/**
 * "Who can hold each role" (role_assignment_rules) plus the role's contact
 * verification requirement, for the resident the account is (or will be)
 * linked to. An account with no resident, or a resident with no active
 * residency, is not covered by any rule. A failed read refuses rather than
 * allows.
 */
export async function evaluateRoleAssignmentRules(
  residentId: string | null,
  appRoleId: string
): Promise<RuleCheck> {
  if (!residentId) return { allowed: true };

  const admin = createAdminClient();
  const readFailed: RuleCheck = { allowed: false, reason: 'Could not check who can hold this role' };

  const { data: residency, error: residencyError } = await admin
    .from('resident_houses')
    .select('resident_role')
    .eq('resident_id', residentId)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('move_in_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (residencyError) {
    console.error('[role-assignment-checks] Could not read residency:', residencyError);
    return readFailed;
  }
  if (!residency?.resident_role) return { allowed: true };

  const { data: role, error: roleError } = await admin
    .from('app_roles')
    .select('id, display_name, requires_contact_verification')
    .eq('id', appRoleId)
    .maybeSingle();

  if (roleError) {
    console.error('[role-assignment-checks] Could not read role:', roleError);
    return readFailed;
  }
  if (!role) return { allowed: false, reason: 'Role not found' };

  const { data: rule, error: ruleError } = await admin
    .from('role_assignment_rules')
    .select('is_allowed')
    .eq('resident_role', residency.resident_role)
    .eq('app_role_id', appRoleId)
    .maybeSingle();

  if (ruleError) {
    console.error('[role-assignment-checks] Could not read assignment rule:', ruleError);
    return readFailed;
  }

  // No explicit rule means allowed.
  if (rule && rule.is_allowed === false) {
    const residentRole =
      RESIDENT_ROLE_LABELS[residency.resident_role as ResidentRole] ?? residency.resident_role;
    return {
      allowed: false,
      reason: `A resident whose type is ${residentRole} cannot hold the ${role.display_name} role. This is set under "Who can hold each role".`,
    };
  }

  if (!role.requires_contact_verification) return { allowed: true };

  const { data: resident, error: residentError } = await admin
    .from('residents')
    .select('email, email_verified_at')
    .eq('id', residentId)
    .maybeSingle();

  if (residentError) {
    console.error('[role-assignment-checks] Could not read resident:', residentError);
    return readFailed;
  }
  if (!resident) return { allowed: false, reason: 'Resident not found' };

  if (!resident.email_verified_at) {
    return {
      allowed: false,
      reason: resident.email
        ? `The ${role.display_name} role needs a verified email address. This resident's email address is not verified yet.`
        : `The ${role.display_name} role needs a verified email address. This resident has no email address on record.`,
    };
  }

  return { allowed: true };
}

/**
 * A title must belong to the role it is assigned under and must have a free
 * seat. The profiles trigger (#823) enforces both; this runs first so the
 * administrator is told who holds the seat rather than shown a database error.
 * Other active holders only: re-saving someone's own title does not count
 * against them, and an account that is not active holds no seat.
 */
export async function checkTitleForRole(
  roleId: string,
  titleId: string | null,
  profileId: string
): Promise<TitleCheck> {
  if (!titleId) return { ok: true, title: null };

  const admin = createAdminClient();
  const { data: title, error } = await admin
    .from('admin_titles')
    .select('id, name, role_id, seats')
    .eq('id', titleId)
    .maybeSingle();

  if (error) {
    console.error('Error reading title:', error);
    return { ok: false, error: 'Could not check the title' };
  }
  if (!title || title.role_id !== roleId) {
    return { ok: false, error: 'That title does not belong to this role' };
  }

  if (title.seats !== null) {
    const { data: holders, error: holdersError } = await admin
      .from('profiles')
      .select('id, full_name, email')
      .eq('title_id', titleId)
      .eq('approval_status', 'active')
      .neq('id', profileId);

    if (holdersError) {
      console.error('Error counting title holders:', holdersError);
      return { ok: false, error: 'Could not check whether the title is free' };
    }
    if ((holders?.length ?? 0) >= title.seats) {
      const names = (holders ?? []).map((h) => h.full_name || h.email).join(', ');
      return {
        ok: false,
        error: `${title.name} is already held by ${names}. Move them to another title first.`,
      };
    }
  }

  return { ok: true, title: { id: title.id, name: title.name } };
}
