'use server';

import { authorizeAnyPermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { createAdminClient } from '@/lib/supabase/server';
import { loadRecipientGroups, type RecipientGroup } from '@/lib/groups/recipient-groups';

/**
 * The groups the "Clearance certificate copies" card on Settings > Billing offers, with each member's
 * warning (no WhatsApp number, not opted in) (#816 decisions 19, 23). Whoever may change the setting
 * may read the list, without also needing the Groups permission.
 */
export async function getClearanceCopyOptions(): Promise<{ data: RecipientGroup[] | null; error: string | null }> {
  const auth = await authorizeAnyPermission([PERMISSIONS.SETTINGS_MANAGE_BILLING, PERMISSIONS.BILLING_MANAGE_PROFILES, PERMISSIONS.GROUPS_VIEW]);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };
  const { data, error } = await loadRecipientGroups(createAdminClient());
  return error ? { data: null, error } : { data, error: null };
}
