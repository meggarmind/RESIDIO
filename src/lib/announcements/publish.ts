import type { createServerSupabaseClient } from '@/lib/supabase/server';
import { addToQueue } from '@/lib/notifications/queue';
import { buildAnnouncementWhatsApp } from '@/lib/whatsapp/outbound';
import { resolveGroupReach, type GroupDb } from '@/lib/announcements/audience-groups';
import type { Announcement } from '@/types/database';

/**
 * Publishing core shared by the `publishAnnouncement` action and the publish-announcements cron
 * (#876). NOT a server action (no 'use server'), so clients cannot call it. It neither checks a
 * permission nor writes an audit entry: the action does both with the session client, and the cron
 * passes the admin client and is recorded by its System Action Log row.
 */
export type AnnouncementSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

export type PublishAnnouncementCoreResult =
  | { data: Announcement; previousStatus: string; whatsappQueued: number; error: null }
  | { data: null; error: string };

export async function publishAnnouncementCore(
  supabase: AnnouncementSupabase,
  id: string,
  updatedBy: string | null,
  // whatsapp_optins is closed to logged-in users, so the manual action passes the admin client here.
  deliverySupabase: AnnouncementSupabase = supabase
): Promise<PublishAnnouncementCoreResult> {
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
    // A system publish leaves updated_by as the last person who edited it.
    ...(updatedBy ? { updated_by: updatedBy } : {}),
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

  // Deliver WhatsApp to the intended opted-in audience
  const whatsappQueued = await deliverAnnouncementWhatsApp(deliverySupabase, data);

  return { data: data as Announcement, previousStatus: existing.status, whatsappQueued, error: null };
}

type AnnouncementForDelivery = Pick<
  Announcement,
  'id' | 'title' | 'content' | 'summary' | 'target_audience' | 'target_houses'
> & { target_group_slug?: string | null };

// Enum audiences only. A group audience (target_group_slug, #1095) reads its roles from resident_role_groups.
const ROLE_BY_AUDIENCE: Record<string, string[]> = {
  residents: ['resident_landlord', 'tenant', 'co_resident', 'household_member'],
  owners: ['resident_landlord', 'non_resident_landlord'],
  tenants: ['tenant'],
  staff: ['domestic_staff', 'caretaker'],
};

type ResidentRow = { id: string; resident_role: string };
type ResidentHouseRow = { resident_id: string };
type OptInRow = { resident_id: string; phone_number: string };

async function deliverAnnouncementWhatsApp(
  supabase: AnnouncementSupabase,
  announcement: AnnouncementForDelivery
): Promise<number> {
  let uniqueByResident: Map<string, { phone_number: string }>;
  let filteredIds: Set<string>;

  if (announcement.target_group_slug) {
    // A person in several of the group's roles is one member, so they are queued once.
    const reach = await resolveGroupReach(supabase as unknown as GroupDb, announcement.target_group_slug);
    if (reach.error !== null) {
      console.error('deliverAnnouncementWhatsApp: resident group read failed', reach.error);
      return 0;
    }
    uniqueByResident = reach.optIns;
    filteredIds = new Set(reach.optIns.keys());
  } else {
    const { data: optIns, error: optInError } = await supabase
      .from('whatsapp_optins')
      .select('resident_id, phone_number')
      .eq('opted_in', true)
      .is('deactivated_at', null);

    if (optInError || !optIns || optIns.length === 0) return 0;

    uniqueByResident = new Map<string, OptInRow>();
    for (const row of optIns as OptInRow[]) {
      if (!uniqueByResident.has(row.resident_id)) {
        uniqueByResident.set(row.resident_id, row);
      }
    }

    const targetResidentIds = Array.from(uniqueByResident.keys());
    if (targetResidentIds.length === 0) return 0;

    filteredIds = new Set(targetResidentIds);

    const { data: activeResidents } = await supabase
      .from('residents')
      .select('id, resident_role')
      .in('id', targetResidentIds)
      .eq('account_status', 'active');

    if (!activeResidents) {
      return 0;
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

  return queued;
}
