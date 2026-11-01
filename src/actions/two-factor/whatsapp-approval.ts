'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';

/**
 * The signed-in admin's own "Approve sign-ins on WhatsApp" switch (#1389). It is on the admin's active
 * WhatsApp binding (whatsapp_admin_bindings.approve_sign_ins), so it can exist only while a number is
 * linked. Guarded like the other two-factor self-service actions (setup, backup codes).
 */

export interface WhatsAppSignInApprovalState {
  /** 2FA is on and a WhatsApp number is linked: the switch can be shown. */
  available: boolean;
  enabled: boolean;
}

type Result<T> = { data: T | null; error: string | null };

// approve_sign_ins is not in the generated types yet.
const db = () => createAdminClient() as unknown as SupabaseClient;

async function loadState(userId: string): Promise<{ state: WhatsAppSignInApprovalState; bindingId: string | null }> {
  const { data: profile, error: profileError } = await db()
    .from('profiles')
    .select('two_factor_enabled')
    .eq('id', userId)
    .maybeSingle();
  if (profileError) throw profileError;
  const { data: binding, error: bindingError } = await db()
    .from('whatsapp_admin_bindings')
    .select('id, approve_sign_ins')
    .eq('profile_id', userId)
    .is('revoked_at', null)
    .not('bound_at', 'is', null)
    .maybeSingle();
  if (bindingError) throw bindingError;
  const available = profile?.two_factor_enabled === true && !!binding;
  return {
    state: { available, enabled: available && binding?.approve_sign_ins === true },
    bindingId: (binding?.id as string | undefined) ?? null,
  };
}

/** Whether the switch can be shown, and its value. Same permission as the write, so the switch shows only when it can be saved. */
export async function getWhatsAppSignInApproval(): Promise<Result<WhatsAppSignInApprovalState>> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_ENABLE);
  if (!auth.authorized) return { data: null, error: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { data: null, error: 'Not authenticated' };

  try {
    const { state } = await loadState(user.id);
    return { data: state, error: null };
  } catch (error) {
    console.error('[2FA WhatsApp] Could not read the approval switch:', error);
    return { data: null, error: 'Could not read the WhatsApp approval setting' };
  }
}

/** Turns "Approve sign-ins on WhatsApp" on or off for the signed-in admin. Needs 2FA on and a linked number. */
export async function setWhatsAppSignInApproval(enabled: boolean): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_ENABLE);
  if (!auth.authorized) return { success: false, message: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { success: false, message: 'Not authenticated' };

  let current;
  try {
    current = await loadState(user.id);
  } catch (error) {
    console.error('[2FA WhatsApp] Could not read the approval switch:', error);
    return { success: false, message: 'Could not save the setting' };
  }
  if (!current.state.available || !current.bindingId) {
    return { success: false, message: 'Turn on two-factor login and link your WhatsApp number first.' };
  }

  const { data, error } = await db()
    .from('whatsapp_admin_bindings')
    .update({ approve_sign_ins: enabled, updated_at: new Date().toISOString() })
    .eq('id', current.bindingId)
    .eq('profile_id', user.id)
    .is('revoked_at', null)
    .select('id');
  if (error || (data ?? []).length !== 1) {
    if (error) console.error('[2FA WhatsApp] Could not save the approval switch:', error);
    return { success: false, message: 'Could not save the setting' };
  }

  await logAudit({
    action: 'UPDATE',
    entityType: 'whatsapp_admin_bindings',
    entityId: current.bindingId,
    entityDisplay: 'WhatsApp admin link: approve sign-ins',
    oldValues: { approve_sign_ins: current.state.enabled },
    newValues: { approve_sign_ins: enabled },
  });

  return {
    success: true,
    message: enabled ? 'Sign-ins will be approved on WhatsApp' : 'Sign-ins will use your authenticator code',
  };
}
