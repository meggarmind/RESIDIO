'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
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
 * Only accessible to admin and chairman roles.
 */
export async function getAuditLogs(
  params: GetAuditLogsParams = {}
): Promise<GetAuditLogsResponse> {
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, total: 0, error: 'Unauthorized' };
  }

  // Check role (only admin/chairman can view audit logs)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'chairman'].includes(profile.role)) {
    return { data: null, total: 0, error: 'Insufficient permissions' };
  }

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

  // Build query with actor profile join (LEFT JOIN to handle null actors)
  let query = supabase
    .from('audit_logs')
    .select(`
      *,
      actor:profiles(id, full_name, email, role)
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
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'chairman'].includes(profile.role)) {
    return { data: null, error: 'Insufficient permissions' };
  }

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
  const supabase = await createServerSupabaseClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Unauthorized' };
  }

  // Check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();

  if (!profile || !['admin', 'chairman'].includes(profile.role)) {
    return { data: null, error: 'Insufficient permissions' };
  }

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
