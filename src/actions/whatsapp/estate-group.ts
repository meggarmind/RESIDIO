'use server';

import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveWhatsAppConfig } from '@/lib/whatsapp';
import { ESTATE_GROUP_SETTING } from '@/lib/whatsapp/group-sync';
import { listWahaGroups, type WahaGroup } from '@/lib/whatsapp/providers/waha';

/**
 * The estate WhatsApp group setting (#1325). Reads and writes need
 * `whatsapp.manage`: the group list comes from WAHA, and the page shows the
 * picker only to a user who can save it.
 */

type ActionResult<T> = { success: boolean; data: T | null; error: string | null };

const NOT_WAHA = 'The estate group needs WAHA as the active WhatsApp provider.';
const GROUP_ID_PATTERN = /^[^@\s]+@g\.us$/;

export type EstateGroupSelection = { wahaActive: boolean; groupId: string };

export async function getEstateGroupSelection(): Promise<ActionResult<EstateGroupSelection>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const [resolved, setting] = await Promise.all([
    resolveWhatsAppConfig(),
    createAdminClient().from('system_settings').select('value').eq('key', ESTATE_GROUP_SETTING).maybeSingle(),
  ]);
  if (setting.error) return { success: false, data: null, error: 'Failed to load the estate group' };
  const value = setting.data?.value;
  return {
    success: true,
    data: {
      wahaActive: resolved.status === 'ok' && resolved.config.provider === 'waha',
      groupId: typeof value === 'string' ? value : '',
    },
    error: null,
  };
}

export async function listEstateGroups(): Promise<ActionResult<WahaGroup[]>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const resolved = await resolveWhatsAppConfig();
  if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') {
    return { success: false, data: null, error: NOT_WAHA };
  }
  try {
    return { success: true, data: await listWahaGroups(resolved.config), error: null };
  } catch (error) {
    // The message names an HTTP status or a timeout, never the API key.
    console.error('[estate-group] Could not list WAHA groups:', error);
    return { success: false, data: null, error: 'Could not read the groups from WAHA. Check the connection and try again.' };
  }
}

/** Saves the chosen group. An empty id clears the setting. */
export async function saveEstateGroup(groupId: string): Promise<{ success: boolean; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, error: authorization.error || 'Unauthorized' };

  const id = groupId.trim();
  if (id && !GROUP_ID_PATTERN.test(id)) return { success: false, error: 'Not a WhatsApp group id' };
  if (id) {
    const resolved = await resolveWhatsAppConfig();
    if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') return { success: false, error: NOT_WAHA };
  }

  const supabase = createAdminClient();
  const { data: before } = await supabase.from('system_settings').select('value').eq('key', ESTATE_GROUP_SETTING).maybeSingle();
  const { data, error } = await supabase
    .from('system_settings')
    .upsert({ key: ESTATE_GROUP_SETTING, value: id, category: 'notifications' }, { onConflict: 'key' })
    .select('id')
    .single();
  if (error || !data) return { success: false, error: 'Failed to save the estate group' };

  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: data.id,
    entityDisplay: 'WhatsApp estate group',
    oldValues: { [ESTATE_GROUP_SETTING]: before?.value ?? '' },
    newValues: { [ESTATE_GROUP_SETTING]: id },
  });
  revalidatePath('/settings/whatsapp');
  return { success: true, error: null };
}
