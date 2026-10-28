'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import crypto from 'crypto';
import { hashBackupCode, verifyBackupCodeHash } from '@/lib/auth/two-factor-secrets';
import { checkAccountCode, claimTwoFactorTry, clearTwoFactorTries, tooManyTriesMessage } from '@/lib/auth/two-factor-guard';
import { sendEmail, getEstateEmailSettings } from '@/lib/email/send-email';
import { sendWhatsAppMessage } from '@/lib/whatsapp/provider';
import { BackupCodesEmail } from '@/emails/backup-codes';

/**
 * Generate new backup codes for the current user
 * Requires the user to verify their identity first
 */
export async function generateBackupCodes(
  verificationCode: string
): Promise<{ success: boolean; message: string; codes?: string[] }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_ENABLE);
  if (!auth.authorized) {
    return { success: false, message: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, message: 'Not authenticated' };
  }

  // Get profile with 2FA settings
  const { data: profile } = await adminClient
    .from('profiles')
    .select('two_factor_enabled, two_factor_method, two_factor_secret_encrypted')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.two_factor_enabled) {
    return { success: false, message: '2FA is not enabled' };
  }

  // Take one try before checking the code (#1029): new backup codes are a recovery path.
  const attempt = await claimTwoFactorTry(user.id, 'manage');
  if (!attempt.allowed) {
    return { success: false, message: tooManyTriesMessage() };
  }

  const method = profile.two_factor_method as 'sms' | 'authenticator' | 'email';
  const checked = await checkAccountCode({
    profileId: user.id,
    method,
    secretEncrypted: profile.two_factor_secret_encrypted,
    code: verificationCode,
    tokenPurpose: 'recovery',
  });
  if (checked === 'misconfigured') {
    return { success: false, message: '2FA not properly configured' };
  }
  const isValid = checked;

  if (!isValid) {
    await adminClient.from('two_factor_audit_log').insert({
      profile_id: user.id,
      action: 'failed_login',
      method,
      metadata: { purpose: 'backup_codes', code_attempted: verificationCode.substring(0, 2) + '****' },
    });
    return { success: false, message: 'Invalid verification code' };
  }

  await clearTwoFactorTries(user.id, 'manage');

  // Generate new backup codes
  const codes = await generateAndStoreBackupCodes(user.id);

  // Log the regeneration
  await adminClient.from('two_factor_audit_log').insert({
    profile_id: user.id,
    action: 'secret_regenerated',
    method,
    metadata: { backup_codes_regenerated: codes.length },
  });

  await logAudit({
    action: 'UPDATE',
    entityType: 'two_factor_backup_codes',
    entityId: user.id,
    entityDisplay: 'Backup codes regenerated',
    newValues: { codes_count: codes.length },
  });

  return {
    success: true,
    message: 'New backup codes generated. Save these codes securely.',
    codes,
  };
}

/** Codes may be sent only while they are this fresh, and at most this many times in that window. */
const SEND_WINDOW_MINUTES = 15;
const MAX_SENDS_PER_WINDOW = 3;
const BACKUP_CODE_FORMAT = /^[0-9A-F]{8}$/;
const CODES_NOT_SENDABLE = 'These codes can no longer be sent. Make new backup codes.';

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  return `${local.charAt(0)}***@${domain}`;
}

/**
 * Send the backup codes just shown to the signed-in user, to their own email or WhatsApp number.
 * Only a fresh, unused code set of this user is sent, so the action cannot carry other text.
 * The codes are never logged, stored or returned.
 */
