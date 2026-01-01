'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { MessageTemplate, MessageTemplateWithCategory } from '@/types/database';

type TemplateResponse = {
  data: MessageTemplate | null;
  error: string | null;
};

type TemplatesResponse = {
  data: MessageTemplateWithCategory[];
  error: string | null;
};

/**
 * Get all active message templates
 */
export async function getMessageTemplates(categoryId?: string): Promise<TemplatesResponse> {
  const supabase = await createServerSupabaseClient();

  let query = supabase
    .from('message_templates')
    .select(
      `
      *,
      category:announcement_categories(id, name, slug, icon, color)
    `
    )
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (categoryId) {
    query = query.eq('category_id', categoryId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching templates:', error);
    return { data: [], error: error.message };
  }

  return { data: data as MessageTemplateWithCategory[], error: null };
}

/**
 * Get all templates including inactive (admin view)
 */
export async function getAllMessageTemplates(): Promise<TemplatesResponse> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES);
  if (!auth.authorized) {
    return { data: [], error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('message_templates')
    .select(
      `
      *,
      category:announcement_categories(id, name, slug, icon, color)
    `
    )
    .order('name', { ascending: true });

  if (error) {
    console.error('Error fetching templates:', error);
    return { data: [], error: error.message };
  }

  return { data: data as MessageTemplateWithCategory[], error: null };
}

/**
 * Get a single template by ID
 */
export async function getMessageTemplate(id: string): Promise<TemplateResponse> {
  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching template:', error);
    return { data: null, error: error.message };
  }

  return { data: data as MessageTemplate, error: null };
}

/**
 * Create a new message template
 */
export async function createMessageTemplate(input: {
  name: string;
  title_template: string;
  content_template: string;
  category_id?: string;
  variables?: Array<{ name: string; description?: string; required?: boolean }>;
}): Promise<TemplateResponse> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const insertData = {
    name: input.name,
    title_template: input.title_template,
    content_template: input.content_template,
    category_id: input.category_id || null,
    variables: input.variables || [],
    is_active: true,
    created_by: auth.userId,
  };

  const { data, error } = await supabase
    .from('message_templates')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating template:', error);
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'message_templates',
    entityId: data.id,
    entityDisplay: data.name,
    newValues: insertData,
    description: `Created message template: ${data.name}`,
  });

  return { data: data as MessageTemplate, error: null };
}

/**
 * Update a message template
 */
export async function updateMessageTemplate(
  id: string,
  input: Partial<{
    name: string;
    title_template: string;
    content_template: string;
    category_id: string | null;
    variables: Array<{ name: string; description?: string; required?: boolean }>;
    is_active: boolean;
  }>
): Promise<TemplateResponse> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch existing for audit
  const { data: existing } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { data: null, error: 'Template not found' };
  }

  const updateData: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updateData.name = input.name;
  if (input.title_template !== undefined) updateData.title_template = input.title_template;
  if (input.content_template !== undefined) updateData.content_template = input.content_template;
  if (input.category_id !== undefined) updateData.category_id = input.category_id;
  if (input.variables !== undefined) updateData.variables = input.variables;
  if (input.is_active !== undefined) updateData.is_active = input.is_active;

  const { data, error } = await supabase
    .from('message_templates')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating template:', error);
    return { data: null, error: error.message };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'message_templates',
    entityId: id,
    entityDisplay: data.name,
    oldValues: existing,
    newValues: updateData,
    description: `Updated message template: ${data.name}`,
  });

  return { data: data as MessageTemplate, error: null };
}

/**
 * Delete a message template (soft delete)
 */
export async function deleteMessageTemplate(id: string): Promise<{
  success: boolean;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_MANAGE_TEMPLATES);
  if (!auth.authorized) {
    return { success: false, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  const { error } = await supabase
    .from('message_templates')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    console.error('Error deleting template:', error);
    return { success: false, error: error.message };
  }

  await logAudit({
    action: 'DELETE',
    entityType: 'message_templates',
    entityId: id,
    description: `Deactivated message template`,
  });

  return { success: true, error: null };
}
