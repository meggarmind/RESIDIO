/**
 * Escalation State Management
 *
 * Manages escalation workflows for entities like invoices.
 * Tracks current escalation level and schedules next notifications.
 */

import { createAdminClient } from '@/lib/supabase/server';
import type { EscalationState } from './types';

/**
 * Get or create an escalation state for an entity
 */
export async function getOrCreateEscalationState(params: {
  entityType: string;
  entityId: string;
  residentId: string;
}): Promise<EscalationState | null> {
  const { entityType, entityId, residentId } = params;
  const supabase = createAdminClient();

  // Try to get existing state
  const { data: existing, error: fetchError } = await supabase
    .from('escalation_states')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('resident_id', residentId)
    .single();

  if (existing && !fetchError) {
    return existing as EscalationState;
  }

  // Create new state
  const { data: created, error: createError } = await supabase
    .from('escalation_states')
    .insert({
      entity_type: entityType,
      entity_id: entityId,
      resident_id: residentId,
      current_level: 0,
      is_resolved: false,
    })
    .select('*')
    .single();

  if (createError) {
    console.error('[Escalation] Failed to create state:', createError);
    return null;
  }

  return created as EscalationState;
}

/**
 * Advance the escalation level after sending a notification
 */
export async function advanceEscalation(params: {
  entityType: string;
  entityId: string;
  residentId: string;
  notificationId: string;
  nextScheduledAt?: Date;
}): Promise<{ success: boolean; newLevel: number; error?: string }> {
  const { entityType, entityId, residentId, notificationId, nextScheduledAt } = params;
  const supabase = createAdminClient();

  // Get current state
  const state = await getOrCreateEscalationState({ entityType, entityId, residentId });
  if (!state) {
    return { success: false, newLevel: 0, error: 'Failed to get or create escalation state' };
  }

  // Don't advance if already resolved
  if (state.is_resolved) {
    return {
      success: false,
      newLevel: state.current_level,
      error: 'Escalation already resolved',
    };
  }

  // Advance to next level
  const newLevel = state.current_level + 1;

  const { error } = await supabase
    .from('escalation_states')
    .update({
      current_level: newLevel,
      last_notification_id: notificationId,
      last_notified_at: new Date().toISOString(),
      next_scheduled_at: nextScheduledAt?.toISOString() || null,
    })
    .eq('id', state.id);

  if (error) {
    return { success: false, newLevel: state.current_level, error: error.message };
  }

  return { success: true, newLevel };
}

/**
 * Resolve an escalation (e.g., when payment is received)
 */
export async function resolveEscalation(params: {
  entityType: string;
  entityId: string;
  residentId: string;
  reason: string;
}): Promise<{ success: boolean; error?: string }> {
  const { entityType, entityId, residentId, reason } = params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('escalation_states')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_reason: reason,
      next_scheduled_at: null, // Clear any scheduled notifications
    })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('resident_id', residentId)
    .eq('is_resolved', false); // Only update if not already resolved

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Resolve all escalations for an entity (e.g., when invoice is fully paid)
 */
export async function resolveAllEscalationsForEntity(params: {
  entityType: string;
  entityId: string;
  reason: string;
}): Promise<{ success: boolean; resolved: number; error?: string }> {
  const { entityType, entityId, reason } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('escalation_states')
    .update({
      is_resolved: true,
      resolved_at: new Date().toISOString(),
      resolved_reason: reason,
      next_scheduled_at: null,
    })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('is_resolved', false)
    .select('id');

  if (error) {
    return { success: false, resolved: 0, error: error.message };
  }

  return { success: true, resolved: data?.length || 0 };
}

/**
 * Get escalation state for an entity
 */
export async function getEscalationState(params: {
  entityType: string;
  entityId: string;
  residentId: string;
}): Promise<EscalationState | null> {
  const { entityType, entityId, residentId } = params;
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('escalation_states')
    .select('*')
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('resident_id', residentId)
    .single();

  if (error) {
    return null;
  }

  return data as EscalationState;
}

/**
 * Get all active (unresolved) escalations for an entity type
 * Useful for finding overdue invoices needing escalation
 */
export async function getActiveEscalations(
  entityType: string,
  limit = 100
): Promise<EscalationState[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('escalation_states')
    .select('*')
    .eq('entity_type', entityType)
    .eq('is_resolved', false)
    .order('next_scheduled_at', { ascending: true, nullsFirst: false })
    .limit(limit);

  if (error) {
    console.error('[Escalation] Failed to fetch active escalations:', error);
    return [];
  }

  return (data as EscalationState[]) || [];
}

/**
 * Get escalations due for next notification
 */
export async function getDueEscalations(
  entityType?: string,
  limit = 50
): Promise<EscalationState[]> {
  const supabase = createAdminClient();
  const now = new Date().toISOString();

  let query = supabase
    .from('escalation_states')
    .select('*')
    .eq('is_resolved', false)
    .not('next_scheduled_at', 'is', null)
    .lte('next_scheduled_at', now)
    .order('next_scheduled_at', { ascending: true })
    .limit(limit);

  if (entityType) {
    query = query.eq('entity_type', entityType);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[Escalation] Failed to fetch due escalations:', error);
    return [];
  }

  return (data as EscalationState[]) || [];
}

/**
 * Schedule next escalation notification
 */
export async function scheduleNextEscalation(params: {
  entityType: string;
  entityId: string;
  residentId: string;
  nextScheduledAt: Date;
}): Promise<{ success: boolean; error?: string }> {
  const { entityType, entityId, residentId, nextScheduledAt } = params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('escalation_states')
    .update({
      next_scheduled_at: nextScheduledAt.toISOString(),
    })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('resident_id', residentId)
    .eq('is_resolved', false);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Get escalation history summary for an entity
 */
export async function getEscalationSummary(params: {
  entityType: string;
  entityId: string;
}): Promise<{
  states: Array<EscalationState & { residentName?: string }>;
  totalNotifications: number;
}> {
  const { entityType, entityId } = params;
  const supabase = createAdminClient();

  // Get all escalation states for this entity
  const { data: states, error: statesError } = await supabase
    .from('escalation_states')
    .select(`
      *,
      resident:residents(id, first_name, last_name)
    `)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .order('current_level', { ascending: false });

  if (statesError) {
    console.error('[Escalation] Failed to fetch summary:', statesError);
    return { states: [], totalNotifications: 0 };
  }

  // Calculate total notifications sent
  const totalNotifications = (states || []).reduce(
    (sum, s) => sum + (s.current_level || 0),
    0
  );

  // Transform data
  const transformedStates = (states || []).map((s) => ({
    ...s,
    residentName: s.resident
      ? `${s.resident.first_name} ${s.resident.last_name}`
      : undefined,
    resident: undefined, // Remove the raw relation
  }));

  return {
    states: transformedStates as Array<EscalationState & { residentName?: string }>,
    totalNotifications,
  };
}

/**
 * Reset escalation (e.g., for testing or when starting fresh)
 */
export async function resetEscalation(params: {
  entityType: string;
  entityId: string;
  residentId: string;
}): Promise<{ success: boolean; error?: string }> {
  const { entityType, entityId, residentId } = params;
  const supabase = createAdminClient();

  const { error } = await supabase
    .from('escalation_states')
    .update({
      current_level: 0,
      last_notification_id: null,
      last_notified_at: null,
      next_scheduled_at: null,
      is_resolved: false,
      resolved_at: null,
      resolved_reason: null,
    })
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('resident_id', residentId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
