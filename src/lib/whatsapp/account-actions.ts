import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { recordAudit } from '@/lib/audit/recorder';
import { sendEmail } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import { EmailChangedEmail } from '@/emails/email-changed';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import { getRawSettingsAsService } from '@/lib/settings/service';
import { updatePreference } from '@/lib/notifications/preferences';
import {
  TOKEN_EXPIRY_MINUTES,
  checkRateLimit,
  codesMatch,
  generateOTP,
  invalidateExistingTokens,
  recordFailedAttemptRpc,
} from '@/lib/verification/tokens';
import { releaseStatementsAwaitingEmail } from '@/lib/whatsapp/statement-delivery';
import { maskEmail } from '@/lib/whatsapp/assistant-format';

/**
 * The writes a resident can make from the WhatsApp Assistant (#816 decision 1): reminder preference
 * and email address here, payment reports and clearance requests in their own modules. They run from
 * the inbound webhook with no admin session, so none is a server action; each records an audit entry
 * whose actor is the resident (see AuditActor.residentId).
 */

const via = (residentId: string) => ({ userId: null, residentId });

// ---------------------------------------------------------------------------
// Reminders (decisions 2-4)

/** Payment and invoice reminders on WhatsApp only; announcements, security alerts, email and SMS are untouched. */
const REMINDER_CATEGORIES = ['invoice', 'payment'] as const;

/** On unless the resident turned either category off; no stored preference means on. */
export async function getRemindersOn(residentId: string): Promise<boolean> {
  const { data, error } = await createAdminClient()
    .from('notification_preferences')
    .select('enabled')
    .eq('resident_id', residentId)
    .eq('channel', 'whatsapp')
    .in('category', [...REMINDER_CATEGORIES]);
  if (error) throw error;
  return !(data || []).some((row) => row.enabled === false);
}

export async function setRemindersOn(residentId: string, on: boolean): Promise<void> {
  for (const category of REMINDER_CATEGORIES) {
    const result = await updatePreference({ resident_id: residentId, category, channel: 'whatsapp', enabled: on });
    if (!result.success) throw new Error(`Reminder preference not saved: ${result.error}`);
  }
  await recordAudit(
    {
      action: 'UPDATE',
      entityType: 'notification_preferences',
      entityId: residentId,
      entityDisplay: 'WhatsApp payment reminders',
      oldValues: { whatsapp_payment_reminders: !on },
      newValues: { whatsapp_payment_reminders: on },
      description: `Payment reminders on WhatsApp turned ${on ? 'on' : 'off'} by the resident over WhatsApp`,
    },
    via(residentId)
  );
}

// ---------------------------------------------------------------------------
// Update email, verified (decisions 5-8)

const emailSchema = z.string().trim().toLowerCase().max(254).email();

export type EmailChangeStart =
  | { status: 'sent'; email: string }
  | { status: 'invalid' | 'same' | 'rate_limited' | 'failed' };

export type EmailChangeConfirm =
  | { status: 'saved'; email: string; statementsQueued: number }
  | { status: 'wrong' | 'locked' | 'expired' | 'failed' };

async function estateEmailSettings() {
  const settings = await getRawSettingsAsService(['estate_name', 'estate_email', 'estate_phone', 'estate_address']);
  const value = (key: string) => {
    const raw = settings.status === 'ok' ? settings.values.get(key) : null;
    return typeof raw === 'string' && raw.trim() ? raw.trim() : undefined;
  };
  return { estateName: value('estate_name') ?? 'Residio Estate', estateEmail: value('estate_email'), estatePhone: value('estate_phone'), estateAddress: value('estate_address') };
}

