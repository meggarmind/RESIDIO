'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send-email';
import { sendVerificationSms } from '@/lib/sms/send-sms';
import { getEstateEmailSettings } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import type { TwoFactorVerifyResult, TwoFactorMethod, Verify2FAInput } from '@/types/database';
import { validateTOTP } from '@/lib/auth/totp';
import { getTwoFactorSessionContext } from '@/lib/auth/two-factor-session';
import {
  generateOtp,
  hashOtp,
  otpMatches,
  readTotpSecret,
  encryptTotpSecret,
  isPlaintextTotpSecret,
  verifyBackupCodeHash,
} from '@/lib/auth/two-factor-secrets';

// Token expiry in minutes
const TOKEN_EXPIRY_MINUTES = 5;

// Max failed attempts before lockout
const MAX_FAILED_ATTEMPTS = 5;

// Lockout duration in minutes
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Send 2FA verification code for login
 */
export async function sendTwoFactorCode(
  method: TwoFactorMethod
): Promise<{ success: boolean; message: string; expiresAt?: string }> {
  // The target user is the signed-in session's user, never a caller-supplied id (#455).
  const session = await getTwoFactorSessionContext();
  if (!session) {
    return { success: false, message: 'Not authenticated' };
  }
  const userId = session.userId;
  const adminClient = createAdminClient();

  // Get profile
  const { data: profile } = await adminClient
    .from('profiles')
    .select('email, full_name, two_factor_enabled, two_factor_method, two_factor_secret_encrypted')
    .eq('id', userId)
    .single();

  if (!profile) {
    return { success: false, message: 'User not found' };
  }

  if (!profile.two_factor_enabled) {
    return { success: false, message: 'Two-factor authentication is not enabled' };
  }

  // Check for lockout
  const isLockedOut = await checkLockout(userId);
  if (isLockedOut) {
    return { success: false, message: `Too many failed attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.` };
  }

  // For authenticator method, we don't need to send a code
  if (method === 'authenticator') {
    return { success: true, message: 'Enter the code from your authenticator app' };
  }

  // Invalidate existing tokens
  await adminClient
    .from('two_factor_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('profile_id', userId)
    .eq('purpose', 'login')
    .is('used_at', null);

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // Store token
  const { error: insertError } = await adminClient
    .from('two_factor_tokens')
    .insert({
      profile_id: userId,
      token: hashOtp(userId, otp),
      token_type: method,
      purpose: 'login',
      expires_at: expiresAt.toISOString(),
    });

  if (insertError) {
    console.error('[2FA Verify] Failed to create token:', insertError);
    return { success: false, message: 'Failed to generate verification code' };
  }

  if (method === 'sms') {
    // Get phone number from resident
    const { data: resident } = await adminClient
      .from('residents')
      .select('phone_primary')
      .eq('profile_id', userId)
      .single();

    if (!resident?.phone_primary) {
      return { success: false, message: 'No phone number found' };
    }

    const smsResult = await sendVerificationSms(resident.phone_primary, otp, undefined, {
      purpose: 'self_auth_2fa', // self-addressed code to the signed-in user: exempt from the comms override (#715)
    });

    if (!smsResult.success) {
      return { success: false, message: `Failed to send SMS: ${smsResult.error}` };
    }

    const maskedPhone = resident.phone_primary.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
    return {
      success: true,
      message: `Code sent to ${maskedPhone}`,
      expiresAt: expiresAt.toISOString(),
    };
  } else if (method === 'email') {
    const estateSettings = await getEstateEmailSettings();
    const emailResult = await sendEmail({
      to: {
        email: profile.email,
        name: profile.full_name,
      },
      subject: 'Your Login Verification Code',
      react: VerificationCodeEmail({
        firstName: profile.full_name.split(' ')[0],
        otp,
        expiryMinutes: TOKEN_EXPIRY_MINUTES,
        estateName: estateSettings.estateName,
      }),
      emailType: 'notification',
      metadata: { purpose: '2fa_login' },
      purpose: 'self_auth_2fa', // exempt from the comms override (#715)
    });

    if (!emailResult.success) {
      return { success: false, message: `Failed to send email: ${emailResult.error}` };
    }

    return {
      success: true,
      message: `Code sent to ${profile.email}`,
      expiresAt: expiresAt.toISOString(),
    };
  }

  return { success: false, message: 'Invalid method' };
}

/**
 * Check if user is locked out due to failed attempts
 */
async function checkLockout(userId: string): Promise<boolean> {
  const adminClient = createAdminClient();
  const lockoutWindow = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();

  const { count } = await adminClient
    .from('two_factor_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .eq('action', 'failed_login')
    .gte('created_at', lockoutWindow);

  return (count || 0) >= MAX_FAILED_ATTEMPTS;
}

/**
 * Get remaining attempts before lockout
 */
async function getRemainingAttempts(userId: string): Promise<number> {
  const adminClient = createAdminClient();
  const lockoutWindow = new Date(Date.now() - LOCKOUT_DURATION_MINUTES * 60 * 1000).toISOString();

  const { count } = await adminClient
    .from('two_factor_audit_log')
    .select('*', { count: 'exact', head: true })
    .eq('profile_id', userId)
    .eq('action', 'failed_login')
    .gte('created_at', lockoutWindow);

  return Math.max(0, MAX_FAILED_ATTEMPTS - (count || 0));
}

/**
 * Verify 2FA code during login
 */
export async function verifyTwoFactorCode(
  input: Verify2FAInput
): Promise<TwoFactorVerifyResult> {
  const session = await getTwoFactorSessionContext();
  if (!session) {
    return { success: false, message: 'Not authenticated' };
  }
  const userId = session.userId;
  const adminClient = createAdminClient();

  // Check for lockout
  const isLockedOut = await checkLockout(userId);
  if (isLockedOut) {
    return {
      success: false,
      message: `Too many failed attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
      remainingAttempts: 0,
    };
  }

  // Get profile with 2FA settings
  const { data: profile } = await adminClient
    .from('profiles')
    .select('two_factor_enabled, two_factor_method, two_factor_secret_encrypted')
    .eq('id', userId)
    .single();

  if (!profile) {
    return { success: false, message: 'User not found' };
  }

  if (!profile.two_factor_enabled) {
    return { success: false, message: 'Two-factor authentication is not enabled' };
  }

  const method = profile.two_factor_method as TwoFactorMethod;
  let isValid = false;

  if (method === 'authenticator') {
    // Validate TOTP code
    if (!profile.two_factor_secret_encrypted) {
      return { success: false, message: '2FA not properly configured' };
    }

    try {
      const secret = readTotpSecret(profile.two_factor_secret_encrypted);
      isValid = validateTOTP(input.code, secret);

      // Lazy re-encryption: a legacy plaintext secret is rewritten encrypted the
      // first time its owner proves possession of it. Best effort, never blocks login.
      if (isValid && isPlaintextTotpSecret(profile.two_factor_secret_encrypted)) {
        try {
          await adminClient
            .from('profiles')
            .update({ two_factor_secret_encrypted: encryptTotpSecret(secret) })
            .eq('id', userId);
        } catch (reencryptError) {
          console.error('[2FA Verify] Could not re-encrypt legacy TOTP secret:', reencryptError instanceof Error ? reencryptError.message : reencryptError);
        }
      }
    } catch (error) {
      console.error('[2FA Verify] Could not read TOTP secret:', error instanceof Error ? error.message : error);
      return { success: false, message: '2FA not properly configured' };
    }
  } else {
    // Validate OTP from database
    const { data: token } = await adminClient
      .from('two_factor_tokens')
      .select('*')
      .eq('profile_id', userId)
      .eq('purpose', 'login')
      .eq('token_type', method)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (token && otpMatches(String(token.token), userId, input.code)) {
      // Claim the token atomically: only the request that flips used_at wins, so a
      // concurrent replay of the same code fails.
      const { data: claimed } = await adminClient
        .from('two_factor_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', token.id)
        .is('used_at', null)
        .select('id');

      isValid = (claimed?.length ?? 0) > 0;
    }
  }

  if (!isValid) {
    // Log failed attempt
    await adminClient.from('two_factor_audit_log').insert({
      profile_id: userId,
      action: 'failed_login',
      method,
      metadata: { code_attempted: input.code.substring(0, 2) + '****' },
    });

    const remainingAttempts = await getRemainingAttempts(userId);

    return {
      success: false,
      message: 'Invalid verification code',
      remainingAttempts,
    };
  }

  // Update last verified timestamp
  await adminClient
    .from('profiles')
    .update({ two_factor_last_verified_at: new Date().toISOString() })
    .eq('id', userId);

  // Log successful verification
  await adminClient.from('two_factor_audit_log').insert({
    profile_id: userId,
    action: 'verified_login',
    method,
    metadata: {},
  });

  return {
    success: true,
    message: 'Verification successful',
    verified: true,
  };
}

/**
 * Verify a backup code
 */
export async function verifyBackupCode(
  code: string
): Promise<TwoFactorVerifyResult> {
  const session = await getTwoFactorSessionContext();
  if (!session) {
    return { success: false, message: 'Not authenticated' };
  }
  const userId = session.userId;
  const adminClient = createAdminClient();

  // Check for lockout
  const isLockedOut = await checkLockout(userId);
  if (isLockedOut) {
    return {
      success: false,
      message: `Too many failed attempts. Please try again in ${LOCKOUT_DURATION_MINUTES} minutes.`,
      remainingAttempts: 0,
    };
  }

  // Unused codes for this user (at most ~10). Salted hashes cannot be looked up
  // by value, so each is checked; legacy unsalted SHA-256 rows still verify.
  const { data: candidates } = await adminClient
    .from('two_factor_backup_codes')
    .select('*')
    .eq('profile_id', userId)
    .is('used_at', null);

  const matched = (candidates ?? []).find((c) => verifyBackupCodeHash(code, c.code_hash));

  // Single use: claim the row only while used_at is still NULL and require a row
  // back, so two concurrent submissions of one code cannot both succeed.
  let backupCode: { id: string } | null = null;
  if (matched) {
    const { data: claimed } = await adminClient
      .from('two_factor_backup_codes')
      .update({ used_at: new Date().toISOString() })
      .eq('id', matched.id)
      .is('used_at', null)
      .select('id');
    backupCode = claimed && claimed.length > 0 ? matched : null;
  }

  if (!backupCode) {
    // Log failed attempt
    await adminClient.from('two_factor_audit_log').insert({
      profile_id: userId,
      action: 'failed_login',
      method: null,
      metadata: { backup_code_attempted: true },
    });

    const remainingAttempts = await getRemainingAttempts(userId);

    return {
      success: false,
      message: 'Invalid backup code',
      remainingAttempts,
    };
  }

  // Increment used backup codes count
  await adminClient
    .from('profiles')
    .update({
      two_factor_last_verified_at: new Date().toISOString(),
      two_factor_recovery_codes_used: adminClient.rpc('increment_recovery_codes_used', { profile_id: userId }),
    })
    .eq('id', userId);

  // Log backup code usage
  await adminClient.from('two_factor_audit_log').insert({
    profile_id: userId,
    action: 'backup_code_used',
    method: null,
    metadata: { code_id: backupCode.id },
  });

  return {
    success: true,
    message: 'Backup code verified',
    verified: true,
  };
}

