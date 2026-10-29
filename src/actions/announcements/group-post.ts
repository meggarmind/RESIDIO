'use server';

import { authorizeAnyPermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createGroupPostFacts } from '@/lib/announcements/group-post';

/**
 * Whether the announcement form may offer "Post to estate group" (#1328): WAHA is the active
 * provider and an estate group is set. Read-only; open to anyone who can draft an announcement.
 */
export async function getEstateGroupPostAvailability(): Promise<{ data: boolean | null; error: string | null }> {
  const auth = await authorizeAnyPermission([PERMISSIONS.ANNOUNCEMENTS_CREATE, PERMISSIONS.ANNOUNCEMENTS_UPDATE]);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const facts = createGroupPostFacts();
  const [resolved, groupId] = await Promise.all([facts.resolveConfig(), facts.getEstateGroupId()]);
  return { data: resolved.status === 'ok' && resolved.config.provider === 'waha' && groupId.length > 0, error: null };
}
