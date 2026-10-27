'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import { sendEmail } from '@/lib/email/send-email';
import { sendVerificationSms } from '@/lib/sms/send-sms';
import { getEstateEmailSettings } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import type { TwoFactorSetupResult, TwoFactorMethod, Enable2FAInput } from '@/types/database';
import crypto from 'crypto';
import { generateOtp, hashOtp, otpMatches, encryptTotpSecret, readTotpSecret, hashBackupCode } from '@/lib/auth/two-factor-secrets';
import { acceptAuthenticatorCode, claimTwoFactorTry, clearTwoFactorTries, tooManyTriesMessage } from '@/lib/auth/two-factor-guard';
import { issueTwoFactorMarkerCookie } from '@/lib/auth/two-factor-session';

// Token expiry in minutes
const TOKEN_EXPIRY_MINUTES = 10;

// Rate limit: max setup attempts per hour
const MAX_SETUP_ATTEMPTS_PER_HOUR = 5;

/**
 * Generate a random TOTP secret for authenticator apps
 */
function generateTOTPSecret(): string {
  // Generate 20 bytes of random data (160 bits, standard for TOTP)
  const buffer = crypto.randomBytes(20);
  // Convert to base32 for TOTP compatibility
  return base32Encode(buffer);
}

/**
 * Base32 encode a buffer
 */
function base32Encode(buffer: Buffer): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  let bits = 0;
  let value = 0;

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      result += alphabet[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    result += alphabet[(value << (5 - bits)) & 31];
  }

  return result;
}

/**
 * Generate a TOTP URI for authenticator apps
 */
function generateTOTPUri(secret: string, email: string, issuer: string): string {
  const encodedIssuer = encodeURIComponent(issuer);
  const encodedAccount = encodeURIComponent(email);
  return `otpauth://totp/${encodedIssuer}:${encodedAccount}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Check rate limit for setup attempts
 */
async function checkSetupRateLimit(profileId: string): Promise<{
  allowed: boolean;
  waitMinutes?: number;
}> {
  const adminClient = createAdminClient();
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await adminClient
    .from('two_factor_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', profileId)
    .eq('purpose', 'setup')
    .gte('created_at', oneHourAgo);

  const attemptsUsed = count || 0;

  if (attemptsUsed >= MAX_SETUP_ATTEMPTS_PER_HOUR) {
    return { allowed: false, waitMinutes: 60 };
  }

  return { allowed: true };
}

/**
 * Initiate 2FA setup process
 * This sends a verification code and prepares the 2FA setup
 */
export async function initiateTwoFactorSetup(
  input: Enable2FAInput
): Promise<TwoFactorSetupResult> {
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

  // Check if 2FA is already enabled
  const { data: profile } = await supabase
    .from('profiles')
    .select('email, full_name, two_factor_enabled')
    .eq('id', user.id)
    .single();

  if (!profile) {
    return { success: false, message: 'Profile not found' };
  }

  if (profile.two_factor_enabled) {
    return { success: false, message: 'Two-factor authentication is already enabled' };
  }

  // Check rate limit
  const rateLimit = await checkSetupRateLimit(user.id);
  if (!rateLimit.allowed) {
    return {
      success: false,
      message: `Too many setup attempts. Please wait ${rateLimit.waitMinutes} minutes.`,
    };
  }

  // Invalidate any existing setup tokens
  await adminClient
    .from('two_factor_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('profile_id', user.id)
    .eq('purpose', 'setup')
    .is('used_at', null);

  const method = input.method;
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  if (method === 'authenticator') {
    // Generate TOTP secret
    const secret = generateTOTPSecret();
    const estateSettings = await getEstateEmailSettings();
    const totpUri = generateTOTPUri(secret, profile.email, estateSettings.estateName);

    // Store the secret temporarily (encrypted in production)
    // For now, we'll store it in the token record
    const { error: insertError } = await adminClient
      .from('two_factor_tokens')
      .insert({
        profile_id: user.id,
        token: '000000', // Placeholder - actual validation uses TOTP algorithm
        token_type: method,
        purpose: 'setup',
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('[2FA Setup] Failed to create token:', insertError);
      return { success: false, message: 'Failed to initiate setup' };
    }

    // Store the secret on the profile, encrypted at rest (AES-256-GCM, #455)
    let encryptedSecret: string;
    try {
      encryptedSecret = encryptTotpSecret(secret);
    } catch (error) {
      console.error('[2FA Setup] Could not encrypt TOTP secret:', error instanceof Error ? error.message : error);
      return { success: false, message: 'Failed to initiate setup' };
    }
    const { error: secretError } = await adminClient
      .from('profiles')
      .update({ two_factor_secret_encrypted: encryptedSecret })
      .eq('id', user.id);

    if (secretError) {
      console.error('[2FA Setup] Failed to store TOTP secret:', secretError);
      return { success: false, message: 'Failed to initiate setup' };
    }

    // Generate QR code data (client will render this)
    // In production, use a QR code library
    return {
      success: true,
      message: 'Scan the QR code with your authenticator app',
      qrCode: totpUri,
      secret: secret, // Show to user for manual entry
      expiresAt: expiresAt.toISOString(),
    };
  } else if (method === 'sms') {
    // Get phone number from profile
    const { data: resident } = await supabase
      .from('residents')
      .select('phone_primary')
      .eq('profile_id', user.id)
      .single();

    if (!resident?.phone_primary) {
      return { success: false, message: 'No phone number found. Please update your profile.' };
    }

    // Generate OTP
    const otp = generateOtp();

    // Store token
    const { error: insertError } = await adminClient
      .from('two_factor_tokens')
      .insert({
        profile_id: user.id,
        token: hashOtp(user.id, otp),
        token_type: method,
        purpose: 'setup',
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('[2FA Setup] Failed to create token:', insertError);
      return { success: false, message: 'Failed to initiate setup' };
    }

    // Send SMS
    const smsResult = await sendVerificationSms(resident.phone_primary, otp, undefined, {
      purpose: 'self_auth_2fa', // self-addressed code to the signed-in user: exempt from the comms override (#715)
    });

    if (!smsResult.success) {
      // Rollback token
      await adminClient
        .from('two_factor_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('profile_id', user.id)
        .eq('token', hashOtp(user.id, otp));

      return { success: false, message: `Failed to send SMS: ${smsResult.error}` };
    }

    const maskedPhone = resident.phone_primary.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    return {
      success: true,
      message: `Verification code sent to ${maskedPhone}`,
      expiresAt: expiresAt.toISOString(),
    };
  } else if (method === 'email') {
    // Generate OTP
    const otp = generateOtp();

    // Store token
    const { error: insertError } = await adminClient
      .from('two_factor_tokens')
      .insert({
        profile_id: user.id,
        token: hashOtp(user.id, otp),
        token_type: method,
        purpose: 'setup',
        expires_at: expiresAt.toISOString(),
      });

    if (insertError) {
      console.error('[2FA Setup] Failed to create token:', insertError);
      return { success: false, message: 'Failed to initiate setup' };
    }

    // Send email
    const estateSettings = await getEstateEmailSettings();
    const emailResult = await sendEmail({
      to: {
        email: profile.email,
        name: profile.full_name,
      },
      subject: 'Enable Two-Factor Authentication',
      react: VerificationCodeEmail({
        firstName: profile.full_name.split(' ')[0],
        otp,
        expiryMinutes: TOKEN_EXPIRY_MINUTES,
        estateName: estateSettings.estateName,
        estateLogoUrl: estateSettings.estateLogoUrl,
      }),
      emailType: 'notification',
      metadata: { purpose: '2fa_setup' },
      purpose: 'self_auth_2fa', // exempt from the comms override (#715)
    });

    if (!emailResult.success) {
      // Rollback token
      await adminClient
        .from('two_factor_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('profile_id', user.id)
        .eq('token', hashOtp(user.id, otp));

      return { success: false, message: `Failed to send email: ${emailResult.error}` };
    }

    return {
      success: true,
      message: `Verification code sent to ${profile.email}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  return { success: false, message: 'Invalid 2FA method' };
}

