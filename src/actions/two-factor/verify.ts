'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/send-email';
import { sendVerificationSms } from '@/lib/sms/send-sms';
import { getEstateEmailSettings } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import type { TwoFactorVerifyResult, TwoFactorMethod, Verify2FAInput } from '@/types/database';
import crypto from 'crypto';

// Token expiry in minutes
const TOKEN_EXPIRY_MINUTES = 5;

// Max failed attempts before lockout
const MAX_FAILED_ATTEMPTS = 5;

// Lockout duration in minutes
const LOCKOUT_DURATION_MINUTES = 15;

/**
 * Generate a random 6-digit OTP
 */
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Send 2FA verification code for login
 */
export async function sendTwoFactorCode(
  userId: string,
  method: TwoFactorMethod
): Promise<{ success: boolean; message: string; expiresAt?: string }> {
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

  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // Store token
  const { error: insertError } = await adminClient
    .from('two_factor_tokens')
    .insert({
      profile_id: userId,
      token: otp,
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

    const smsResult = await sendVerificationSms(resident.phone_primary, otp);

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
  userId: string,
  input: Verify2FAInput
): Promise<TwoFactorVerifyResult> {
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

    isValid = validateTOTP(input.code, profile.two_factor_secret_encrypted);
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

    if (token && token.token === input.code) {
      isValid = true;

      // Mark token as used
      await adminClient
        .from('two_factor_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', token.id);
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
  userId: string,
  code: string
): Promise<TwoFactorVerifyResult> {
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

  // Hash the provided code
  const codeHash = crypto.createHash('sha256').update(code.toUpperCase()).digest('hex');

  // Find matching unused backup code
  const { data: backupCode } = await adminClient
    .from('two_factor_backup_codes')
    .select('*')
    .eq('profile_id', userId)
    .eq('code_hash', codeHash)
    .is('used_at', null)
    .single();

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

  // Mark backup code as used
  await adminClient
    .from('two_factor_backup_codes')
    .update({ used_at: new Date().toISOString() })
    .eq('id', backupCode.id);

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

/**
 * Validate a TOTP code against a secret
 */
function validateTOTP(code: string, secret: string): boolean {
  const currentTime = Math.floor(Date.now() / 1000 / 30);

  // Allow 1 step before and after for clock drift
  for (let i = -1; i <= 1; i++) {
    const expectedCode = generateTOTPCode(secret, currentTime + i);
    if (expectedCode === code) {
      return true;
    }
  }

  return false;
}

/**
 * Generate a TOTP code for a specific time
 */
function generateTOTPCode(secret: string, timeCounter: number): string {
  const key = base32Decode(secret);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeCounter));

  const hmac = crypto.createHmac('sha1', key);
  hmac.update(timeBuffer);
  const hash = hmac.digest();

  const offset = hash[hash.length - 1] & 0xf;
  const binary =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff);

  const otp = binary % 1000000;
  return otp.toString().padStart(6, '0');
}

/**
 * Base32 decode a string
 */
function base32Decode(encoded: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const paddedEncoded = encoded.toUpperCase().replace(/=+$/, '');

  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of paddedEncoded) {
    const index = alphabet.indexOf(char);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      output.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(output);
}
