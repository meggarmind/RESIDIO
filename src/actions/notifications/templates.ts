'use server';

/**
 * Server Actions for Notification Templates
 *
 * CRUD operations for notification templates.
 */

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { logAudit } from '@/lib/audit/logger';
import type {
  NotificationTemplate,
  CreateTemplateInput,
  UpdateTemplateInput,
} from '@/lib/notifications/types';

/**
 * Get all notification templates
 */
export async function getTemplates(options?: {
  category?: string;
  channel?: string;
  activeOnly?: boolean;
}): Promise<{ data: NotificationTemplate[] | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('notification_templates')
    .select('*')
    .order('category')
    .order('display_name');

  if (options?.category) {
    query = query.eq('category', options.category);
  }

  if (options?.channel) {
    query = query.eq('channel', options.channel);
  }

  if (options?.activeOnly) {
    query = query.eq('is_active', true);
  }

  const { data, error } = await query;

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as NotificationTemplate[], error: null };
}

/**
 * Get a single template by ID
 */
export async function getTemplate(
  id: string
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as NotificationTemplate, error: null };
}

/**
 * Get a template by name
 */
export async function getTemplateByName(
  name: string
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('name', name)
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  return { data: data as NotificationTemplate, error: null };
}

/**
 * Create a new notification template
 */
export async function createTemplate(
  input: CreateTemplateInput
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      name: input.name,
      display_name: input.display_name,
      category: input.category,
      channel: input.channel,
      subject_template: input.subject_template || null,
      body_template: input.body_template,
      html_template: input.html_template || null,
      variables: input.variables || [],
      is_active: input.is_active ?? true,
      is_system: false, // User-created templates are not system templates
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'notification_templates',
    entityId: data.id,
    entityDisplay: data.display_name,
    newValues: data,
  });

  return { data: data as NotificationTemplate, error: null };
}

/**
 * Update an existing notification template
 */
export async function updateTemplate(
  id: string,
  input: UpdateTemplateInput
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current template for audit
  const { data: oldTemplate } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (!oldTemplate) {
    return { data: null, error: 'Template not found' };
  }

  // Build update object
  const updateData: Record<string, unknown> = {};
  if (input.display_name !== undefined) updateData.display_name = input.display_name;
  if (input.category !== undefined) updateData.category = input.category;
  if (input.channel !== undefined) updateData.channel = input.channel;
  if (input.subject_template !== undefined) updateData.subject_template = input.subject_template;
  if (input.body_template !== undefined) updateData.body_template = input.body_template;
  if (input.html_template !== undefined) updateData.html_template = input.html_template;
  if (input.variables !== undefined) updateData.variables = input.variables;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  const { data, error } = await supabase
    .from('notification_templates')
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
    entityType: 'notification_templates',
    entityId: id,
    entityDisplay: data.display_name,
    oldValues: oldTemplate,
    newValues: data,
  });

  return { data: data as NotificationTemplate, error: null };
}

/**
 * Delete a notification template
 */
export async function deleteTemplate(
  id: string
): Promise<{ success: boolean; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get template for audit and system check
  const { data: template } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (!template) {
    return { success: false, error: 'Template not found' };
  }

  // Don't allow deleting system templates
  if (template.is_system) {
    return { success: false, error: 'Cannot delete system templates' };
  }

  const { error } = await supabase
    .from('notification_templates')
    .delete()
    .eq('id', id);

  if (error) {
    return { success: false, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'notification_templates',
    entityId: id,
    entityDisplay: template.display_name,
    oldValues: template,
  });

  return { success: true, error: null };
}

/**
 * Toggle template active status
 */
export async function toggleTemplateActive(
  id: string
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get current status
  const { data: template } = await supabase
    .from('notification_templates')
    .select('is_active, display_name')
    .eq('id', id)
    .single();

  if (!template) {
    return { data: null, error: 'Template not found' };
  }

  // Toggle
  const newStatus = !template.is_active;
  const { data, error } = await supabase
    .from('notification_templates')
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
    entityType: 'notification_templates',
    entityId: id,
    entityDisplay: data.display_name,
    oldValues: { is_active: !newStatus },
    newValues: { is_active: newStatus },
  });

  return { data: data as NotificationTemplate, error: null };
}

/**
 * Duplicate a template
 */
export async function duplicateTemplate(
  id: string,
  newName: string
): Promise<{ data: NotificationTemplate | null; error: string | null }> {
  const supabase = await createServerSupabaseClient();

  // Get original template
  const { data: original } = await supabase
    .from('notification_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (!original) {
    return { data: null, error: 'Template not found' };
  }

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: 'Not authenticated' };
  }

  // Create copy
  const { data, error } = await supabase
    .from('notification_templates')
    .insert({
      name: newName,
      display_name: `${original.display_name} (Copy)`,
      category: original.category,
      channel: original.channel,
      subject_template: original.subject_template,
      body_template: original.body_template,
      html_template: original.html_template,
      variables: original.variables,
      is_active: false, // Start as inactive
      is_system: false, // Copies are never system templates
      created_by: user.id,
    })
    .select('*')
    .single();

  if (error) {
    return { data: null, error: error.message };
  }

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'notification_templates',
    entityId: data.id,
    entityDisplay: data.display_name,
    newValues: data,
    metadata: { duplicatedFrom: id },
  });

  return { data: data as NotificationTemplate, error: null };
}
