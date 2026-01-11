'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import type { TwoFactorAuditLogWithProfile, TwoFactorAuditAction } from '@/types/database';

interface GetAuditLogParams {
  profileId?: string;
  action?: TwoFactorAuditAction;
  fromDate?: string;
  toDate?: string;
  page?: number;
  limit?: number;
}

/**
 * Get 2FA audit log entries
 */
export async function getTwoFactorAuditLog(
  params: GetAuditLogParams = {}
): Promise<{
  data: TwoFactorAuditLogWithProfile[];
  total: number;
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: [], total: 0, error: 'Not authenticated' };
  }

  // Check if user can view all audit logs or only their own
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_VIEW_AUDIT_LOG);
  const canViewAll = auth.authorized;

  const { page = 1, limit = 20, profileId, action, fromDate, toDate } = params;
  const offset = (page - 1) * limit;

  // Build query
  let query = adminClient
    .from('two_factor_audit_log')
    .select(`
      *,
      profile:profiles!two_factor_audit_log_profile_id_fkey(
        id,
        full_name,
        email
      )
    `, { count: 'exact' });

  // If user can't view all, restrict to their own logs
  if (!canViewAll) {
    query = query.eq('profile_id', user.id);
  } else if (profileId) {
    query = query.eq('profile_id', profileId);
  }

  // Apply filters
  if (action) {
    query = query.eq('action', action);
  }
  if (fromDate) {
    query = query.gte('created_at', fromDate);
  }
  if (toDate) {
    query = query.lte('created_at', toDate);
  }

  // Apply pagination and ordering
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return { data: [], total: 0, error: error.message };
  }

  return {
    data: data as TwoFactorAuditLogWithProfile[],
    total: count || 0,
    error: null,
  };
}

/**
 * Get recent 2FA activity for current user (summary)
 */
export async function getRecentTwoFactorActivity(): Promise<{
  data: {
    lastLogin: string | null;
    failedAttempts24h: number;
    backupCodesUsed: number;
    methodChanges: number;
  };
  error: string | null;
}> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return {
      data: {
        lastLogin: null,
        failedAttempts24h: 0,
        backupCodesUsed: 0,
        methodChanges: 0,
      },
      error: 'Not authenticated',
    };
  }

  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // Get last successful login
  const { data: lastLogin } = await adminClient
    .from('two_factor_audit_log')
    .select('created_at')
    .eq('profile_id', user.id)
    .eq('action', 'verified_login')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Get failed attempts in last 24 hours
  const { count: failedAttempts } = await adminClient
    .from('two_factor_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id)
    .eq('action', 'failed_login')
    .gte('created_at', twentyFourHoursAgo);

  // Get backup codes used
  const { count: backupCodesUsed } = await adminClient
    .from('two_factor_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id)
    .eq('action', 'backup_code_used');

  // Get method changes
  const { count: methodChanges } = await adminClient
    .from('two_factor_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id)
    .eq('action', 'method_changed');

  return {
    data: {
      lastLogin: lastLogin?.created_at || null,
      failedAttempts24h: failedAttempts || 0,
      backupCodesUsed: backupCodesUsed || 0,
      methodChanges: methodChanges || 0,
    },
    error: null,
  };
}

/**
 * Get 2FA audit log for a specific user (admin only)
 */
export async function getUserTwoFactorAuditLog(
  targetUserId: string,
  params: Omit<GetAuditLogParams, 'profileId'> = {}
): Promise<{
  data: TwoFactorAuditLogWithProfile[];
  total: number;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_VIEW_AUDIT_LOG);
  if (!auth.authorized) {
    return { data: [], total: 0, error: auth.error || 'Unauthorized' };
  }

  return getTwoFactorAuditLog({ ...params, profileId: targetUserId });
}
