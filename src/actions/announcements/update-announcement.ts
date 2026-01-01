'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { AnnouncementInput, Announcement } from '@/types/database';

type UpdateAnnouncementResponse = {
  data: Announcement | null;
  error: string | null;
};

/**
 * Update an existing announcement
 */
export async function updateAnnouncement(
  id: string,
  input: Partial<AnnouncementInput>
): Promise<UpdateAnnouncementResponse> {
  // Authorization check
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_UPDATE);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch existing announcement for audit
  const { data: existing } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { data: null, error: 'Announcement not found' };
  }

  // Prepare update data
  const updateData: Record<string, unknown> = {
    updated_by: auth.userId,
    updated_at: new Date().toISOString(),
  };

  // Only include fields that are provided
  if (input.title !== undefined) updateData.title = input.title;
  if (input.content !== undefined) updateData.content = input.content;
  if (input.summary !== undefined) updateData.summary = input.summary;
  if (input.category_id !== undefined) updateData.category_id = input.category_id;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.priority !== undefined) updateData.priority = input.priority;
  if (input.target_audience !== undefined) updateData.target_audience = input.target_audience;
  if (input.target_houses !== undefined) updateData.target_houses = input.target_houses;
  if (input.is_pinned !== undefined) updateData.is_pinned = input.is_pinned;
  if (input.scheduled_for !== undefined) updateData.scheduled_for = input.scheduled_for;
  if (input.expires_at !== undefined) updateData.expires_at = input.expires_at;
  if (input.attachment_urls !== undefined) updateData.attachment_urls = input.attachment_urls;

  const { data, error } = await supabase
    .from('announcements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating announcement:', error);
    return { data: null, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'UPDATE',
    entityType: 'announcements',
    entityId: id,
    entityDisplay: data.title,
    oldValues: existing,
    newValues: updateData,
    description: `Updated announcement: ${data.title}`,
  });

  return { data: data as Announcement, error: null };
}

/**
 * Archive an announcement
 */
export async function archiveAnnouncement(id: string): Promise<{
  data: Announcement | null;
  error: string | null;
}> {
  return updateAnnouncement(id, { status: 'archived' });
}
