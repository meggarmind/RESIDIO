import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/server';
import { normalizePhoneNumber } from '@/lib/sms/termii';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { AdminAlertEmail } from '@/emails/admin-alert';
import { sendWhatsAppMessage, sendWhatsAppPoll } from '@/lib/whatsapp/provider';
import { formatDay } from '@/lib/whatsapp/assistant-format';
import {
  lagosClock,
  type TwoFactorWhatsAppDeps,
  type TwoFactorWhatsAppRepository,
  type WhatsAppApprovalAccount,
  type WhatsAppApprovalRequest,
} from '@/lib/auth/two-factor-whatsapp';
import type { TwoFactorAuditAction } from '@/types/database';

/**
 * Supabase and WhatsApp side of "Approve sign-ins on WhatsApp" (#1389). The rules are in
 * `two-factor-whatsapp.ts`. Service role only: the request table has no client access.
 */

// two_factor_whatsapp_requests and whatsapp_admin_bindings.approve_sign_ins are not in the generated types yet.
const db = () => createAdminClient() as unknown as SupabaseClient;

const REQUEST_COLUMNS = 'id, profile_id, supabase_session_id, match_code, decoy_codes, poll_message_id, status, created_at, expires_at, marker_issued_at';

type RequestRow = {
  id: string;
  profile_id: string;
  supabase_session_id: string;
  match_code: string;
  decoy_codes: string[] | null;
  poll_message_id: string | null;
  status: WhatsAppApprovalRequest['status'];
  created_at: string;
  expires_at: string;
  marker_issued_at: string | null;
};

function toRequest(row: RequestRow): WhatsAppApprovalRequest {
  return {
    id: row.id,
    profileId: row.profile_id,
    sessionId: row.supabase_session_id,
    matchCode: row.match_code.trim(),
    decoyCodes: (row.decoy_codes ?? []).map((code) => code.trim()),
    pollMessageId: row.poll_message_id,
    status: row.status,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    markerIssuedAt: row.marker_issued_at,
  };
}

/**
 * two_factor_audit_log.action has a CHECK list without WhatsApp values, so each event is written as
 * the nearest existing action with metadata.event, as backup-code sends are (backup-codes.ts).
 */
const AUDIT_ACTION: Record<string, TwoFactorAuditAction> = {
  whatsapp_approval_requested: 'settings_updated',
  whatsapp_approval_approved: 'verified_login',
  whatsapp_approval_denied: 'failed_login',
  whatsapp_approval_expired: 'settings_updated',
};

async function activeBinding(profileId: string): Promise<{ phone_number: string; approve_sign_ins: boolean | null } | null> {
  const { data, error } = await db()
    .from('whatsapp_admin_bindings')
    .select('phone_number, approve_sign_ins')
    .eq('profile_id', profileId)
    .is('revoked_at', null)
    .not('bound_at', 'is', null)
    .maybeSingle();
  if (error) throw error;
  return data as { phone_number: string; approve_sign_ins: boolean | null } | null;
}