/** Sends the existing 6-digit verification code to the NEW address; nothing is saved until it comes back. */
export async function startEmailChange(residentId: string, input: string): Promise<EmailChangeStart> {
  const parsed = emailSchema.safeParse(input);
  if (!parsed.success) return { status: 'invalid' };
  const email = parsed.data;

  const admin = createAdminClient();
  const { data: resident, error } = await admin.from('residents').select('id, first_name, email, email_verified_at').eq('id', residentId).single();
  if (error || !resident) return { status: 'failed' };
  if (resident.email?.toLowerCase() === email && resident.email_verified_at) return { status: 'same' };

  if (!(await checkRateLimit(residentId, 'email')).allowed) return { status: 'rate_limited' };
  const override = await resolveResidentOverride([residentId]);
  if (!override.ok) return { status: 'failed' };

  await invalidateExistingTokens(residentId, 'email');
  const otp = generateOTP();
  const { error: insertError } = await admin.from('verification_tokens').insert({
    resident_id: residentId,
    token_type: 'email',
    token: otp,
    target_value: email,
    expires_at: new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000).toISOString(),
  });
  if (insertError) {
    console.error('[WhatsApp] Email verification token not created:', insertError);
    return { status: 'failed' };
  }

  const estate = await estateEmailSettings();
  const sent = await sendEmail({
    to: { email, name: resident.first_name, residentId },
    subject: 'Verify Your Email Address',
    react: VerificationCodeEmail({ firstName: resident.first_name, otp, expiryMinutes: TOKEN_EXPIRY_MINUTES, ...estate }),
    emailType: 'notification',
    residentOverride: override.residentOverride,
    metadata: { purpose: 'email_verification', via: 'whatsapp' },
  });
  if (!sent.success) {
    await admin.from('verification_tokens').update({ used_at: new Date().toISOString() }).eq('resident_id', residentId).eq('token', otp);
    return { status: 'failed' };
  }
  return { status: 'sent', email };
}

/**
 * Checks the code against the address it was sent to. Only a matching code saves the address and sets
 * email_verified_at; the old address is told, and statements queued for want of an email are released.
 */
export async function confirmEmailChange(residentId: string, code: string): Promise<EmailChangeConfirm> {
  const admin = createAdminClient();
  const { data: token, error } = await admin
    .from('verification_tokens')
    .select('id, token, target_value, expires_at')
    .eq('resident_id', residentId)
    .eq('token_type', 'email')
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { status: 'failed' };
  if (!token || new Date(token.expires_at) < new Date()) return { status: 'expired' };

  if (!codesMatch(code, token.token)) {
    const { data: outcome, error: rpcError } = await recordFailedAttemptRpc(admin, residentId, 'email');
    // Fail closed: never save the address when the attempt could not be counted.
    if (rpcError) return { status: 'failed' };
    return { status: outcome?.some((row) => row.invalidated) ? 'locked' : 'wrong' };
  }

  const now = new Date().toISOString();
  // Claim the token first so a repeated message cannot use it twice.
  const { data: claimed } = await admin.from('verification_tokens').update({ used_at: now }).eq('id', token.id).is('used_at', null).select('id').maybeSingle();
  if (!claimed) return { status: 'expired' };

  const { data: before } = await admin.from('residents').select('first_name, last_name, email, email_verified_at').eq('id', residentId).single();
  const { error: updateError } = await admin.from('residents').update({ email: token.target_value, email_verified_at: now }).eq('id', residentId);
  if (updateError) {
    console.error('[WhatsApp] Verified email not saved:', updateError);
    return { status: 'failed' };
  }

  await recordAudit(
    {
      action: 'UPDATE',
      entityType: 'residents',
      entityId: residentId,
      entityDisplay: before ? `${before.first_name} ${before.last_name}` : undefined,
      oldValues: { email: before?.email ?? null, email_verified_at: before?.email_verified_at ?? null },
      newValues: { email: token.target_value, email_verified_at: now },
      description: 'Email changed and verified by the resident over WhatsApp',
    },
    via(residentId)
  );

  // The change is saved; neither follow-up may undo it.
  if (before?.email && before.email.toLowerCase() !== token.target_value) {
    const estate = await estateEmailSettings();
    const override = await resolveResidentOverride([residentId]);
    if (override.ok) {
      const told = await sendEmail({
        to: { email: before.email, name: before.first_name, residentId },
        subject: 'Your email address was changed',
        react: EmailChangedEmail({ firstName: before.first_name, maskedNewEmail: maskEmail(token.target_value), ...estate }),
        emailType: 'notification',
        residentOverride: override.residentOverride,
        metadata: { purpose: 'email_changed_notice', via: 'whatsapp' },
      }).catch((e: unknown) => ({ success: false, error: String(e) }));
      if (!told.success) console.error('[WhatsApp] Old-address notice not sent:', told.error);
    }
  }
  const statementsQueued = await releaseStatementsAwaitingEmail(residentId, token.target_value).catch((e) => {
    console.error('[WhatsApp] Statements awaiting an email not released:', e);
    return 0;
  });
  return { status: 'saved', email: token.target_value, statementsQueued };
}
