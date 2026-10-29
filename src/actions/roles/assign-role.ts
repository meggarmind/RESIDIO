'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { isLastActiveSuperAdmin, LAST_SUPER_ADMIN_ERROR } from '@/lib/auth/super-admin-invariant';
import { assertCanGrantRoles, assertCanManageTarget } from '@/lib/auth/account-guards';
import { ilikeAny, uuidInList } from '@/lib/postgrest-filter';
import {
  checkTitleForRole,
  evaluateRoleAssignmentRules,
  noResidentError,
} from '@/lib/auth/role-assignment-checks';
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
  /** The linked account's approval status; null when the resident has no account. */
  approval_status: ProfileApprovalStatus | null;
  current_role_id: string | null;
  current_role_name: string | null;
  current_role_display_name: string | null;
  current_title_id: string | null;
  current_title_name: string | null;
};

/**
 * The `.or()` filter for a name search. A single word matches any of `columns`;
 * several words ("John Smith") also match a row where every word is found in
 * one of `nameColumns`, so a first and last name typed together find the person.
 */
function nameSearchFilter(columns: string[], nameColumns: string[], query: string): string {
  const words = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  const whole = ilikeAny(columns, query.trim());
  if (words.length < 2) return whole;
  const everyWord = words.map((word) => `or(${ilikeAny(nameColumns, word)})`).join(',');
  return `${whole},and(${everyWord})`;
}

// =====================================================
// Search Residents for Role Assignment
// =====================================================

/**
 * Search residents by name or email for role assignment
 * Returns residents with their current role information
 *
 * `unlinkedOnly` returns only residents with no account from either side:
 * residents.profile_id is empty and no profile's resident_id points at them.
 * It filters in the query, before the result limit.
 */
