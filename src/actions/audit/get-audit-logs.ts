'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { sanitizeSearchInput } from '@/lib/utils';
import type { AuditLogWithActor, AuditAction, AuditEntityType } from '@/types/database';

type GetAuditLogsParams = {
  entityType?: AuditEntityType;
  entityId?: string;
  action?: AuditAction;
  actorId?: string;
  startDate?: string;
  endDate?: string;
  search?: string;
  page?: number;
  limit?: number;
}

type GetAuditLogsResponse = {
  data: AuditLogWithActor[] | null;
  total: number;
  error: string | null;
}

/**
 * Get audit logs with filtering and pagination.
 * Only accessible to roles holding `settings.view_audit_logs` (super_admin,
 * vice_chairman — per ADR-0006, chairman does not read audit logs).
 */
export async function getAuditLogs(
  params: GetAuditLogsParams = {}
): Promise<GetAuditLogsResponse> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS);
  if (!auth.authorized) {
    return { data: null, total: 0, error: auth.error || 'Insufficient permissions' };
  }

  const supabase = await createServerSupabaseClient();

  const {
    entityType,
    entityId,
    action,
    actorId,
    startDate,
    endDate,
    search,
    page = 1,
    limit = 50,
  } = params;

  // Build query with actor profile join (LEFT JOIN to handle null actors).
  // The actor's role comes from the RBAC join, not the legacy `profiles.role`
  // column that #193 renamed out of existence. `audit_logs` has a single
  // foreign key to `profiles` (audit_logs_actor_id_fkey), so the outer embed
  // needs no hint; `profiles` -> `app_roles` is hinted explicitly, matching
  // src/middleware.ts.
  let query = supabase
    .from('audit_logs')
    .select(`
      *,
      actor:profiles(id, full_name, email, app_roles!profiles_role_id_fkey(name))
    `, { count: 'exact' });

  // Apply filters
  if (entityType) query = query.eq('entity_type', entityType);
  if (entityId) query = query.eq('entity_id', entityId);
  if (action) query = query.eq('action', action);
  if (actorId) query = query.eq('actor_id', actorId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);
  if (search) {
    const sanitized = sanitizeSearchInput(search);
    query = query.or(`entity_display.ilike.%${sanitized}%,description.ilike.%${sanitized}%`);
  }

  // Pagination (ordered by most recent first)
  const offset = (page - 1) * limit;
  query = query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  const { data, count, error } = await query;

  if (error) {
    return { data: null, total: 0, error: error.message };
  }

  return {
    data: data as AuditLogWithActor[],
    total: count || 0,
    error: null,
  };
}

/**
 * Get audit logs for a specific entity.
 * Useful for showing audit history on entity detail pages.
 */
export async function getEntityAuditLogs(
  entityType: AuditEntityType,
  entityId: string,
  limit: number = 10
): Promise<{ data: AuditLogWithActor[] | null; error: string | null }> {
  const result = await getAuditLogs({
    entityType,
    entityId,
    limit,
  });

  return { data: result.data, error: result.error };
}

/**
 * Get audit statistics for dashboard display.
 * Returns counts of audit events for different time periods.
 */
export async function getAuditStats(): Promise<{
  data: { today: number; thisWeek: number; thisMonth: number } | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Insufficient permissions' };
  }

  const supabase = await createServerSupabaseClient();

  const now = new Date();

  // Start of today (midnight)
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

  // Start of this week (Sunday)
  const dayOfWeek = now.getDay();
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).toISOString();

  // Start of this month (1st day)
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [todayResult, weekResult, monthResult] = await Promise.all([
    supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', startOfDay),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', startOfWeek),
    supabase.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
  ]);

  return {
    data: {
      today: todayResult.count || 0,
      thisWeek: weekResult.count || 0,
      thisMonth: monthResult.count || 0,
    },
    error: null,
  };
}

/**
 * Get all actors who have audit log entries.
 * Useful for populating actor filter dropdown.
 */
export async function getAuditActors(): Promise<{
  data: Array<{ id: string; full_name: string; email: string }> | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_VIEW_AUDIT_LOGS);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Insufficient permissions' };
  }

  const supabase = await createServerSupabaseClient();

  // Get distinct actor IDs from audit logs, then fetch their profiles
  const { data: actorIds, error: actorError } = await supabase
    .from('audit_logs')
    .select('actor_id')
    .order('actor_id');

  if (actorError) {
    return { data: null, error: actorError.message };
  }

  // Get unique actor IDs
  const uniqueActorIds = [...new Set(actorIds?.map(a => a.actor_id) || [])];

  if (uniqueActorIds.length === 0) {
    return { data: [], error: null };
  }

  // Fetch profiles for these actors
  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', uniqueActorIds)
    .order('full_name');

  if (profileError) {
    return { data: null, error: profileError.message };
  }

  return { data: profiles, error: null };
}