/**
 * Confirm 2FA setup with verification code
 */
export async function confirmTwoFactorSetup(
  code: string,
  method: TwoFactorMethod
): Promise<TwoFactorSetupResult> {
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

  // Get the setup token
  const { data: token } = await adminClient
    .from('two_factor_tokens')
    .select('*')
    .eq('profile_id', user.id)
    .eq('purpose', 'setup')
    .eq('token_type', method)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  if (!token) {
    return { success: false, message: 'No valid setup token found. Please restart the setup process.' };
  }

  // Take one try before checking the code (#1029).
  const attempt = await claimTwoFactorTry(user.id, 'manage');
  if (!attempt.allowed) {
    return { success: false, message: tooManyTriesMessage() };
  }

  let isValid = false;

  if (method === 'authenticator') {
    // Validate TOTP code
    const { data: profile } = await adminClient
      .from('profiles')
      .select('two_factor_secret_encrypted')
      .eq('id', user.id)
      .single();

    if (!profile?.two_factor_secret_encrypted) {
      return { success: false, message: 'Setup not initialized properly' };
    }

    try {
      isValid = await acceptAuthenticatorCode(user.id, readTotpSecret(profile.two_factor_secret_encrypted), code);
    } catch (error) {
      console.error('[2FA Setup] Could not read TOTP secret:', error instanceof Error ? error.message : error);
      return { success: false, message: 'Setup not initialized properly' };
    }
  } else {
    // Validate OTP code
    isValid = otpMatches(String(token.token), user.id, code);
  }

  if (!isValid) {
    // Log failed attempt
    await adminClient.from('two_factor_audit_log').insert({
      profile_id: user.id,
      action: 'failed_login',
      method,
      metadata: { purpose: 'setup', code_attempted: code.substring(0, 2) + '****' },
    });

    return { success: false, message: 'Invalid verification code' };
  }

  await clearTwoFactorTries(user.id, 'manage');

  // Mark token as used
  await adminClient
    .from('two_factor_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', token.id);

  // Enable 2FA on profile
  const now = new Date().toISOString();
  await adminClient
    .from('profiles')
    .update({
      two_factor_enabled: true,
      two_factor_method: method,
      two_factor_verified_at: now,
      two_factor_last_verified_at: now,
    })
    .eq('id', user.id);

  // The code just checked is this session's second step: without the marker and the
  // database record, the next page load would send the admin to the sign-in code screen.
  const sessionRecorded = await issueTwoFactorMarkerCookie();

  // Generate backup codes
  const backupCodes = await generateAndStoreBackupCodes(user.id);

  // Log successful setup
  await adminClient.from('two_factor_audit_log').insert({
    profile_id: user.id,
    action: 'enabled',
    method,
    metadata: { backup_codes_generated: backupCodes.length, session_recorded: sessionRecorded },
  });

  // Audit log
  await logAudit({
    action: 'CREATE',
    entityType: 'two_factor_policies',
    entityId: user.id,
    entityDisplay: `2FA enabled for user`,
    newValues: { method, enabled: true },
  });

  return {
    success: true,
    message: 'Two-factor authentication has been enabled',
    backupCodes,
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

  return codes;
}
