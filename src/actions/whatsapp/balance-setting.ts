'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { RESIDENT_ROLL_FORWARD_SETTING } from '@/lib/billing/account-balance';

type ActionResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

const LABEL = 'Resident roll-forward balance';

export async function getResidentRollForwardBalance(): Promise<ActionResult<boolean>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const { data, error } = await createAdminClient()
    .from('system_settings')
    .select('value')
    .eq('key', RESIDENT_ROLL_FORWARD_SETTING)
    .maybeSingle();

  return {
    success: !error,
    // Absent row means the default, which is off (#863 decision 8).
    data: !!data && (data.value === true || data.value === 'true'),
    error: error?.message || null,
  };
}

/** Switches residents (WhatsApp, statement PDFs, portal) to the roll-forward balance (#863). */
export async function setResidentRollForwardBalance(enabled: boolean): Promise<ActionResult<boolean>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();
  const { data: oldSetting } = await adminClient
    .from('system_settings')
    .select('value')
    .eq('key', RESIDENT_ROLL_FORWARD_SETTING)
    .maybeSingle();
  const { data: saved, error } = await adminClient
    .from('system_settings')
    .upsert({ key: RESIDENT_ROLL_FORWARD_SETTING, value: enabled, description: LABEL, category: 'billing' }, { onConflict: 'key' })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to save ${RESIDENT_ROLL_FORWARD_SETTING}:`, error);
    return { success: false, data: null, error: 'Failed to update the resident balance setting' };
  }

  // audit_logs.entity_id is a uuid: use the settings row id; the key goes in newValues (#594).
  if (saved?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: saved.id,
      entityDisplay: LABEL,
      oldValues: { value: oldSetting?.value },
      newValues: { key: RESIDENT_ROLL_FORWARD_SETTING, value: enabled },
    });
  }
  revalidatePath('/settings/whatsapp');

  return { success: true, data: enabled, error: null };
}
