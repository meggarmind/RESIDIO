'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';
import { getSettingValueAsService } from '@/lib/settings/service';
import { retentionDays } from '@/lib/whatsapp/retention';
import {
  DEFAULT_UNMATCHED_RETENTION_DAYS,
  ESTATE_GROUP_SETTING,
  UNMATCHED_RETENTION_SETTING,
} from '@/lib/whatsapp/group-sync';

/**
 * Estate group members whose number matches no resident record (#1327).
 * Read-only. The list holds phone numbers of people who are not residents, so it needs
 * `whatsapp.manage`, the same permission as the estate group setting.
 */

export type UnmatchedGroupMember = {
  id: string;
  /** E.164 number, or null while WAHA has not resolved a hidden id. */
  phone: string | null;
  role: string;
  firstSeen: string;
  lastSeen: string;
};

export type GroupMembersReport = {
  groupChosen: boolean;
  matchedCount: number;
  unmatched: UnmatchedGroupMember[];
  retentionDays: number;
};

type ActionResult<T> = { success: boolean; data: T | null; error: string | null };

type MemberRow = { id: string; phone: string | null; role: string; joined_at: string; last_seen_at: string };

export async function getUnmatchedGroupMembers(): Promise<ActionResult<GroupMembersReport>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const [groupId, retention] = await Promise.all([
    getSettingValueAsService(ESTATE_GROUP_SETTING),
    getSettingValueAsService(UNMATCHED_RETENTION_SETTING),
  ]);
  const days = retentionDays(retention, DEFAULT_UNMATCHED_RETENTION_DAYS, 365);
  if (typeof groupId !== 'string' || !groupId) {
    return { success: true, data: { groupChosen: false, matchedCount: 0, unmatched: [], retentionDays: days }, error: null };
  }

  // The generated types do not know whatsapp_group_members until its migration is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const members = () => (createAdminClient() as unknown as { from: (table: string) => any }).from('whatsapp_group_members');
  const [unmatched, matched] = await Promise.all([
    members()
      .select('id, phone, role, joined_at, last_seen_at')
      .eq('group_id', groupId)
      .is('left_at', null)
      .is('resident_id', null)
      .order('joined_at', { ascending: true }),
    members()
      .select('id', { count: 'exact', head: true })
      .eq('group_id', groupId)
      .is('left_at', null)
      .not('resident_id', 'is', null),
  ]);
  if (unmatched.error || matched.error) {
    console.error('[group-members-report] Could not load group members:', unmatched.error ?? matched.error);
    return { success: false, data: null, error: 'Failed to load the estate group members' };
  }

  return {
    success: true,
    data: {
      groupChosen: true,
      matchedCount: matched.count || 0,
      unmatched: ((unmatched.data || []) as MemberRow[]).map((row) => ({
        id: row.id,
        phone: row.phone,
        role: row.role,
        firstSeen: row.joined_at,
        lastSeen: row.last_seen_at,
      })),
      retentionDays: days,
    },
    error: null,
  };
}
