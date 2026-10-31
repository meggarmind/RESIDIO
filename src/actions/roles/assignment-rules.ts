'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission, authorizeAnyPermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { assertCanGrantRoles } from '@/lib/auth/account-guards';
import { evaluateRoleAssignmentRules } from '@/lib/auth/role-assignment-checks';
import { isUuid } from '@/lib/postgrest-filter';
import {
  RESIDENT_ROLE_LABELS,
  type RoleAssignmentRuleWithRole,
  type ResidentRole,
  type AppRoleName,
} from '@/types/database';

// =====================================================
// Read Operations
// =====================================================

/**
 * Get all role assignment rules with role details
 */
export async function getRoleAssignmentRules(): Promise<{
  success: boolean;
  data?: RoleAssignmentRuleWithRole[];
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Get all rules
  const { data: rules, error: rulesError } = await supabase
    .from('role_assignment_rules')
    .select('*')
    .order('resident_role', { ascending: true });

  if (rulesError) {
    return { success: false, error: rulesError.message };
  }

  // Get all roles for lookup
  const { data: roles } = await supabase
    .from('app_roles')
    .select('id, name, display_name')
    .eq('is_active', true);

  const roleMap = new Map(
    roles?.map((r) => [r.id, { id: r.id, name: r.name as AppRoleName, display_name: r.display_name }])
  );

  // Combine rules with role details
  const rulesWithRoles: RoleAssignmentRuleWithRole[] = (rules || [])
    .map((rule) => {
      const appRole = roleMap.get(rule.app_role_id);
      if (!appRole) return null;
      return {
        ...rule,
        resident_role: rule.resident_role as ResidentRole,
        app_role: appRole,
      };
    })
    .filter((r): r is RoleAssignmentRuleWithRole => r !== null);

  return { success: true, data: rulesWithRoles };
}

/**
 * Get rules grouped by resident role for UI display
 */
export async function getRulesByResidentRole(): Promise<{
  success: boolean;
  data?: Record<ResidentRole, Array<{ roleId: string; roleName: string; displayName: string; isAllowed: boolean }>>;
  error?: string;
}> {
  const result = await getRoleAssignmentRules();
  if (!result.success || !result.data) {
    return { success: false, error: result.error };
  }

  const grouped: Record<string, Array<{ roleId: string; roleName: string; displayName: string; isAllowed: boolean }>> = {};

  for (const rule of result.data) {
    if (!grouped[rule.resident_role]) {
      grouped[rule.resident_role] = [];
    }
    grouped[rule.resident_role].push({
      roleId: rule.app_role_id,
      roleName: rule.app_role.name,
      displayName: rule.app_role.display_name,
      isAllowed: rule.is_allowed,
    });
  }

  return { success: true, data: grouped as Record<ResidentRole, Array<{ roleId: string; roleName: string; displayName: string; isAllowed: boolean }>> };
}

// =====================================================
// Write Operations
// =====================================================

/**
 * Grant guard (#503, #826): a rule that ALLOWS a role is an automatic grant path,
 * so it may only allow a role the caller could grant themselves
 * (assertCanGrantRoles: super_admin, chairman and trustee need
 * system.assign_board_roles, any other role system.assign_roles). Rules that
 * disallow a role only narrow what can be granted and are not checked. An unknown
 * role id is refused rather than assumed harmless.
 */
async function assertCanAllowRoles(
  callerProfileId: string,
  appRoleIds: string[]
): Promise<string | null> {
  if (appRoleIds.length === 0) return null;
  const unique = Array.from(new Set(appRoleIds));

  const supabase = await createServerSupabaseClient();
  const { data: roles, error } = await supabase
    .from('app_roles')
    .select('id, name')
    .in('id', unique);

  if (error) {
    console.error('[assignment-rules] Could not resolve roles for rank check:', error);
    return 'Could not verify the roles in this rule';
  }

  const nameById = new Map((roles ?? []).map((r) => [r.id, r.name as string]));
  const roleNames: string[] = [];
  for (const id of unique) {
    const roleName = nameById.get(id);
    if (!roleName) return 'Role not found';
    roleNames.push(roleName);
  }

  const grantGuard = await assertCanGrantRoles(callerProfileId, roleNames);
  if (!grantGuard.ok) {
    return 'You cannot allow a rule to assign a role that you could not assign yourself';
  }
  return null;
}

/**
 * Update a single rule's is_allowed status
 */
export async function updateRoleAssignmentRule(
  residentRole: ResidentRole,
  appRoleId: string,
  isAllowed: boolean
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  if (isAllowed) {
    const refusal = await assertCanAllowRoles(auth.userId!, [appRoleId]);
    if (refusal) return { success: false, error: refusal };
  }

  const supabase = await createServerSupabaseClient();

  // Get old value for audit
  const { data: oldRule } = await supabase
    .from('role_assignment_rules')
    .select('*')
    .eq('resident_role', residentRole)
    .eq('app_role_id', appRoleId)
    .single();

  // Upsert the rule
  const { data: savedRule, error } = await supabase
    .from('role_assignment_rules')
    .upsert({
      resident_role: residentRole,
      app_role_id: appRoleId,
      is_allowed: isAllowed,
      created_by: oldRule ? oldRule.created_by : auth.userId,
    }, {
      onConflict: 'resident_role,app_role_id',
    })
    .select('id')
    .single();

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log. audit_logs.entity_id is a uuid: use the rule row id; the role pair
  // goes in entityDisplay/newValues (#594).
  if (savedRule?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'role_assignment_rules',
      entityId: savedRule.id,
      entityDisplay: `${residentRole} → role assignment`,
      oldValues: oldRule ? { is_allowed: oldRule.is_allowed } : undefined,
      newValues: { is_allowed: isAllowed, resident_role: residentRole, app_role_id: appRoleId },
    });
  }

  return { success: true };
}

