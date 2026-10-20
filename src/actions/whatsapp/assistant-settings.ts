'use server';

import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

type ActionResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

export type WhatsAppAssistantText = {
  paymentInstructions: string;
  keywordSynonyms: string;
};

const KEYS = {
  paymentInstructions: 'whatsapp_payment_instructions',
  keywordSynonyms: 'whatsapp_keyword_synonyms',
} as const;

const LABELS: Record<keyof WhatsAppAssistantText, string> = {
  paymentInstructions: 'WhatsApp payment instructions',
  keywordSynonyms: 'WhatsApp keyword synonyms',
};

// Leaves room in Chatmaid's 4096-character message for the header and footer.
const MAX_LENGTH = 3000;

export async function getWhatsAppAssistantText(): Promise<ActionResult<WhatsAppAssistantText>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_VIEW);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const { data, error } = await createAdminClient()
    .from('system_settings')
    .select('key, value')
    .in('key', Object.values(KEYS));
  if (error) return { success: false, data: null, error: error.message };

  const values = new Map((data || []).map((row) => [row.key, typeof row.value === 'string' ? row.value : '']));
  return {
    success: true,
    data: { paymentInstructions: values.get(KEYS.paymentInstructions) || '', keywordSynonyms: values.get(KEYS.keywordSynonyms) || '' },
    error: null,
  };
}

/** Saves one Assistant text setting (#804): How to pay is hidden from residents while it is empty. */
export async function setWhatsAppAssistantText(
  field: keyof WhatsAppAssistantText,
  value: string
): Promise<ActionResult<string>> {
  const authorization = await authorizePermission(PERMISSIONS.WHATSAPP_MANAGE);
  if (!authorization.authorized) {
    return { success: false, data: null, error: authorization.error || 'Unauthorized' };
  }

  const key = KEYS[field];
  if (!key) return { success: false, data: null, error: 'Unknown setting' };
  const text = value.trim();
  if (text.length > MAX_LENGTH) {
    return { success: false, data: null, error: `Keep this under ${MAX_LENGTH} characters so it fits in one WhatsApp message.` };
  }

  const adminClient = createAdminClient();
  const { data: oldSetting } = await adminClient
    .from('system_settings')
    .select('value')
    .eq('key', key)
    .maybeSingle();
  const { data: saved, error } = await adminClient
    .from('system_settings')
    .upsert({ key, value: text, description: LABELS[field], category: 'notifications' }, { onConflict: 'key' })
    .select('id')
    .single();

  if (error) {
    console.error(`Failed to save ${key}:`, error);
    return { success: false, data: null, error: `Failed to save ${LABELS[field].toLowerCase()}` };
  }

  // audit_logs.entity_id is a uuid: use the settings row id; the key goes in newValues (#594).
  if (saved?.id) {
    await logAudit({
      action: 'UPDATE',
      entityType: 'system_settings',
      entityId: saved.id,
      entityDisplay: LABELS[field],
      oldValues: { value: oldSetting?.value },
      newValues: { key, value: text },
    });
  }
  revalidatePath('/settings/whatsapp');

  return { success: true, data: text, error: null };
}
