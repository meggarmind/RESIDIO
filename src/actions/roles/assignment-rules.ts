'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type {
  RoleAssignmentRule,
  RoleAssignmentRuleWithRole,
  ResidentRole,
  AppRoleName,
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

  const supabase = await createServerSupabaseClient();

  // Get old value for audit
  const { data: oldRule } = await supabase
    .from('role_assignment_rules')
    .select('*')
    .eq('resident_role', residentRole)
    .eq('app_role_id', appRoleId)
    .single();

  // Upsert the rule
  const { error } = await supabase
    .from('role_assignment_rules')
    .upsert({
      resident_role: residentRole,
      app_role_id: appRoleId,
      is_allowed: isAllowed,
      created_by: oldRule ? oldRule.created_by : auth.userId,
    }, {
      onConflict: 'resident_role,app_role_id',
    });

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'role_assignment_rules',
    entityId: `${residentRole}-${appRoleId}`,
    entityDisplay: `${residentRole} → role assignment`,
    oldValues: oldRule ? { is_allowed: oldRule.is_allowed } : undefined,
    newValues: { is_allowed: isAllowed },
  });

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

  const supabase = await createServerSupabaseClient();

  // Perform upserts
  const { error } = await supabase
    .from('role_assignment_rules')
    .upsert(
      updates.map((u) => ({
        resident_role: u.residentRole,
        app_role_id: u.appRoleId,
        is_allowed: u.isAllowed,
        created_by: auth.userId,
      })),
      { onConflict: 'resident_role,app_role_id' }
    );

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'role_assignment_rules',
    entityId: 'batch',
    entityDisplay: `Batch update (${updates.length} rules)`,
    newValues: { updates },
  });

  return { success: true };
}

// =====================================================
// Validation
// =====================================================

/**
 * Check if a role can be assigned to a user based on their resident type
 */
export async function checkRoleAssignmentAllowed(
  userId: string,
  appRoleId: string
): Promise<{
  success: boolean;
  allowed: boolean;
  reason?: string;
}> {
  const supabase = await createServerSupabaseClient();

  // Get user's resident_id
  const { data: profile } = await supabase
    .from('profiles')
    .select('resident_id')
    .eq('id', userId)
    .single();

  // If user has no resident_id, they're a pure admin - allow assignment
  if (!profile?.resident_id) {
    return { success: true, allowed: true };
  }

  // Get user's primary resident role
  const { data: residency } = await supabase
    .from('resident_houses')
    .select('resident_role')
    .eq('resident_id', profile.resident_id)
    .eq('is_active', true)
    .order('is_primary', { ascending: false })
    .order('move_in_date', { ascending: false })
    .limit(1)
    .single();

  // If no active residency, allow
  if (!residency?.resident_role) {
    return { success: true, allowed: true };
  }

  // Check the rule
  const { data: rule } = await supabase
    .from('role_assignment_rules')
    .select('is_allowed')
    .eq('resident_role', residency.resident_role)
    .eq('app_role_id', appRoleId)
    .single();

  // If no explicit rule, default to allowed
  const isAllowed = rule?.is_allowed ?? true;

  if (!isAllowed) {
    // Get role name for error message
    const { data: role } = await supabase
      .from('app_roles')
      .select('display_name')
      .eq('id', appRoleId)
      .single();

    return {
      success: true,
      allowed: false,
      reason: `Users with resident type "${residency.resident_role}" cannot be assigned the "${role?.display_name}" role.`,
    };
  }

  return { success: true, allowed: true };
}
