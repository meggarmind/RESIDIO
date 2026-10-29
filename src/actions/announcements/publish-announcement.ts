'use server';

import { createAdminClient, createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { publishAnnouncementCore } from '@/lib/announcements/publish';
import { GROUP_POST_PERMISSION_REASON, wantsEstateGroupPost } from '@/lib/announcements/group-post-rules';
import type { Announcement } from '@/types/database';

type PublishResponse = {
  data: Announcement | null;
  error: string | null;
  /** Set when the announcement published but its estate group post failed (#1328). */
  groupPostError?: string | null;
};

/**
 * Publish an announcement immediately
 */
export async function publishAnnouncement(id: string): Promise<PublishResponse> {
  // Authorization check
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const result = await publishAnnouncementCore(supabase, id, auth.userId, createAdminClient(), {
    mayPostToGroup: async () => auth.permissions.includes(PERMISSIONS.ANNOUNCEMENTS_POST_TO_GROUP),
  });
  if (result.error !== null) {
    return { data: null, error: result.error };
  }
  const { data } = result;

  // Log audit event
  await logAudit({
    action: 'UPDATE',
    entityType: 'announcements',
    entityId: id,
    entityDisplay: data.title,
    oldValues: { status: result.previousStatus },
    newValues: { status: 'published', published_at: data.published_at },
    description: `Published announcement: ${data.title}`,
  });

  if (result.whatsappQueued > 0) {
    await logAudit({
      action: 'CREATE',
      entityType: 'announcements',
      entityId: data.id,
      entityDisplay: data.title,
      newValues: { whatsapp_queued: result.whatsappQueued },
      description: `Queued ${result.whatsappQueued} WhatsApp announcement(s) for delivery`,
    });
  }

  if (result.groupPost?.messageId) {
    await logAudit({
      action: 'CREATE',
      entityType: 'announcements',
      entityId: data.id,
      entityDisplay: data.title,
      newValues: { whatsapp_group_post: result.groupPost.messageId },
      description: `Posted announcement to the estate WhatsApp group: ${data.title}`,
    });
  }

  return { data, error: null, groupPostError: result.groupPost?.error ?? null };
}

/**
 * Schedule an announcement for future publication
 */
export async function scheduleAnnouncement(
  id: string,
  scheduledFor: string
): Promise<PublishResponse> {
  // Authorization check
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  // Validate scheduled time is in the future
  const scheduledDate = new Date(scheduledFor);
  if (scheduledDate <= new Date()) {
    return { data: null, error: 'Scheduled time must be in the future' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch existing announcement
  const { data: existing } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { data: null, error: 'Announcement not found' };
  }

  if (existing.status === 'published') {
    return { data: null, error: 'Cannot schedule an already published announcement' };
  }

  if (existing.status === 'archived') {
    return { data: null, error: 'Cannot schedule an archived announcement' };
  }

  // The cron publishes as the person who scheduled it, so they must be able to post to the group.
  if (wantsEstateGroupPost(existing) && !auth.permissions.includes(PERMISSIONS.ANNOUNCEMENTS_POST_TO_GROUP)) {
    return { data: null, error: GROUP_POST_PERMISSION_REASON };
  }

  const now = new Date().toISOString();
  const updateData = {
    status: 'scheduled' as const,
    scheduled_for: scheduledFor,
    updated_by: auth.userId,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('announcements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error scheduling announcement:', error);
    return { data: null, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'UPDATE',
    entityType: 'announcements',
    entityId: id,
    entityDisplay: data.title,
    oldValues: { status: existing.status, scheduled_for: existing.scheduled_for },
    newValues: { status: 'scheduled', scheduled_for: scheduledFor },
    description: `Scheduled announcement "${data.title}" for ${scheduledFor}`,
  });

  return { data: data as Announcement, error: null };
}

/**
 * Unpublish an announcement (move back to draft)
 */
export async function unpublishAnnouncement(id: string): Promise<PublishResponse> {
  // Authorization check
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_PUBLISH);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();

  // Fetch existing announcement
  const { data: existing } = await supabase
    .from('announcements')
    .select('*')
    .eq('id', id)
    .single();

  if (!existing) {
    return { data: null, error: 'Announcement not found' };
  }

  if (existing.status !== 'published' && existing.status !== 'scheduled') {
    return { data: null, error: 'Announcement is not published or scheduled' };
  }

  const now = new Date().toISOString();
  const updateData = {
    status: 'draft' as const,
    published_at: null,
    scheduled_for: null,
    updated_by: auth.userId,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from('announcements')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error unpublishing announcement:', error);
    return { data: null, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'UPDATE',
    entityType: 'announcements',
    entityId: id,
    entityDisplay: data.title,
    oldValues: { status: existing.status },
    newValues: { status: 'draft' },
    description: `Unpublished announcement: ${data.title}`,
  });

  return { data: data as Announcement, error: null };
}
