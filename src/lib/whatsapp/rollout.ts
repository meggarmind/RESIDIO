import type { SupabaseClient } from '@supabase/supabase-js';
import { getSettingResultAsService } from '@/lib/settings/service';
import { createAdminClient } from '@/lib/supabase/server';
import { resolveWhatsAppConfig } from '@/lib/whatsapp/config';
import { ESTATE_GROUP_SETTING } from '@/lib/whatsapp/group-sync';

export type WhatsAppRolloutMode = 'disabled' | 'pilot' | 'estate' | 'group';

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value !== 'string') return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [];
  } catch {
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }
}

/** The chosen estate group, or '' when WAHA is not the active provider, none is chosen or a read fails. */
async function getEstateGroupId(): Promise<string> {
  try {
    const resolved = await resolveWhatsAppConfig();
    if (resolved.status !== 'ok' || resolved.config.provider !== 'waha') return '';
    const result = await getSettingResultAsService(ESTATE_GROUP_SETTING);
    return result.status === 'ok' && typeof result.value === 'string' ? result.value.trim() : '';
  } catch {
    return '';
  }
}

async function isCurrentGroupMember(residentId: string, groupId: string): Promise<boolean> {
  // The generated types do not know whatsapp_group_members until its migration is applied.
  const { data, error } = await (createAdminClient() as unknown as SupabaseClient)
    .from('whatsapp_group_members')
    .select('id')
    .eq('resident_id', residentId)
    .eq('group_id', groupId)
    .is('left_at', null)
    .limit(1);
  return !error && (data ?? []).length > 0;
}

export async function isWhatsAppRecipientAllowed(residentId: string): Promise<boolean> {
  // Runs from the inbound WhatsApp webhook and the outbound dispatcher
  // (#136) -- both unauthenticated contexts -- so these reads must go
  // through the service-role client (see #136), or the rollout gate always
  // reads null under cron/webhook regardless of what's configured.
  //
  // Fails CLOSED (#139): this setting gates who may receive/interact via
  // WhatsApp at all, so a query error must be treated as "not permitted",
  // not silently defaulted. `absent` (no row -- nobody has configured
  // rollout yet) keeps falling through to its existing default of
  // 'disabled' -- that is a genuine unconfigured state, not a transient
  // failure, and 'disabled' is itself already fail-closed.
  const modeResult = await getSettingResultAsService('whatsapp_rollout_mode');
  if (modeResult.status === 'error') return false;
  const modeValue = modeResult.status === 'ok' ? modeResult.value : undefined;
  const mode: WhatsAppRolloutMode = modeValue === 'estate' || modeValue === 'pilot' || modeValue === 'group' ? modeValue : 'disabled';
  if (mode === 'disabled') return false;
  if (mode === 'estate') return true;

  // Group mode (#1326) fails closed when WAHA is not the active provider, no
  // group is chosen, or either read errors. Outbound sends use this gate too,
  // so in this mode resident WhatsApp goes only to group members and the pilot list.
  let groupId = '';
  if (mode === 'group') {
    groupId = await getEstateGroupId();
    if (!groupId) return false;
  }

  const residentIdsResult = await getSettingResultAsService('whatsapp_pilot_resident_ids');
  if (residentIdsResult.status === 'error') return false;
  const residentIds = parseList(residentIdsResult.status === 'ok' ? residentIdsResult.value : undefined);
  if (residentIds.includes(residentId)) return true;
  if (mode === 'group') return isCurrentGroupMember(residentId, groupId);

  const streetIdResult = await getSettingResultAsService('whatsapp_pilot_street_id');
  if (streetIdResult.status === 'error') return false;
  const streetId = streetIdResult.status === 'ok' ? streetIdResult.value : undefined;
  if (!streetId) return false;
  const { data, error } = await createAdminClient()
    .from('resident_houses')
    .select('house:houses(street_id)')
    .eq('resident_id', residentId)
    .eq('is_active', true);
  if (error) return false;
  return (data || []).some((assignment) => {
    const house = Array.isArray(assignment.house) ? assignment.house[0] : assignment.house;
    return house?.street_id === String(streetId);
  });
}
