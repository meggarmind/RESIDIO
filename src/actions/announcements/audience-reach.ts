'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';
import {
  enumAudienceForRoles,
  listAudienceGroups,
  resolveGroupReach,
  type GroupDb,
} from '@/lib/announcements/audience-groups';
import type { TargetAudience } from '@/types/database';

// Read-only: the group table and view are service-role only, so these read with the admin client after the permission check.

/** Resident groups an announcement can target, with the enum audience stored beside the group slug. */
export async function getAnnouncementAudienceGroups(): Promise<{
  data: { slug: string; name: string; audience: TargetAudience }[] | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const { data, error } = await listAudienceGroups(createAdminClient() as unknown as GroupDb);
  if (error) {
    console.error('getAnnouncementAudienceGroups: resident_role_groups read failed', error);
    return { data: null, error };
  }
  return { data: data.map((g) => ({ slug: g.slug, name: g.name, audience: enumAudienceForRoles(g.roles) })), error: null };
}

/**
 * "Will reach N, M have WhatsApp opt-in" for a group audience (#1095).
 * shortcut: counts the whole group; target_houses (not settable in the form) is not applied, upgrade if the form gains a house picker.
 */
export async function getAnnouncementReach(groupSlug: string): Promise<{
  data: { reach: number; optedIn: number } | null;
  error: string | null;
}> {
  const auth = await authorizePermission(PERMISSIONS.ANNOUNCEMENTS_VIEW);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const result = await resolveGroupReach(createAdminClient() as unknown as GroupDb, groupSlug);
  if (result.error !== null) {
    console.error('getAnnouncementReach: group read failed', result.error);
    return { data: null, error: result.error };
  }
  return { data: { reach: result.reach, optedIn: result.optedIn }, error: null };
}
