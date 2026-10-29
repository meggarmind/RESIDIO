'use server';

import { randomInt } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { hasVerifiedTwoFactorSession } from '@/lib/auth/two-factor-session';
import { logAudit } from '@/lib/audit/logger';
import { createAdminClient } from '@/lib/supabase/server';
import { maskPhone } from '@/lib/utils';
import {
  ADMIN_IDLE_DAYS,
  ADMIN_LINK_CODE_TTL_MINUTES,
  ADMIN_REVERIFY_DAYS,
  adminIneligibility,
  bindingEndReason,
  hashAdminLinkCode,
  loadWhatsAppAdminAccount,
  type WhatsAppAdminIneligibility,
} from '@/lib/whatsapp/admin';

type ActionResult<T> = { success: boolean; data: T | null; error: string | null };

export interface WhatsAppAdminAccessState {
  /** Why this account cannot use WhatsApp admin mode, or null when it can. */
  ineligible: WhatsAppAdminIneligibility | null;
  binding: {
    maskedNumber: string;
    boundAt: string;
    lastUsedAt: string | null;
    /** When the link ends at the latest: 90 days after linking, or 30 days without use. */
    endsAt: string;
  } | null;
}

const PAGE = '/settings/whatsapp-admin';
const DAY = 24 * 60 * 60 * 1000;

function db(): SupabaseClient {
  // The generated types do not know the #972 tables until that migration is applied.
  return createAdminClient() as unknown as SupabaseClient;
}

const INELIGIBLE_ERRORS: Record<WhatsAppAdminIneligibility, string> = {
  account_inactive: 'Your account is not active',
  role_not_allowed: 'Your role does not have WhatsApp admin access',
  missing_permission: 'Your role does not have WhatsApp admin access',
  authenticator_off: 'Turn on authenticator app 2FA for your account first',
};

/** The caller's own WhatsApp admin link, if any. */
export async function getMyWhatsAppAdminAccess(): Promise<ActionResult<WhatsAppAdminAccessState>> {
  const auth = await authorizePermission(PERMISSIONS.WHATSAPP_ADMIN_QUERY);
  if (!auth.authorized || !auth.userId) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  try {
    const account = await loadWhatsAppAdminAccount(auth.userId);
    const { data, error } = await db()
      .from('whatsapp_admin_bindings')
      .select('id, profile_id, phone_number, bound_at, last_used_at, last_totp_step, session_expires_at, account_fingerprint')
      .eq('profile_id', auth.userId)
      .is('revoked_at', null)
      .not('bound_at', 'is', null)
      .maybeSingle();
    if (error) throw error;

    const binding = data && !bindingEndReason({
      id: data.id,
      profileId: data.profile_id,
      phoneNumber: data.phone_number,
      boundAt: data.bound_at,
      lastUsedAt: data.last_used_at,
      lastTotpStep: data.last_totp_step === null ? null : Number(data.last_totp_step),
      sessionExpiresAt: data.session_expires_at,
      accountFingerprint: data.account_fingerprint,
      codeRequired: true,
    }, account, new Date())
      ? {
          maskedNumber: maskPhone(data.phone_number),
          boundAt: data.bound_at as string,
          lastUsedAt: data.last_used_at as string | null,
          endsAt: new Date(Math.min(
            Date.parse(data.bound_at) + ADMIN_REVERIFY_DAYS * DAY,
            Date.parse(data.last_used_at ?? data.bound_at) + ADMIN_IDLE_DAYS * DAY
          )).toISOString(),
        }
      : null;

    return { success: true, data: { ineligible: adminIneligibility(account), binding }, error: null };
  } catch (error) {
    console.error('[whatsapp-admin] Could not read the admin link:', error);
    return { success: false, data: null, error: 'Could not read your WhatsApp admin link' };
  }
}

