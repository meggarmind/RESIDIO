'use server';

import { createServerSupabaseClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { addToQueue } from '@/lib/notifications/queue';
import { buildAnnouncementWhatsApp } from '@/lib/whatsapp/outbound';
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

  // Deliver WhatsApp to the intended opted-in audience
  await deliverAnnouncementWhatsApp(supabase, data);

  return { data: data as Announcement, error: null };
}

type AnnouncementForDelivery = Pick<
  Announcement,
  'id' | 'title' | 'content' | 'summary' | 'target_audience' | 'target_houses'
>;

const ROLE_BY_AUDIENCE: Record<string, string[]> = {
  residents: ['resident_landlord', 'tenant', 'co_resident', 'household_member'],
  owners: ['resident_landlord', 'non_resident_landlord'],
  tenants: ['tenant'],
  staff: ['domestic_staff', 'caretaker'],
};

type AnnouncementSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

type ResidentRow = { id: string; resident_role: string };
type ResidentHouseRow = { resident_id: string };
type OptInRow = { resident_id: string; phone_number: string };

async function deliverAnnouncementWhatsApp(
  supabase: AnnouncementSupabase,
  announcement: AnnouncementForDelivery
) {
  const { data: optIns, error: optInError } = await supabase
    .from('whatsapp_optins')
    .select('resident_id, phone_number')
    .eq('opted_in', true);

  if (optInError || !optIns || optIns.length === 0) return;

  const uniqueByResident = new Map<string, OptInRow>();
  for (const row of optIns as OptInRow[]) {
    if (!uniqueByResident.has(row.resident_id)) {
      uniqueByResident.set(row.resident_id, row);
    }
  }

  const targetResidentIds = Array.from(uniqueByResident.keys());
  if (targetResidentIds.length === 0) return;

  let filteredIds = new Set(targetResidentIds);

  const { data: activeResidents } = await supabase
    .from('residents')
    .select('id, resident_role')
    .in('id', targetResidentIds)
    .eq('account_status', 'active');

  if (!activeResidents) {
    return;
  }

  const rows = activeResidents as ResidentRow[];
  filteredIds = new Set([...filteredIds].filter((id) => rows.some((r) => r.id === id)));

  const roleFilter = announcement.target_audience
    ? ROLE_BY_AUDIENCE[announcement.target_audience] || null
    : null;

  if (roleFilter) {
    const allowedRoles = new Set(roleFilter);
    filteredIds = new Set(
      [...filteredIds].filter((id) => {
        const resident = rows.find((r) => r.id === id);
        return resident ? allowedRoles.has(resident.resident_role) : false;
      }),
    );
  }

  if (announcement.target_houses && announcement.target_houses.length > 0 && filteredIds.size > 0) {
    const { data: assignments } = await supabase
      .from('resident_houses')
      .select('resident_id')
      .in('resident_id', [...filteredIds])
      .in('house_id', announcement.target_houses.map(String))
      .eq('is_active', true);

    if (assignments && assignments.length > 0) {
      const rows = assignments as ResidentHouseRow[];
      const inTargetHouse = new Set(rows.map((a) => a.resident_id));
      filteredIds = new Set([...filteredIds].filter((id) => inTargetHouse.has(id)));
    } else {
      filteredIds = new Set();
    }
  }

  let queued = 0;
  for (const resident_id of filteredIds) {
    const optIn = uniqueByResident.get(resident_id)!;
    const result = await addToQueue(
      buildAnnouncementWhatsApp({
        announcementId: announcement.id,
        residentId: resident_id,
        residentPhone: optIn.phone_number,
        title: announcement.title,
        content: announcement.content,
        summary: announcement.summary || undefined,
      }),
      { entityType: 'announcements', entityId: announcement.id, category: 'general' }
    );
    if (result.success) queued++;
  }

  if (queued > 0) {
    await logAudit({
      action: 'CREATE',
      entityType: 'announcements',
      entityId: announcement.id,
      entityDisplay: announcement.title,
      newValues: { whatsapp_queued: queued },
      description: `Queued ${queued} WhatsApp announcement(s) for delivery`,
    });
  }
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
