'use server';

/**
 * Server Actions for Notification Schedules
 *
 * CRUD operations for notification schedules.
 */

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type {
  NotificationSchedule,
  ScheduleWithTemplate,
  CreateScheduleInput,
  UpdateScheduleInput,
} from '@/lib/notifications/types';

/**
 * Get all notification schedules
 */
export async function getSchedules(options?: {
  templateId?: string;
  activeOnly?: boolean;
}): Promise<{ data: ScheduleWithTemplate[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_schedules')
    .select(`
      *,
      template:notification_templates(*)
    `)
    .order('escalation_sequence')
    .order('name');

  if (options?.templateId) {
    query = query.eq('template_id', options.templateId);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ScheduleWithTemplate[], error: null };
}

/**
 * Get a single schedule by ID
 */
export async function getSchedule(
  id: string
): Promise<{ data: ScheduleWithTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_schedules')
    .select(`
      *,
      template:notification_templates(*)
    `)
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ScheduleWithTemplate, error: null };
}

/**
 * Get schedules by trigger type
 */
export async function getSchedulesByTrigger(
  triggerType: string,
  triggerValue?: number
): Promise<{ data: ScheduleWithTemplate[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_schedules')
    .select(`
      *,
      template:notification_templates(*)
    `)
    .eq('trigger_type', triggerType)
    .eq('is_active', true)
    .order('escalation_sequence');

  if (triggerValue !== undefined) {
    query = query.eq('trigger_value', triggerValue);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ScheduleWithTemplate[], error: null };
}

/**
 * Get schedules by event type
 */
export async function getSchedulesByEvent(
  eventType: string
): Promise<{ data: ScheduleWithTemplate[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_schedules')
    .select(`
      *,
      template:notification_templates(*)
    `)
    .eq('trigger_type', 'event')
    .eq('event_type', eventType)
    .eq('is_active', true)
    .order('escalation_sequence');

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ScheduleWithTemplate[], error: null };
}

/**
 * Create a new notification schedule
 */
export async function createSchedule(
  input: CreateScheduleInput
): Promise<{ data: NotificationSchedule | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_schedules')
    .insert({
      name: input.name,
      template_id: input.template_id,
      trigger_type: input.trigger_type,
      trigger_value: input.trigger_value || null,
      cron_expression: input.cron_expression || null,
      event_type: input.event_type || null,
      escalation_sequence: input.escalation_sequence ?? 0,
      parent_schedule_id: input.parent_schedule_id || null,
      conditions: input.conditions || null,
      is_active: input.is_active ?? true,
    })
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'notification_schedules',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: data,
  });

  return { data: data as NotificationSchedule, error: null };
}

/**
 * Update an existing notification schedule
 */
export async function updateSchedule(
  id: string,
  input: UpdateScheduleInput
): Promise<{ data: NotificationSchedule | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current schedule for audit
  const { data: oldSchedule } = await supabase
    .from('notification_schedules')
    .select('*')
    .eq('id', id)
    .single();

  if (!oldSchedule) {
    return { data: null, error: 'Schedule not found' };
  }

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (input.name !== undefined) updateData.name = input.name;
  if (input.template_id !== undefined) updateData.template_id = input.template_id;
  if (input.trigger_type !== undefined) updateData.trigger_type = input.trigger_type;
  if (input.trigger_value !== undefined) updateData.trigger_value = input.trigger_value;
  if (input.cron_expression !== undefined) updateData.cron_expression = input.cron_expression;
  if (input.event_type !== undefined) updateData.event_type = input.event_type;
  if (input.escalation_sequence !== undefined) updateData.escalation_sequence = input.escalation_sequence;
  if (input.parent_schedule_id !== undefined) updateData.parent_schedule_id = input.parent_schedule_id;
  if (input.conditions !== undefined) updateData.conditions = input.conditions;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  const { data, error } = await supabase
    .from('notification_schedules')
    .update(updateData)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'notification_schedules',
    entityId: id,
    entityDisplay: data.name,
    oldValues: oldSchedule,
    newValues: data,
  });

  return { data: data as NotificationSchedule, error: null };
}

/**
 * Delete a notification schedule
 */
export async function deleteSchedule(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get schedule for audit
  const { data: schedule } = await supabase
    .from('notification_schedules')
    .select('*')
    .eq('id', id)
    .single();

  if (!schedule) {
    return { success: false, error: 'Schedule not found' };
  }

  const { error } = await supabase
    .from('notification_schedules')
    .delete()
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'notification_schedules',
    entityId: id,
    entityDisplay: schedule.name,
    oldValues: schedule,
  });

  return { success: true, error: null };
}

/**
 * Toggle schedule active status
 */
export async function toggleScheduleActive(
  id: string
): Promise<{ data: NotificationSchedule | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current status
  const { data: schedule } = await supabase
    .from('notification_schedules')
    .select('is_active, name')
    .eq('id', id)
    .single();

  if (!schedule) {
    return { data: null, error: 'Schedule not found' };
  }

  // Toggle
  const newStatus = !schedule.is_active;
  const { data, error } = await supabase
    .from('notification_schedules')
    .update({ is_active: newStatus })
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Audit log
  await logAudit({
    action: newStatus ? 'ACTIVATE' : 'DEACTIVATE',
    entityType: 'notification_schedules',
    entityId: id,
    entityDisplay: data.name,
    oldValues: { is_active: !newStatus },
    newValues: { is_active: newStatus },
  });

  return { data: data as NotificationSchedule, error: null };
}

/**
 * Get escalation chain for a schedule
 */
export async function getEscalationChain(
  scheduleId: string
): Promise<{ data: ScheduleWithTemplate[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get the schedule to find parent or children
  const { data: schedule, error: scheduleError } = await supabase
    .from('notification_schedules')
    .select('*, template:notification_templates(*)')
    .eq('id', scheduleId)
    .single();

  if (scheduleError) {
    return { data: null, error: scheduleError.message };
  }

  // Find all schedules in the same chain
  // Either they share the same parent_schedule_id or one is the parent of another
  const rootId = schedule.parent_schedule_id || scheduleId;

  const { data, error } = await supabase
    .from('notification_schedules')
    .select(`
      *,
      template:notification_templates(*)
    `)
    .or(`id.eq.${rootId},parent_schedule_id.eq.${rootId}`)
    .order('escalation_sequence');

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as ScheduleWithTemplate[], error: null };
}