/**
 * Batch update multiple rules at once
 */
export async function batchUpdateRoleAssignmentRules(
  updates: Array<{
    residentRole: ResidentRole;
    appRoleId: string;
    isAllowed: boolean;
  }>
): Promise<{
  success: boolean;
  error?: string;
}> {
  const auth = await authorizePermission(PERMISSIONS.SYSTEM_MANAGE_ROLES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const invalid = validateRuleUpdates(updates);
  if (invalid) return { success: false, error: invalid };

  const refusal = await assertCanAllowRoles(
    auth.userId!,
    updates.filter((u) => u.isAllowed).map((u) => u.appRoleId)
  );
  if (refusal) return { success: false, error: refusal };

  const supabase = await createServerSupabaseClient();

  // The rows being replaced, for created_by and the audit's old values.
  const { data: existingRules, error: existingError } = updates.length > 0
    ? await supabase
        .from('role_assignment_rules')
        .select('resident_role, app_role_id, is_allowed, created_by')
        .in('resident_role', Array.from(new Set(updates.map((u) => u.residentRole))))
        .in('app_role_id', Array.from(new Set(updates.map((u) => u.appRoleId))))
    : { data: [], error: null };

  if (existingError) {
    console.error('[assignment-rules] Could not read the current rules:', existingError);
    return { success: false, error: 'Could not read the current rules' };
  }

  const existingByKey = new Map(
    (existingRules ?? []).map((r) => [ruleKey(r.resident_role, r.app_role_id), r])
  );

  // Perform upserts
  const { data: savedRules, error } = await supabase
    .from('role_assignment_rules')
    .upsert(
      updates.map((u) => ({
        resident_role: u.residentRole,
        app_role_id: u.appRoleId,
        is_allowed: u.isAllowed,
        // An existing rule keeps the person who created it.
        created_by: existingByKey.get(ruleKey(u.residentRole, u.appRoleId))?.created_by ?? auth.userId,
      })),
      { onConflict: 'resident_role,app_role_id' }
    )
    .select('id');

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log. audit_logs.entity_id is a uuid: the first written rule row stands for the
  // batch (#594). An empty batch changed nothing, so it is not audited.
  const ruleIds = (savedRules ?? []).map((r) => r.id);
  if (ruleIds.length > 0) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'role_assignment_rules',
      entityId: ruleIds[0],
      entityDisplay: `Batch update (${updates.length} rules)`,
      oldValues: {
        rules: updates.map((u) => ({
          residentRole: u.residentRole,
          appRoleId: u.appRoleId,
          isAllowed: existingByKey.get(ruleKey(u.residentRole, u.appRoleId))?.is_allowed ?? null,
        })),
      },
      newValues: { total_count: updates.length, rule_ids: ruleIds.slice(0, 50), updates },
    });
  }

  return { success: true };
}

function ruleKey(residentRole: string, appRoleId: string): string {
  return `${residentRole}|${appRoleId}`;
}

/** Why a batch of rule updates is malformed, or null when it is not. */
function validateRuleUpdates(
  updates: Array<{ residentRole: ResidentRole; appRoleId: string; isAllowed: boolean }>
): string | null {
  if (!Array.isArray(updates)) return 'Invalid rule updates';

  const seen = new Set<string>();
  for (const u of updates) {
    if (!u || !Object.prototype.hasOwnProperty.call(RESIDENT_ROLE_LABELS, u.residentRole)) {
      return 'Unknown resident type in the rules';
    }
    if (!isUuid(u.appRoleId)) return 'Invalid role in the rules';
    if (typeof u.isAllowed !== 'boolean') return 'Invalid rule value';

    const key = ruleKey(u.residentRole, u.appRoleId);
    if (seen.has(key)) return 'The same rule appears more than once';
    seen.add(key);
  }
  return null;
}

// =====================================================
// Validation
// =====================================================

/**
 * Check if a role can be assigned to an account under "Who can hold each role"
 * and the role's contact verification requirement.
 *
 * Exported for assignRoleToUser, so it is a public endpoint: it reads other
 * people's rows and therefore checks permission first. The assign actions call
 * the shared check in '@/lib/auth/role-assignment-checks' directly.
 */
export async function checkRoleAssignmentAllowed(
  userId: string,
  appRoleId: string
): Promise<{
  success: boolean;
  allowed: boolean;
  reason?: string;
}> {
  const auth = await authorizeAnyPermission([
    PERMISSIONS.SYSTEM_ASSIGN_ROLES,
    PERMISSIONS.SYSTEM_MANAGE_ROLES,
  ]);
  if (!auth.authorized) {
    return { success: false, allowed: false, reason: auth.error || 'Unauthorized' };
  }

  const { data: profile, error } = await createAdminClient()
    .from('profiles')
    .select('resident_id')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('[assignment-rules] Could not read the account:', error);
    return { success: false, allowed: false, reason: 'Could not check who can hold this role' };
  }

  const check = await evaluateRoleAssignmentRules(profile?.resident_id ?? null, appRoleId);
  return check.allowed
    ? { success: true, allowed: true }
    : { success: true, allowed: false, reason: check.reason };
}
