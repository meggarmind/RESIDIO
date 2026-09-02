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
  sessionRetentionDays: number;
  processedMessageRetentionDays: number;
};

// Bounds mirror the clamp already applied in
// src/app/api/cron/whatsapp-retention/route.ts (Math.min(Math.max(value, 1), 30)).
// Validating here means the value an admin saves is never silently
// re-clamped to something else by the cron route later.
const MIN_RETENTION_DAYS = 1;
const MAX_RETENTION_DAYS = 30;

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
    'whatsapp_session_retention_days',
    'whatsapp_processed_message_retention_days',
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
      // Defaults match the compiled-in fallbacks in
      // src/app/api/cron/whatsapp-retention/route.ts (1 / 2 days) so the
      // settings page shows the value that is actually in effect when the
      // row is missing, not an arbitrary placeholder.
      sessionRetentionDays: parseNumber(values.whatsapp_session_retention_days, 1),
      processedMessageRetentionDays: parseNumber(values.whatsapp_processed_message_retention_days, 2),
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
  if (
    !Number.isInteger(input.sessionRetentionDays) ||
    input.sessionRetentionDays < MIN_RETENTION_DAYS ||
    input.sessionRetentionDays > MAX_RETENTION_DAYS ||
    !Number.isInteger(input.processedMessageRetentionDays) ||
    input.processedMessageRetentionDays < MIN_RETENTION_DAYS ||
    input.processedMessageRetentionDays > MAX_RETENTION_DAYS
  ) {
    return { success: false, error: `Retention windows must be whole numbers between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days` };
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
    whatsapp_session_retention_days: String(input.sessionRetentionDays),
    whatsapp_processed_message_retention_days: String(input.processedMessageRetentionDays),
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

// ============================================================
// Master on/off switch (whatsapp_enabled)
// ============================================================
// Distinct from the rollout mode above: rollout mode chooses WHO receives
// WhatsApp messages once the channel is live; this decides WHETHER the
// channel runs at all. src/lib/notifications/send.ts gates every WhatsApp
// send on this setting and -- as of #134 -- fails CLOSED when it is absent
// or unreadable, so an admin must be able to find and flip it here rather
// than relying on a row nothing in the app used to write (see the seed
// migration 20260902090000_seed_whatsapp_enabled_default.sql).

/**
 * Reads the whatsapp_enabled master switch. Mirrors the read shape used by
 * getWhatsAppForcePin() in identity.ts: a missing row and a stored `'false'`
 * string both read as `false` here, matching the fail-closed default that
 * src/lib/notifications/send.ts now applies on the send path.
 */
export async function getWhatsAppEnabled(): Promise<{ success: boolean; data: boolean | null; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) return { success: false, data: null, error: authorization.error || 'Unauthorized' };

  const { data, error } = await createAdminClient()
    .from('system_settings')
    .select('value')
    .eq('key', 'whatsapp_enabled')
    .maybeSingle();

  if (error) return { success: false, data: null, error: error.message };

  return { success: true, data: data?.value === true || data?.value === 'true', error: null };
}

/**
 * Flips the whatsapp_enabled master switch. Uses upsert (not update) so
 * this control still works even before the seed migration has run on a
 * given environment -- an absent row must be creatable from here, not just
 * editable once it exists.
 */
export async function setWhatsAppEnabled(enabled: boolean): Promise<{ success: boolean; error: string | null }> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) return { success: false, error: authorization.error || 'Unauthorized' };

  const adminClient = createAdminClient();
  const { data: previous } = await adminClient
    .from('system_settings')
    .select('value')
    .eq('key', 'whatsapp_enabled')
    .maybeSingle();

  const { error } = await adminClient
    .from('system_settings')
    .upsert({ key: 'whatsapp_enabled', value: enabled.toString(), category: 'whatsapp' }, { onConflict: 'key' });

  if (error) return { success: false, error: 'Failed to update the WhatsApp master switch' };

  await logAudit({
    action: 'UPDATE',
    entityType: 'system_settings',
    entityId: 'whatsapp_enabled',
    entityDisplay: 'WhatsApp master on/off switch',
    oldValues: { whatsapp_enabled: previous?.value ?? null },
    newValues: { whatsapp_enabled: enabled },
  });
  revalidatePath('/settings/whatsapp');
  return { success: true, error: null };
}
