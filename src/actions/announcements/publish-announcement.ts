'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { Announcement } from '@/types/database';

type PublishResponse = {
  data: Announcement | null;
  error: string | null;
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
    return { data: null, error: 'Announcement is already published' };
  }

  if (existing.status === 'archived') {
    return { data: null, error: 'Cannot publish an archived announcement' };
  }

  const now = new Date().toISOString();
  const updateData = {
    status: 'published' as const,
    published_at: now,
    scheduled_for: null, // Clear scheduled time since we're publishing now
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
    console.error('Error publishing announcement:', error);
    return { data: null, error: error.message };
  }

  // Log audit event
  await logAudit({
    action: 'UPDATE',
    entityType: 'announcements',
    entityId: id,
    entityDisplay: data.title,
    oldValues: { status: existing.status },
    newValues: { status: 'published', published_at: now },
    description: `Published announcement: ${data.title}`,
  });

  return { data: data as Announcement, error: null };
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