/**
 * Issues a one-time code the admin sends as `ADMIN LINK <code>` from the phone to pin (#972 D4).
 * Needs a 2FA-verified dashboard session and an eligible account. The plaintext code is returned
 * once and never stored or audited; an earlier unused code is cancelled.
 */
export async function createWhatsAppAdminLinkCode(): Promise<ActionResult<{ code: string; expiresAt: string }>> {
  const auth = await authorizePermission(PERMISSIONS.WHATSAPP_ADMIN_QUERY);
  if (!auth.authorized || !auth.userId) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  if (!(await hasVerifiedTwoFactorSession(auth.userId))) {
    return { success: false, data: null, error: 'Sign in with your authenticator app code to link a number' };
  }

  let ineligible: WhatsAppAdminIneligibility | null;
  try {
    ineligible = adminIneligibility(await loadWhatsAppAdminAccount(auth.userId));
  } catch (error) {
    console.error('[whatsapp-admin] Could not check the admin account:', error);
    return { success: false, data: null, error: 'Could not check your account' };
  }
  if (ineligible) return { success: false, data: null, error: INELIGIBLE_ERRORS[ineligible] };

  const supabase = db();
  const now = new Date().toISOString();
  const { error: cancelError } = await supabase
    .from('whatsapp_admin_bindings')
    .update({ revoked_at: now, revoked_reason: 'code_replaced', updated_at: now })
    .eq('profile_id', auth.userId)
    .is('bound_at', null)
    .is('revoked_at', null);
  if (cancelError) {
    console.error('[whatsapp-admin] Could not cancel the earlier link code:', cancelError);
    return { success: false, data: null, error: 'Failed to create a WhatsApp admin link code' };
  }

  const code = randomInt(100000, 1000000).toString();
  const expiresAt = new Date(Date.now() + ADMIN_LINK_CODE_TTL_MINUTES * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('whatsapp_admin_bindings')
    .insert({ profile_id: auth.userId, link_code_hash: hashAdminLinkCode(code), link_code_expires_at: expiresAt, created_by: auth.userId })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[whatsapp-admin] Could not store the link code:', error);
    return { success: false, data: null, error: 'Failed to create a WhatsApp admin link code' };
  }

  await logAudit({
    action: 'CREATE',
    entityType: 'whatsapp_admin_bindings',
    entityId: data.id,
    entityDisplay: 'WhatsApp admin link code',
    newValues: { profile_id: auth.userId, link_code_expires_at: expiresAt },
  });

  return { success: true, data: { code, expiresAt }, error: null };
}

/** Ends the caller's own WhatsApp admin link and any unused link code. */
export async function unlinkMyWhatsAppAdminNumber(): Promise<ActionResult<{ unlinked: number }>> {
  const auth = await authorizePermission(PERMISSIONS.WHATSAPP_ADMIN_QUERY);
  if (!auth.authorized || !auth.userId) return { success: false, data: null, error: auth.error || 'Unauthorized' };

  const now = new Date().toISOString();
  const { data, error } = await db()
    .from('whatsapp_admin_bindings')
    .update({ revoked_at: now, revoked_reason: 'unlinked', session_expires_at: null, updated_at: now })
    .eq('profile_id', auth.userId)
    .is('revoked_at', null)
    .select('id, phone_number');
  if (error) {
    console.error('[whatsapp-admin] Could not unlink the number:', error);
    return { success: false, data: null, error: 'Failed to unlink the WhatsApp number' };
  }

  for (const row of data || []) {
    await logAudit({
      action: 'DEACTIVATE',
      entityType: 'whatsapp_admin_bindings',
      entityId: row.id,
      entityDisplay: 'WhatsApp admin link',
      description: 'WhatsApp admin link ended by the admin',
      oldValues: { phone_number: row.phone_number ? maskPhone(row.phone_number) : null },
      newValues: { revoked_at: now, revoked_reason: 'unlinked' },
    });
  }

  revalidatePath(PAGE);
  return { success: true, data: { unlinked: (data || []).length }, error: null };
}
