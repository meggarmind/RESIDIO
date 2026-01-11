'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { UpdateTwoFactorPolicyInput, TwoFactorPolicyWithRole } from '@/types/database';

/**
 * Create or update a 2FA policy for a role
 */
export async function updateTwoFactorPolicy(
  policyId: string | null,
  input: UpdateTwoFactorPolicyInput
): Promise<{ success: boolean; message: string; data?: TwoFactorPolicyWithRole }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_MANAGE_POLICIES);
  if (!auth.authorized) {
    return { success: false, message: auth.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();

  // Build update data
  const updateData: Record<string, unknown> = {};

  if (input.enforcement !== undefined) {
    updateData.enforcement = input.enforcement;
  }
  if (input.gracePeriodDays !== undefined) {
    updateData.grace_period_days = input.gracePeriodDays;
  }
  if (input.allowSms !== undefined) {
    updateData.allow_sms = input.allowSms;
  }
  if (input.allowAuthenticator !== undefined) {
    updateData.allow_authenticator = input.allowAuthenticator;
  }
  if (input.allowEmail !== undefined) {
    updateData.allow_email = input.allowEmail;
  }
  if (input.requireBackupCodes !== undefined) {
    updateData.require_backup_codes = input.requireBackupCodes;
  }
  if (input.isActive !== undefined) {
    updateData.is_active = input.isActive;
  }

  if (policyId) {
    // Update existing policy
    const { data: existingPolicy } = await adminClient
      .from('two_factor_policies')
      .select('*')
      .eq('id', policyId)
      .single();

    if (!existingPolicy) {
      return { success: false, message: 'Policy not found' };
    }

    const { data, error } = await adminClient
      .from('two_factor_policies')
      .update(updateData)
      .eq('id', policyId)
      .select(`
        *,
        role:app_roles(id, name, display_name)
      `)
      .single();

    if (error) {
      return { success: false, message: error.message };
    }

    await logAudit({
      action: 'UPDATE',
      entityType: 'two_factor_policies',
      entityId: policyId,
      entityDisplay: `2FA Policy for ${data.role?.display_name || 'Global'}`,
      oldValues: existingPolicy,
      newValues: updateData,
    });

    return {
      success: true,
      message: 'Policy updated successfully',
      data: data as TwoFactorPolicyWithRole,
    };
  } else {
    // Create new policy
    const insertData = {
      role_id: input.roleId || null,
      enforcement: input.enforcement || 'optional',
      grace_period_days: input.gracePeriodDays ?? 7,
      allow_sms: input.allowSms ?? true,
      allow_authenticator: input.allowAuthenticator ?? true,
      allow_email: input.allowEmail ?? true,
      require_backup_codes: input.requireBackupCodes ?? true,
      is_active: input.isActive ?? true,
      created_by: auth.userId,
    };

    const { data, error } = await adminClient
      .from('two_factor_policies')
      .insert(insertData)
      .select(`
        *,
        role:app_roles(id, name, display_name)
      `)
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, message: 'A policy already exists for this role' };
      }
      return { success: false, message: error.message };
    }

    await logAudit({
      action: 'CREATE',
      entityType: 'two_factor_policies',
      entityId: data.id,
      entityDisplay: `2FA Policy for ${data.role?.display_name || 'Global'}`,
      newValues: insertData,
    });

    return {
      success: true,
      message: 'Policy created successfully',
      data: data as TwoFactorPolicyWithRole,
    };
  }
}

/**
 * Delete a 2FA policy
 */
export async function deleteTwoFactorPolicy(
  policyId: string
): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_MANAGE_POLICIES);
  if (!auth.authorized) {
    return { success: false, message: auth.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();

  // Get policy details for audit log
  const { data: policy } = await adminClient
    .from('two_factor_policies')
    .select(`
      *,
      role:app_roles(id, name, display_name)
    `)
    .eq('id', policyId)
    .single();

  if (!policy) {
    return { success: false, message: 'Policy not found' };
  }

  // Don't allow deleting the global policy
  if (!policy.role_id) {
    return { success: false, message: 'Cannot delete the global policy. Update it instead.' };
  }

  const { error } = await adminClient
    .from('two_factor_policies')
    .delete()
    .eq('id', policyId);

  if (error) {
    return { success: false, message: error.message };
  }

  await logAudit({
    action: 'DELETE',
    entityType: 'two_factor_policies',
    entityId: policyId,
    entityDisplay: `2FA Policy for ${policy.role?.display_name || 'Unknown'}`,
    oldValues: policy,
  });

  return { success: true, message: 'Policy deleted successfully' };
}

/**
 * Get available roles for policy assignment
 */
export async function getAvailableRolesForPolicy(): Promise<{
  success: boolean;
  data: Array<{ id: string; name: string; display_name: string; has_policy: boolean }>;
}> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_MANAGE_POLICIES);
  if (!auth.authorized) {
    return { success: false, data: [] };
  }

  const adminClient = createAdminClient();

  // Get all roles
  const { data: roles, error: rolesError } = await adminClient
    .from('app_roles')
    .select('id, name, display_name')
    .eq('is_active', true)
    .order('level');

  if (rolesError) {
    return { success: false, data: [] };
  }

  // Get existing policies
  const { data: policies } = await adminClient
    .from('two_factor_policies')
    .select('role_id')
    .not('role_id', 'is', null);

  const policyRoleIds = new Set(policies?.map((p) => p.role_id) || []);

  const rolesWithPolicy = roles.map((role) => ({
    ...role,
    has_policy: policyRoleIds.has(role.id),
  }));

  return { success: true, data: rolesWithPolicy };
}
