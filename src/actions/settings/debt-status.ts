'use server';

import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { settingValueError } from '@/lib/validators/setting-value';
import {
  DEBT_STATUSES,
  DEBT_STATUS_SETTING_KEYS,
  readDebtStatusSettings,
  type DebtStatusSettings,
} from '@/lib/billing/debt-status';

type DebtStatusSettingsResponse = { data: DebtStatusSettings | null; error: string | null };

/** The Debt Status settings page's values (#980), defaults filling any gap. */
export async function getDebtStatusSettings(): Promise<DebtStatusSettingsResponse> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_DEBT_STATUS);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  try {
    const supabase = await createServerSupabaseClient();
    return { data: await readDebtStatusSettings(supabase), error: null };
  } catch (error) {
    console.error('Get debt status settings error:', error);
    return { data: null, error: 'Failed to load debt status settings' };
  }
}

/**
 * Saves every debt status setting at once (#980). Rows keep the billing category: the generic bulk
 * writer would move them to general.
 */
export async function updateDebtStatusSettings(input: DebtStatusSettings): Promise<DebtStatusSettingsResponse> {
  const auth = await authorizePermission(PERMISSIONS.SETTINGS_MANAGE_DEBT_STATUS);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const keys = DEBT_STATUS_SETTING_KEYS;
  const values: Record<string, string | number> = {
    ...Object.fromEntries(DEBT_STATUSES.map((status) => [keys.labels[status], input.labels?.[status]?.trim?.() ?? ''])),
    [keys.arrearsThresholdMonths]: input.arrearsThresholdMonths,
    [keys.reportFootnote]: input.reportFootnote?.trim?.() ?? '',
    [keys.chatPdfHouseLimit]: input.chatPdfHouseLimit,
  };
  for (const [key, value] of Object.entries(values)) {
    const valueError = settingValueError(key, value);
    if (valueError) return { data: null, error: valueError };
  }
  const labels = DEBT_STATUSES.map((status) => values[keys.labels[status]] as string);
  if (new Set(labels.map((label) => label.toLowerCase())).size !== labels.length) {
    return { data: null, error: 'Each debt status needs its own label' };
  }

  const supabase = await createServerSupabaseClient();
  const { data: oldRows } = await supabase.from('system_settings').select('key, value').in('key', Object.keys(values));
  const oldValues = new Map((oldRows ?? []).map((row) => [row.key, row.value]));

  const { data: saved, error } = await supabase
    .from('system_settings')
    .upsert(
      Object.entries(values).map(([key, value]) => ({ key, value, category: 'billing' })),
      { onConflict: 'key' },
    )
    .select('id, key');
  if (error || !saved?.length) {
    console.error('Update debt status settings error:', error);
    return { data: null, error: 'Failed to save debt status settings' };
  }

  const changed = Object.keys(values).filter((key) => String(oldValues.get(key)) !== String(values[key]));
  if (changed.length > 0) {
    // audit_logs.entity_id is a uuid: use the first saved row's id, the keys go in the values.
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: saved[0].id,
      entityDisplay: 'Debt status settings',
      oldValues: Object.fromEntries(changed.map((key) => [key, oldValues.get(key) ?? null])),
      newValues: Object.fromEntries(changed.map((key) => [key, values[key]])),
      description: `Updated debt status settings: ${changed.join(', ')}`,
    });
  }

  revalidatePath('/settings/debt-status');
  return { data: await readDebtStatusSettings(supabase).catch(() => input), error: null };
}