export async function sendBackupCodes(
  channel: 'email' | 'whatsapp',
  codes: string[]
): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_ENABLE);
  if (!auth.authorized) {
    return { success: false, message: auth.error || 'Unauthorized' };
  }

  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, message: 'Not authenticated' };
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('email, full_name, two_factor_enabled, two_factor_method')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.two_factor_enabled) {
    return { success: false, message: '2FA is not enabled' };
  }

  if (channel !== 'email' && channel !== 'whatsapp') {
    return { success: false, message: 'Choose email or WhatsApp' };
  }

  const normalised = Array.isArray(codes) ? codes.map((c) => (typeof c === 'string' ? c.trim().toUpperCase() : '')) : [];
  if (
    normalised.length < 1 ||
    normalised.length > 10 ||
    !normalised.every((c) => BACKUP_CODE_FORMAT.test(c)) ||
    new Set(normalised).size !== normalised.length
  ) {
    return { success: false, message: 'Invalid backup codes' };
  }

  const windowStart = new Date(Date.now() - SEND_WINDOW_MINUTES * 60 * 1000);

  // two_factor_audit_log.action has a CHECK list without a "sent" value, so a send is
  // recorded as settings_updated with metadata.event = backup_codes_sent.
  const { count: recentSends, error: countError } = await adminClient
    .from('two_factor_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('profile_id', user.id)
    .eq('action', 'settings_updated')
    .eq('metadata->>event', 'backup_codes_sent')
    .gte('created_at', windowStart.toISOString());
  if (countError || recentSends === null) {
    return { success: false, message: 'Could not send the codes. Please try again.' };
  }
  if (recentSends >= MAX_SENDS_PER_WINDOW) {
    return { success: false, message: `You sent your codes ${MAX_SENDS_PER_WINDOW} times. Try again in ${SEND_WINDOW_MINUTES} minutes.` };
  }

  // Each code must be an unused code of this user, made in the last 15 minutes.
  const { data: rows } = await adminClient
    .from('two_factor_backup_codes')
    .select('id, code_hash, created_at')
    .eq('profile_id', user.id)
    .is('used_at', null);
  const freshRows = (rows ?? []).filter((r) => new Date(r.created_at).getTime() >= windowStart.getTime());
  const allMatch = normalised.every((code) => freshRows.some((r) => verifyBackupCodeHash(code, r.code_hash)));
  if (!allMatch) {
    return { success: false, message: CODES_NOT_SENDABLE };
  }

  let destination: string;
  if (channel === 'email') {
    if (!profile.email) {
      return { success: false, message: 'No email address on your profile.' };
    }
    const estateSettings = await getEstateEmailSettings();
    const emailResult = await sendEmail({
      to: { email: profile.email, name: profile.full_name },
      // The subject is logged, so it never carries a code.
      subject: 'Your two-factor backup codes',
      react: BackupCodesEmail({
        firstName: profile.full_name?.split(' ')[0] || 'there',
        codes: normalised,
        estateName: estateSettings.estateName,
        estateLogoUrl: estateSettings.estateLogoUrl,
      }),
      emailType: 'notification',
      metadata: { purpose: '2fa_backup_codes' },
      purpose: 'self_auth_2fa', // self-addressed codes to the signed-in user: exempt from the comms override (#715)
    });
    if (!emailResult.success) {
      return { success: false, message: `Failed to send email: ${emailResult.error}` };
    }
    destination = maskEmail(profile.email);
  } else {
    const { data: resident } = await supabase
      .from('residents')
      .select('phone_primary')
      .eq('profile_id', user.id)
      .single();
    if (!resident?.phone_primary) {
      return { success: false, message: 'No phone number on your profile.' };
    }
    const body = [
      'Your two-factor backup codes',
      '',
      ...normalised,
      '',
      'Each code works once. Delete this message after you save the codes.',
    ].join('\n');
    // No tracking argument: no outbound-send row is written for this message.
    const waResult = await sendWhatsAppMessage(
      { to: resident.phone_primary, body },
      undefined,
      { purpose: 'self_auth_2fa' } // self-addressed codes to the signed-in user: exempt from the comms override (#715)
    );
    if (!waResult.success) {
      return { success: false, message: `Failed to send WhatsApp message: ${waResult.error}` };
    }
    destination = resident.phone_primary.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
  }

  await adminClient.from('two_factor_audit_log').insert({
    profile_id: user.id,
    action: 'settings_updated',
    method: profile.two_factor_method,
    metadata: { event: 'backup_codes_sent', channel, codes_count: normalised.length },
  });

  await logAudit({
    action: 'UPDATE',
    entityType: 'two_factor_backup_codes',
    entityId: user.id,
    entityDisplay: `Backup codes sent by ${channel}`,
    newValues: { channel, codes_count: normalised.length },
  });

  return { success: true, message: `Backup codes sent to ${destination}` };
}

/**
 * Get count of remaining backup codes
 */
export async function getBackupCodesCount(): Promise<{
  success: boolean;
  count: number;
  total: number;
}> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get current user
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { success: false, count: 0, total: 10 };
  }

  // Count remaining unused codes
  const { count: remaining } = await adminClient
    .from('two_factor_backup_codes')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id)
    .is('used_at', null);

  // Count total codes (including used)
  const { count: total } = await adminClient
    .from('two_factor_backup_codes')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', user.id);

  return {
    success: true,
    count: remaining || 0,
    total: total || 10,
  };
}

/**
 * Generate and store backup codes
 */
async function generateAndStoreBackupCodes(profileId: string): Promise<string[]> {
  const adminClient = createAdminClient();
  const codes: string[] = [];
  const hashedCodes: { profile_id: string; code_hash: string }[] = [];

  // Generate 10 backup codes
  for (let i = 0; i < 10; i++) {
    // Generate a random 8-character code (alphanumeric, easy to type)
    const code = crypto.randomBytes(4).toString('hex').toUpperCase();
    codes.push(code);

    // Hash the code for storage
    const hash = hashBackupCode(code);
    hashedCodes.push({
      profile_id: profileId,
      code_hash: hash,
    });
  }

  // Delete any existing backup codes
  await adminClient
    .from('two_factor_backup_codes')
    .delete()
    .eq('profile_id', profileId);

  // Insert new backup codes
  await adminClient.from('two_factor_backup_codes').insert(hashedCodes);

  // Reset used count
  await adminClient
    .from('profiles')
    .update({ two_factor_recovery_codes_used: 0 })
    .eq('id', profileId);

  return codes;
}

