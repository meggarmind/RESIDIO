'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { WhatsAppRolloutMode } from '@/lib/whatsapp/rollout';

export type PilotSettings = {
  mode: WhatsAppRolloutMode;
  residentIds: string[];
  streetId: string;
  outboundDailyCap: number;
  outboundBurstCap: number;
  outboundBurstWindowMinutes: number;
  financialLookupDailyCap: number;
};

function parseNumber(value: unknown, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

export async function getWhatsAppPilotSettings(): Promise<{
  success: boolean;
  data: PilotSettings | null;
  error: string | null;
}> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  const adminClient = createAdminClient();
  const { data, error } = await adminClient.from('system_settings').select('key, value').in('key', [
    'whatsapp_rollout_mode',
    'whatsapp_pilot_resident_ids',
    'whatsapp_pilot_street_id',
    'whatsapp_outbound_daily_cap',
    'whatsapp_outbound_burst_cap',
    'whatsapp_outbound_burst_window_minutes',
    'whatsapp_daily_financial_lookup_cap',
  ]);
  if (error) return { success: false, data: null, error: error.message };
  const values = Object.fromEntries((data || []).map((setting) => [setting.key, setting.value]));
  let residentIds: string[] = [];
  try {
    residentIds = Array.isArray(values.whatsapp_pilot_resident_ids)
      ? values.whatsapp_pilot_resident_ids.map(String)
      : JSON.parse(String(values.whatsapp_pilot_resident_ids || '[]'));
  } catch { residentIds = []; }
  return {
    success: true,
    data: {
      mode: values.whatsapp_rollout_mode === 'pilot' || values.whatsapp_rollout_mode === 'estate' ? values.whatsapp_rollout_mode : 'disabled',
      residentIds,
      streetId: String(values.whatsapp_pilot_street_id || ''),
      outboundDailyCap: parseNumber(values.whatsapp_outbound_daily_cap, 100),
      outboundBurstCap: parseNumber(values.whatsapp_outbound_burst_cap, 20),
      outboundBurstWindowMinutes: parseNumber(values.whatsapp_outbound_burst_window_minutes, 10),
      financialLookupDailyCap: parseNumber(values.whatsapp_daily_financial_lookup_cap, 50),
    },
    error: null,
  };
}

export async function updateWhatsAppPilotSettings(input: PilotSettings): Promise<{ success: boolean; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, error: authorization.error || 'Unauthorized' };
  if (!['disabled', 'pilot', 'estate'].includes(input.mode)) return { success: false, error: 'Invalid rollout mode' };
  if (input.mode === 'pilot' && input.residentIds.length === 0 && !input.streetId) {
    return { success: false, error: 'Pilot mode requires resident IDs or a street ID' };
  }
  if (!Number.isInteger(input.outboundDailyCap) || input.outboundDailyCap < 0 || !Number.isInteger(input.outboundBurstCap) || input.outboundBurstCap < 0 || !Number.isInteger(input.outboundBurstWindowMinutes) || input.outboundBurstWindowMinutes < 1 || !Number.isInteger(input.financialLookupDailyCap) || input.financialLookupDailyCap < 0) {
    return { success: false, error: 'Caps must be non-negative whole numbers' };
  }
  if (input.mode === 'estate') {
    const { data: current, error: currentError } = await createAdminClient()
      .from('system_settings')
      .select('value')
      .eq('key', 'whatsapp_rollout_mode')
      .maybeSingle();
    if (currentError || current?.value !== 'estate') {
      return { success: false, error: 'Use the audited pilot promotion control to activate estate-wide rollout' };
    }
  }
  const values = {
    whatsapp_rollout_mode: input.mode,
    whatsapp_pilot_resident_ids: JSON.stringify(input.residentIds),
    whatsapp_pilot_street_id: input.streetId,
    whatsapp_outbound_daily_cap: String(input.outboundDailyCap),
    whatsapp_outbound_burst_cap: String(input.outboundBurstCap),
    whatsapp_outbound_burst_window_minutes: String(input.outboundBurstWindowMinutes),
    whatsapp_daily_financial_lookup_cap: String(input.financialLookupDailyCap),
  };
  const { error } = await createAdminClient().from('system_settings').upsert(
    Object.entries(values).map(([key, value]) => ({ key, value, category: 'notifications' })),
    { onConflict: 'key' }
  );
  if (error) return { success: false, error: 'Failed to update WhatsApp pilot settings' };
  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: 'whatsapp_rollout',
    entityDisplay: 'WhatsApp rollout controls',
    newValues: { ...values, whatsapp_pilot_resident_ids: input.residentIds.length },
  });
  revalidatePath('/settings/whatsapp');
  return { success: true, error: null };
}

export async function promoteWhatsAppPilotToEstate(): Promise<{ success: boolean; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, error: authorization.error || 'Unauthorized' };

  const client = createAdminClient();
  const { data: current, error: readError } = await client
    .from('system_settings')
    .select('value')
    .eq('key', 'whatsapp_rollout_mode')
    .maybeSingle();
  if (readError) return { success: false, error: 'Unable to verify the current WhatsApp rollout mode' };
  if (current?.value !== 'pilot') return { success: false, error: 'Only an active pilot can be promoted estate-wide' };

  const { error } = await client.from('system_settings').update({ value: 'estate' }).eq('key', 'whatsapp_rollout_mode');
  if (error) return { success: false, error: 'Failed to promote WhatsApp rollout' };
  await logAudit({
    action: 'ACTIVATE',
    entityType: 'system_settings',
    entityId: 'whatsapp_rollout',
    entityDisplay: 'WhatsApp pilot promoted estate-wide',
    oldValues: { whatsapp_rollout_mode: 'pilot' },
    newValues: { whatsapp_rollout_mode: 'estate' },
  });
  revalidatePath('/settings/whatsapp');
  return { success: true, error: null };
}