export async function searchResidentsForRoleAssignment(
  query: string,
  options?: { unlinkedOnly?: boolean }
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

  // Search residents by name or email
  // Join with resident_houses to get house information (many-to-many relationship)
  let residentQuery = supabase
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
    .or(nameSearchFilter(['first_name', 'last_name', 'email'], ['first_name', 'last_name'], query));

  if (options?.unlinkedOnly) {
    // Residents an account points at through profiles.resident_id. Service role
    // after the permission check: RLS hides other people's profiles.
    const { data: linked, error: linkedError } = await createAdminClient()
      .from('profiles')
      .select('resident_id')
      .not('resident_id', 'is', null);

    if (linkedError) {
      console.error('Error reading linked residents:', linkedError);
      return { error: 'Failed to search residents' };
    }

    residentQuery = residentQuery.is('profile_id', null);
    const linkedIds = uuidInList((linked ?? []).map((p) => p.resident_id));
    if (linkedIds) residentQuery = residentQuery.not('id', 'in', linkedIds);
  }

  const { data: residents, error } = await residentQuery.limit(20);

  if (error) {
    console.error('Error searching residents:', error);
    return { error: 'Failed to search residents' };
  }

  // Accounts linked to these residents, from either direction:
  // residents.profile_id and profiles.resident_id are two independent links.
  // Read with the service role after the permission check above: RLS on
  // profiles shows other people's rows only to system.view_all_profiles.
  const residentIds = (residents ?? []).map((r) => r.id);
  const linkedProfileIds = (residents ?? [])
    .map((r) => r.profile_id)
    .filter((id): id is string => Boolean(id));

  type LinkedProfile = {
    id: string;
    resident_id: string | null;
    approval_status: ProfileApprovalStatus;
    role_id: string | null;
    title_id: string | null;
    app_roles: { name: string; display_name: string } | { name: string; display_name: string }[] | null;
    admin_titles: { name: string } | { name: string }[] | null;
  };
  const profilesById = new Map<string, LinkedProfile>();
  const profileIdByResident = new Map<string, string>();

  if (residentIds.length > 0) {
    const admin = createAdminClient();
    const columns =
      'id, resident_id, approval_status, role_id, title_id, app_roles!profiles_role_id_fkey (name, display_name), admin_titles:title_id (name)';
    const [byId, byResident] = await Promise.all([
      linkedProfileIds.length > 0
        ? admin.from('profiles').select(columns).in('id', linkedProfileIds)
        : Promise.resolve({ data: [], error: null }),
      admin.from('profiles').select(columns).in('resident_id', residentIds),
    ]);

    if (byId.error || byResident.error) {
      console.error('Error reading linked accounts:', byId.error ?? byResident.error);
      return { error: 'Failed to search residents' };
    }

    for (const profile of [...(byId.data ?? []), ...(byResident.data ?? [])] as LinkedProfile[]) {
      profilesById.set(profile.id, profile);
      if (profile.resident_id) profileIdByResident.set(profile.resident_id, profile.id);
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

    const profileId = resident.profile_id ?? profileIdByResident.get(resident.id) ?? null;
    const profile = profileId ? profilesById.get(profileId) : undefined;
    const role = Array.isArray(profile?.app_roles) ? profile.app_roles[0] : profile?.app_roles;
    const title = Array.isArray(profile?.admin_titles) ? profile.admin_titles[0] : profile?.admin_titles;

    return {
      id: resident.id,
      first_name: resident.first_name,
      last_name: resident.last_name,
      email: resident.email,
      phone_primary: resident.phone_primary,
      house_address: houseAddress,
      profile_id: profileId,
      approval_status: profile?.approval_status ?? null,
      current_role_id: profile?.role_id ?? null,
      current_role_name: role?.name ?? null,
      current_role_display_name: role?.display_name ?? null,
      current_title_id: profile?.title_id ?? null,
      current_title_name: title?.name ?? null,
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
  current_title_id: string | null;
  current_title_name: string | null;
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

  // Service role after the permission check: RLS on profiles shows other
  // people's rows only to system.view_all_profiles.
  const { data: profiles, error } = await createAdminClient()
    .from('profiles')
    .select(`
      id,
      email,
      full_name,
      approval_status,
      resident_id,
      role_id,
      title_id,
      app_roles!profiles_role_id_fkey (name, display_name),
      admin_titles:title_id (name)
    `)
    .or(nameSearchFilter(['email', 'full_name'], ['full_name'], query))
    .limit(20);

  if (error) {
    console.error('Error searching profiles:', error);
    return { error: 'Failed to search accounts' };
  }

  const results: ProfileSearchResult[] = (profiles || []).map((profile) => {
    const role = Array.isArray(profile.app_roles) ? profile.app_roles[0] : profile.app_roles;
    const title = Array.isArray(profile.admin_titles) ? profile.admin_titles[0] : profile.admin_titles;

    return {
      profile_id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      approval_status: profile.approval_status,
      resident_id: profile.resident_id,
      current_role_id: profile.role_id,
      current_role_name: role?.name ?? null,
      current_role_display_name: role?.display_name ?? null,
      current_title_id: profile.title_id ?? null,
      current_title_name: title?.name ?? null,
    };
  });

  return { data: results };
}

/** What an assignment leaves on the account; the same fields getCurrentAdmins returns for a row. */
export type AssignedRole = {
  profile_id: string;
  role_id: string;
  role_name: string;
  role_display_name: string;
  title_id: string | null;
  title_name: string | null;
};

// =====================================================
// Assign Role to a Profile (primitive)
// =====================================================

/*
 * LEGACY_ROLE_MAP used to live here, and both actions below used it to mirror
 * every role assignment into the legacy `profiles.role` column.
 *
 * #193 deleted it -- earlier than the tracker said, which put it in #194 -- and
 * with it the `role: legacyRole` / `role: null` writes and the `role` field in
 * the audit oldValues/newValues. #194 then dropped the column itself, the
 * `user_role` enum and `get_my_role()` (migration 20260906040000), so there is
 * no second vocabulary left for anything here to mirror into.
 *
 * `role_id` is the only role a profile has. Read its name through
 * `app_roles!profiles_role_id_fkey(name)` and `extractRoleName()`.
 */

/**
 * Assign a role directly to an account.
 *
 * This is the primitive; assignRoleToResident wraps it. Works for any profile,
 * whether or not it is linked to a resident record.
 */
export async function assignRoleToProfile(
  profileId: string,
  roleId: string,
  titleId?: string | null
): Promise<{
  success: boolean;
  data?: AssignedRole;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  // Service role after the permission check: RLS on profiles shows other
  // people's rows only to system.view_all_profiles.
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, role_id, title_id, resident_id, approval_status')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  // A pending, suspended or rejected account resolves no permissions, so a role
  // given to it would look saved and change nothing. Approval is the way in:
  // approveAccount validates and activates in one step and does not call this.
  if (profile.approval_status !== 'active') {
    return {
      success: false,
      error:
        profile.approval_status === 'pending'
          ? 'This account is waiting for approval. Approve the sign-up under Pending sign-ups first; that step gives it its role.'
          : `This account is ${profile.approval_status}, so it cannot be given a role.`,
    };
  }

  const { data: role, error: roleError } = await admin
    .from('app_roles')
    .select('id, name, display_name, is_active, requires_resident')
    .eq('id', roleId)
    .single();

  if (roleError || !role) {
    return { success: false, error: 'Role not found' };
  }

  if (!role.is_active) {
    return { success: false, error: 'Cannot assign an inactive role' };
  }

  // Target guard (#475, #826): changing an account that holds super_admin or
  // chairman needs system.assign_board_roles. Without this an assign_roles holder
  // could demote a chairman or a non-last super_admin by "assigning" them an
  // ordinary role.
  const targetGuard = await assertCanManageTarget(auth.userId!, profileId);
  if (!targetGuard.ok) {
    return { success: false, error: targetGuard.error };
  }

  // Grant guard (#826): super_admin, chairman and trustee need
  // system.assign_board_roles. This is the real enforcement — the UI merely
  // mirrors it.
  const grantGuard = await assertCanGrantRoles(auth.userId!, [role.name]);
  if (!grantGuard.ok) {
    return { success: false, error: grantGuard.error };
  }

  // Bootstrap invariant (#184): moving the last active super_admin onto another
  // role would leave the estate with no administrator. The database trigger
  // refuses this write regardless; the check is here so the administrator sees
  // why rather than a Postgres exception.
  if (role.name !== 'super_admin' && (await isLastActiveSuperAdmin(profileId))) {
    return { success: false, error: LAST_SUPER_ADMIN_ERROR };
  }

  // Resident-link rule (#823): the database trigger refuses this too; checking
  // here lets the administrator see why instead of a Postgres exception.
  if (role.requires_resident && !profile.resident_id) {
    return { success: false, error: noResidentError(role.display_name) };
  }

  // "Who can hold each role" (role_assignment_rules) and contact verification.
  const ruleCheck = await evaluateRoleAssignmentRules(profile.resident_id, role.id);
  if (!ruleCheck.allowed) {
    return { success: false, error: ruleCheck.reason };
  }

  const titleCheck = await checkTitleForRole(role.id, titleId ?? null, profileId);
  if (!titleCheck.ok) {
    return { success: false, error: titleCheck.error };
  }
  const title = titleCheck.title;

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
  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({
      role_id: roleId,
      // Always written, so choosing no title clears the old one.
      title_id: title?.id ?? null,
    })
    .eq('id', profileId)
    .select('id');

  if (updateError) {
    console.error('Error updating role:', updateError);
    // The trigger (#823) is the last line of defence: a seat taken between the
    // check above and this write comes back as a check violation.
    return {
      success: false,
      error: updateError.code === '23514' ? updateError.message : 'Failed to assign role',
    };
  }

  if (!updated || updated.length === 0) {
    console.error('Role assignment matched no rows for profile', profileId);
    return { success: false, error: 'Failed to assign role: the account could not be updated' };
  }

  const person = profile.full_name || profile.email;
  await logAudit({
    action: 'ASSIGN',
    entityType: 'profiles',
    entityId: profileId,
    entityDisplay: title ? `${person} (${title.name})` : person,
    oldValues: { role_id: profile.role_id, title_id: profile.title_id ?? null },
    newValues: {
      role_id: roleId,
      role_name: role.display_name,
      title_id: title?.id ?? null,
      title_name: title?.name ?? null,
    },
  });

  return {
    success: true,
    data: {
      profile_id: profileId,
      role_id: role.id,
      role_name: role.name,
      role_display_name: role.display_name,
      title_id: title?.id ?? null,
      title_name: title?.name ?? null,
    },
  };
}

/**
 * Revoke a role from an account.
 *
 * Every account loses its role (role_id null). A resident-linked account stays
 * active, which is what a plain resident is: the portal admits it by its
 * resident_id (the 'resident' role was retired by #825). An account with no
 * resident link returns to pending — leaving it role-less but active would
 * give it a dashboard with nothing on it.
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

  // Service role after the permission check, as in assignRoleToProfile.
  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('id, email, full_name, role_id, title_id, resident_id, approval_status')
    .eq('id', profileId)
    .single();

  if (profileError || !profile) {
    return { success: false, error: 'Account not found' };
  }

  // Target guard (#503, #826): removing the chairman role needs
  // system.assign_board_roles, any other role (a trustee's included)
  // system.assign_roles. The target's CURRENT role is read fresh by the guard.
  const targetGuard = await assertCanManageTarget(auth.userId!, profileId);
  if (!targetGuard.ok) {
    return { success: false, error: targetGuard.error };
  }

  if (targetGuard.targetRoleName === 'super_admin') {
    return { success: false, error: 'Cannot remove the Super Administrator role' };
  }

  const newRoleId: string | null = null;
  const newRoleLabel = profile.resident_id ? 'Resident' : 'None';
  const newStatus = profile.resident_id ? profile.approval_status : 'pending';

  // Service role for the same reason as assignRoleToProfile above.
  const { data: updated, error: updateError } = await admin
    .from('profiles')
    .update({
      role_id: newRoleId,
      title_id: null,
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
    oldValues: {
      role_id: profile.role_id,
      title_id: profile.title_id ?? null,
      approval_status: profile.approval_status,
    },
    newValues: { role_id: newRoleId, title_id: null, role_name: newRoleLabel, approval_status: newStatus },
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
  roleId: string,
  titleId?: string | null
): Promise<{
  success: boolean;
  data?: AssignedRole;
  error?: string;
}> {
  // Checked before the resident's account is looked up with the service role.
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const profileId = await resolveResidentProfileId(residentId);
  if ('error' in profileId) {
    return { success: false, error: profileId.error };
  }

  return assignRoleToProfile(profileId.profileId, roleId, titleId);
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
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_ASSIGN_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const profileId = await resolveResidentProfileId(residentId);
  if ('error' in profileId) {
    return { success: false, error: profileId.error };
  }

  return removeRoleFromProfile(profileId.profileId);
}

/**
 * Resolve a resident to the profile its role actually lives on. Call only after
 * authorizePermission(SYSTEM_ASSIGN_ROLES).
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

  // Service role: the callers have already checked system.assign_roles, and RLS
  // on profiles hides other people's rows from anyone without view_all_profiles.
  const { data: linkedProfile } = await createAdminClient()
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
