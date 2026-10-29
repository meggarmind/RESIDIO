import type { createServerSupabaseClient } from '@/lib/supabase/server';
import { addToQueue } from '@/lib/notifications/queue';
import { buildAnnouncementWhatsApp } from '@/lib/whatsapp/outbound';
import { resolveGroupReach, type GroupDb } from '@/lib/announcements/audience-groups';
import {
  checkEstateGroupPost,
  createGroupPostFacts,
  sendEstateGroupPost,
  type EstateGroupTarget,
  type GroupPostFacts,
} from '@/lib/announcements/group-post';
import {
  announcementGroupText,
  GROUP_POST_PERMISSION_REASON,
  wantsEstateGroupPost,
} from '@/lib/announcements/group-post-rules';
import type { Announcement } from '@/types/database';

/**
 * Publishing core shared by the `publishAnnouncement` action and the publish-announcements cron
 * (#876). NOT a server action (no 'use server'), so clients cannot call it. It neither checks a
 * permission nor writes an audit entry: the action does both with the session client, and the cron
 * passes the admin client and is recorded by its System Action Log row.
 */
export type AnnouncementSupabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

/** The estate group post made on publish (#1328): null when the announcement has no tick. */
export type GroupPostOutcome = { messageId: string; error: null } | { messageId: null; error: string } | null;

export type PublishAnnouncementCoreResult =
  | { data: Announcement; previousStatus: string; whatsappQueued: number; groupPost: GroupPostOutcome; error: null }
  | { data: null; error: string };

export interface GroupPostOptions {
  /** Whether the publisher holds `announcements.post_to_group`. Omitted means no (fail closed). */
  mayPostToGroup?: () => Promise<boolean>;
  facts?: GroupPostFacts;
}

export async function publishAnnouncementCore(
  supabase: AnnouncementSupabase,
  id: string,
  updatedBy: string | null,
  // whatsapp_optins is closed to logged-in users, so the manual action passes the admin client here.
  deliverySupabase: AnnouncementSupabase = supabase,
  groupPostOptions: GroupPostOptions = {}
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

  // Every group check runs before the status changes, so a refusal leaves the announcement unpublished.
  const groupFacts = groupPostOptions.facts ?? createGroupPostFacts();
  let groupTarget: EstateGroupTarget | null = null;
  if (wantsEstateGroupPost(existing)) {
    if (!(await (groupPostOptions.mayPostToGroup?.() ?? false))) {
      return { data: null, error: GROUP_POST_PERMISSION_REASON };
    }
    const check = await checkEstateGroupPost(groupFacts);
    if (!check.ok) return { data: null, error: check.error };
    groupTarget = check.target;
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

  let groupPost: GroupPostOutcome = null;
  if (groupTarget) {
    groupPost = await sendEstateGroupPost(groupTarget, announcementGroupText(data), groupFacts);
    if (groupPost.error !== null) {
      console.error('publishAnnouncementCore: estate group post failed', { id, error: groupPost.error });
    }
  }

  return { data: data as Announcement, previousStatus: existing.status, whatsappQueued, groupPost, error: null };
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

type ResidentRow = { id: string };
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

    if (optInError) {
      console.error('deliverAnnouncementWhatsApp: opt-in read failed', optInError);
      return 0;
    }
    if (!optIns || optIns.length === 0) return 0;

    uniqueByResident = new Map<string, OptInRow>();
    for (const row of optIns as OptInRow[]) {
      if (!uniqueByResident.has(row.resident_id)) {
        uniqueByResident.set(row.resident_id, row);
      }
    }

    const targetResidentIds = Array.from(uniqueByResident.keys());
    if (targetResidentIds.length === 0) return 0;

    filteredIds = new Set(targetResidentIds);

    const { data: activeResidents, error: residentError } = await supabase
      .from('residents')
      .select('id')
      .in('id', targetResidentIds)
      .eq('account_status', 'active');

    if (residentError || !activeResidents) {
      console.error('deliverAnnouncementWhatsApp: resident read failed', residentError);
      return 0;
    }

    const activeIds = new Set((activeResidents as ResidentRow[]).map((r) => r.id));
    filteredIds = new Set([...filteredIds].filter((id) => activeIds.has(id)));

    const roleFilter = announcement.target_audience
      ? ROLE_BY_AUDIENCE[announcement.target_audience] || null
      : null;

    if (roleFilter && filteredIds.size > 0) {
      // The role lives on the house assignment, not on residents.
      const { data: roleRows, error: roleError } = await supabase
        .from('resident_houses')
        .select('resident_id, resident_role')
        .in('resident_id', [...filteredIds])
        .in('resident_role', roleFilter)
        .eq('is_active', true);

      if (roleError || !roleRows) {
        console.error('deliverAnnouncementWhatsApp: resident role read failed', roleError);
        return 0;
      }
      const withRole = new Set((roleRows as ResidentHouseRow[]).map((r) => r.resident_id));
      filteredIds = new Set([...filteredIds].filter((id) => withRole.has(id)));
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