export function createSupabaseTwoFactorWhatsAppRepository(): TwoFactorWhatsAppRepository {
  return {
    async loadAccount(profileId) {
      const { data, error } = await db()
        .from('profiles')
        .select('id, full_name, email, two_factor_enabled, two_factor_method, app_roles!profiles_role_id_fkey(name)')
        .eq('id', profileId)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const binding = await activeBinding(profileId);
      const role = (Array.isArray(data.app_roles) ? data.app_roles[0] : data.app_roles) as { name?: string } | null;
      return {
        profileId: data.id as string,
        fullName: (data.full_name as string | null) ?? 'Admin',
        email: (data.email as string | null) ?? null,
        roleName: role?.name ?? null,
        twoFactorEnabled: data.two_factor_enabled === true,
        twoFactorMethod: (data.two_factor_method as string | null) ?? null,
        phoneNumber: binding?.phone_number ?? null,
        approveSignIns: binding?.approve_sign_ins === true,
      };
    },

    async findProfileByPhone(phoneNumber) {
      const { data, error } = await db()
        .from('whatsapp_admin_bindings')
        .select('profile_id')
        .eq('phone_number', normalizePhoneNumber(phoneNumber))
        .is('revoked_at', null)
        .not('bound_at', 'is', null)
        .maybeSingle();
      if (error) throw error;
      return (data?.profile_id as string | undefined) ?? null;
    },

    async countRequestsSince(profileId, since) {
      const { count, error } = await db()
        .from('two_factor_whatsapp_requests')
        .select('id', { count: 'exact', head: true })
        .eq('profile_id', profileId)
        .gte('created_at', since.toISOString());
      if (error) throw error;
      return count ?? 0;
    },

    async supersedePending(profileId, now) {
      const { error } = await db()
        .from('two_factor_whatsapp_requests')
        .update({ status: 'superseded', decided_at: now.toISOString() })
        .eq('profile_id', profileId)
        .eq('status', 'pending');
      if (error) throw error;
    },

    async insertRequest(input) {
      // created_at and expires_at come from the database defaults: expiry is 2 minutes after creation.
      const { data, error } = await db()
        .from('two_factor_whatsapp_requests')
        .insert({
          profile_id: input.profileId,
          supabase_session_id: input.sessionId,
          match_code: input.matchCode,
          decoy_codes: input.decoyCodes,
          user_agent_summary: input.userAgentSummary,
        })
        .select(REQUEST_COLUMNS)
        .single();
      if (error) throw error;
      return toRequest(data as RequestRow);
    },

    async setPollMessage(requestId, messageId, messageKey) {
      const { error } = await db()
        .from('two_factor_whatsapp_requests')
        .update({ poll_message_id: messageId, poll_message_key: messageKey })
        .eq('id', requestId);
      if (error) throw error;
    },

    async findPendingForProfile(profileId, since) {
      const { data, error } = await db()
        .from('two_factor_whatsapp_requests')
        .select(REQUEST_COLUMNS)
        .eq('profile_id', profileId)
        .eq('status', 'pending')
        .gte('created_at', since.toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toRequest(data as RequestRow) : null;
    },

    async findPendingByPollKey(pollMessageKey) {
      const { data, error } = await db()
        .from('two_factor_whatsapp_requests')
        .select(REQUEST_COLUMNS)
        .eq('poll_message_key', pollMessageKey)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toRequest(data as RequestRow) : null;
    },

    async findLatestForSession(profileId, sessionId) {
      const { data, error } = await db()
        .from('two_factor_whatsapp_requests')
        .select(REQUEST_COLUMNS)
        .eq('profile_id', profileId)
        .eq('supabase_session_id', sessionId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data ? toRequest(data as RequestRow) : null;
    },

    async decide(requestId, status, via, now) {
      // Guarded on pending, so only one answer (or the expiry) wins.
      const { data, error } = await db()
        .from('two_factor_whatsapp_requests')
        .update({ status, decided_at: now.toISOString(), decided_via: via })
        .eq('id', requestId)
        .eq('status', 'pending')
        .select('id');
      if (error) throw error;
      return (data ?? []).length === 1;
    },

    async claimMarker(requestId, now) {
      const { data, error } = await db()
        .from('two_factor_whatsapp_requests')
        .update({ marker_issued_at: now.toISOString() })
        .eq('id', requestId)
        .eq('status', 'approved')
        .is('marker_issued_at', null)
        .select('id');
      if (error) throw error;
      return (data ?? []).length === 1;
    },

    async releaseMarker(requestId) {
      const { error } = await db()
        .from('two_factor_whatsapp_requests')
        .update({ marker_issued_at: null })
        .eq('id', requestId);
      if (error) throw error;
    },

    async logEvent(profileId, event, method, metadata) {
      const { error } = await db()
        .from('two_factor_audit_log')
        .insert({ profile_id: profileId, action: AUDIT_ACTION[event], method, metadata: { event, channel: 'whatsapp', ...metadata } });
      if (error) console.error(`[2FA WhatsApp] Could not log ${event}:`, error.message);
    },
  };
}

/** A notice to the admin's own linked number: self-addressed, so exempt from the comms override (#715). */
async function sendAdminNotice(to: string, body: string): Promise<void> {
  const result = await sendWhatsAppMessage({ to, body }, undefined, { purpose: 'self_auth_2fa' });
  if (!result.success) throw new Error(result.error || 'WhatsApp send failed');
}

/**
 * Tells the Chairman that a sign-in was blocked. A Chairman with a linked WhatsApp number gets a
 * WhatsApp message; when the blocked admin is the Chairman, or the Chairman has no linked number,
 * an email. Never throws: the block is already stored and logged.
 */
async function alertChairmanOfBlockedSignIn(account: WhatsAppApprovalAccount, at: Date): Promise<void> {
  try {
    const { data, error } = await db()
      .from('profiles')
      .select('id, full_name, email, app_roles!profiles_role_id_fkey!inner(name)')
      .eq('approval_status', 'active')
      .eq('app_roles.name', 'chairman');
    if (error) throw error;
    const when = `${lagosClock(at)} on ${formatDay(at)}`;
    const text = `Sign-in blocked: a sign-in to ${account.fullName}'s Residio account at ${when} was refused on WhatsApp. Nobody was signed in.`;

    for (const chairman of data || []) {
      const isSelf = chairman.id === account.profileId;
      const binding = isSelf ? null : await activeBinding(chairman.id as string);
      if (binding?.phone_number) {
        const sent = await sendWhatsAppMessage({ to: binding.phone_number, body: text });
        if (sent.success) continue;
        console.error('[2FA WhatsApp] Chairman WhatsApp alert failed; sending email:', sent.error);
      }
      const email = (chairman.email as string | null)?.trim();
      if (!email) continue;
      const estate = await getEstateEmailSettings();
      const result = await sendEmail({
        to: { email, name: (chairman.full_name as string | null) || email },
        subject: 'Sign-in blocked on WhatsApp',
        react: AdminAlertEmail({
          ...estate,
          title: 'Sign-in blocked',
          severity: 'warning',
          message: isSelf
            ? `A sign-in to your Residio account at ${when} was refused on WhatsApp. Nobody was signed in. If this was not you, change your password now.`
            : text,
          timestamp: when,
        }),
        emailType: 'notification',
        metadata: { purpose: 'two_factor_whatsapp_blocked', profile_id: account.profileId },
      });
      if (!result.success) console.error('[2FA WhatsApp] Chairman email alert failed:', result.error);
    }
  } catch (error) {
    console.error('[2FA WhatsApp] Chairman alert failed:', error instanceof Error ? error.message : error);
  }
}

export function createTwoFactorWhatsAppDeps(): TwoFactorWhatsAppDeps {
  return {
    repository: createSupabaseTwoFactorWhatsAppRepository(),
    sender: {
      async sendPoll(to, name, options) {
        // Self-addressed to the admin's own linked number: exempt from the comms override (#715).
        return sendWhatsAppPoll({ to, name, options }, undefined, { purpose: 'self_auth_2fa' });
      },
      sendText: sendAdminNotice,
      alertChairman: alertChairmanOfBlockedSignIn,
    },
  };
}
