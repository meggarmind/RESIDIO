'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { AnnouncementInput, Announcement } from '@/types/database';

type CreateAnnouncementResponse = {
  data: Announcement | null;
  error: string | null;
};

/**
 * Create a new announcement
 */
export async function createAnnouncement(
  input: AnnouncementInput
): Promise<CreateAnnouncementResponse> {
  // Authorization check
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_CREATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Prepare insert data
  const insertData = {
    title: input.title,
    content: input.content,
    summary: input.summary || null,
    category_id: input.category_id || null,
    status: input.status || 'draft',
    priority: input.priority || 'normal',
    target_audience: input.target_audience || 'all',
    target_houses: input.target_houses || null,
    is_pinned: input.is_pinned || false,
    scheduled_for: input.scheduled_for || null,
    expires_at: input.expires_at || null,
    attachment_urls: input.attachment_urls || null,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data, error } = await supabase
    .from('announcements')
    .insert(insertData)
    .select()
    .single();

  if (error) {
    console.error('Error creating announcement:', error);
    return { data: null, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'CREATE',
    entityType: 'announcements',
    entityId: data.id,
    entityDisplay: data.title,
    newValues: insertData,
    description: `Created announcement: ${data.title}`,
  });

  return { data: data as Announcement, error: null };
}

/**
 * Create announcement from a template
 */
export async function createAnnouncementFromTemplate(
  templateId: string,
  variables: Record<string, string>,
  overrides?: Partial<AnnouncementInput>
): Promise<CreateAnnouncementResponse> {
  // Authorization check
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_CREATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch template
  const { data: template, error: templateError } = await supabase
    .from('message_templates')
    .select('*')
    .eq('id', templateId)
    .single();

  if (templateError || !template) {
    return { data: null, error: 'Template not found' };
  }

  // Replace variables in title and content
  let title = template.title_template;
  let content = template.content_template;

  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    title = title.replace(new RegExp(placeholder, 'g'), value);
    content = content.replace(new RegExp(placeholder, 'g'), value);
  }

  // Create announcement with template data
  const input: AnnouncementInput = {
    title,
    content,
    category_id: template.category_id,
    ...overrides,
  };

  return createAnnouncement(input);
}
