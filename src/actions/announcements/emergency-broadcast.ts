'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createNotificationsForAllResidents } from '@/actions/in-app-notifications/create-notification';
import type { Announcement } from '@/types/database';

export interface EmergencyBroadcastInput {
  title: string;
  content: string;
  summary?: string;
}

type EmergencyBroadcastResponse = {
  data: {
    announcement: Announcement;
    notificationCount: number;
  } | null;
  error: string | null;
};

/**
 * Send an emergency broadcast to all residents
 * - Creates an announcement with emergency priority, published immediately
 * - Sends in-app notification to all active residents
 * Requires announcements.emergency_broadcast permission
 */
export async function sendEmergencyBroadcast(
  input: EmergencyBroadcastInput
): Promise<EmergencyBroadcastResponse> {
  // Authorization check - requires emergency broadcast permission
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_EMERGENCY_BROADCAST);
  if (!auth.authorized) {
    return { data: null, error: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  // Create the emergency announcement
  const insertData = {
    title: input.title,
    content: input.content,
    summary: input.summary || null,
    category_id: null, // Emergency broadcasts don't need a category
    status: 'published' as const,
    priority: 'emergency' as const,
    target_audience: 'all' as const,
    target_houses: null,
    is_pinned: true, // Emergency broadcasts are always pinned
    published_at: now,
    scheduled_for: null,
    expires_at: null,
    attachment_urls: null,
    created_by: auth.userId,
    updated_by: auth.userId,
  };

  const { data: announcement, error: announcementError } = await supabase
    .from('announcements')
    .insert(insertData)
    .select()
    .single();

  if (announcementError) {
    console.error('Error creating emergency broadcast:', announcementError);
    return { data: null, error: announcementError.message };
  }

  // Send in-app notification to all residents
  const { count: notificationCount, error: notificationError } =
    await createNotificationsForAllResidents({
      title: `🚨 ${input.title}`,
      body: input.summary || input.content.substring(0, 200) + (input.content.length > 200 ? '...' : ''),
      icon: 'alert-triangle',
      category: 'emergency',
      entity_type: 'announcement',
      entity_id: announcement.id,
      action_url: `/announcements/${announcement.id}`,
      priority: 'urgent',
      metadata: {
        is_emergency: true,
        broadcast_at: now,
      },
    });

  if (notificationError) {
    console.error('Error sending emergency notifications:', notificationError);
    // Don't fail the entire operation - announcement was created
  }

  // Log audit event
  await logAudit({
    action: 'CREATE',
    entityType: 'announcements',
    entityId: announcement.id,
    entityDisplay: announcement.title,
    newValues: {
      ...insertData,
      notification_count: notificationCount,
    },
    description: `Emergency broadcast sent: "${announcement.title}" to ${notificationCount} residents`,
  });

  return {
    data: {
      announcement: announcement as Announcement,
      notificationCount,
    },
    error: null,
  };
}
