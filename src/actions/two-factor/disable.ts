'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { TwoFactorMethod } from '@/types/database';

/**
 * Disable 2FA for the current user
 */
export async function disableTwoFactor(
  verificationCode: string
): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_DISABLE);
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

  if (!profile) {
    return { success: false, message: 'Profile not found' };
  }

  if (!profile.two_factor_enabled) {
    return { success: false, message: 'Two-factor authentication is not enabled' };
  }

  // Verify the code before disabling
  const method = profile.two_factor_method as TwoFactorMethod;
  let isValid = false;

  if (method === 'authenticator') {
    // Validate TOTP code
    if (!profile.two_factor_secret_encrypted) {
      return { success: false, message: '2FA not properly configured' };
    }
    isValid = validateTOTP(verificationCode, profile.two_factor_secret_encrypted);
  } else {
    // For SMS/email, we need to send a disable code first
    const { data: token } = await adminClient
      .from('two_factor_tokens')
      .select('*')
      .eq('profile_id', user.id)
      .eq('purpose', 'disable')
      .eq('token_type', method)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (token && token.token === verificationCode) {
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
      profile_id: user.id,
      action: 'failed_login',
      method,
      metadata: { purpose: 'disable', code_attempted: verificationCode.substring(0, 2) + '****' },
    });

    return { success: false, message: 'Invalid verification code' };
  }

  // Disable 2FA
  await adminClient
    .from('profiles')
    .update({
      two_factor_enabled: false,
      two_factor_method: null,
      two_factor_secret_encrypted: null,
      two_factor_verified_at: null,
    })
    .eq('id', user.id);

  // Delete backup codes
  await adminClient
    .from('two_factor_backup_codes')
    .delete()
    .eq('profile_id', user.id);

  // Log the disable action
  await adminClient.from('two_factor_audit_log').insert({
    profile_id: user.id,
    action: 'disabled',
    method,
    metadata: {},
  });

  // Audit log
  await logAudit({
    action: 'DELETE',
    entityType: 'two_factor_policies',
    entityId: user.id,
    entityDisplay: '2FA disabled for user',
    oldValues: { method, enabled: true },
    newValues: { enabled: false },
  });

  return { success: true, message: 'Two-factor authentication has been disabled' };
}

/**
 * Reset 2FA for another user (admin only)
 */
export async function resetUserTwoFactor(
  targetUserId: string,
  reason: string
): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_RESET_USER);
  if (!auth.authorized) {
    return { success: false, message: auth.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();

  // Get target user profile
  const { data: targetProfile } = await adminClient
    .from('profiles')
    .select('id, full_name, email, two_factor_enabled, two_factor_method')
    .eq('id', targetUserId)
    .single();

  if (!targetProfile) {
    return { success: false, message: 'User not found' };
  }

  if (!targetProfile.two_factor_enabled) {
    return { success: false, message: 'User does not have 2FA enabled' };
  }

  const oldMethod = targetProfile.two_factor_method;

  // Disable 2FA for target user
  await adminClient
    .from('profiles')
    .update({
      two_factor_enabled: false,
      two_factor_method: null,
      two_factor_secret_encrypted: null,
      two_factor_verified_at: null,
    })
    .eq('id', targetUserId);

  // Delete backup codes
  await adminClient
    .from('two_factor_backup_codes')
    .delete()
    .eq('profile_id', targetUserId);

  // Delete pending tokens
  await adminClient
    .from('two_factor_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('profile_id', targetUserId)
    .is('used_at', null);

  // Log the admin reset action
  await adminClient.from('two_factor_audit_log').insert({
    profile_id: targetUserId,
    action: 'disabled',
    method: oldMethod as TwoFactorMethod | null,
    metadata: {
      reset_by: auth.userId,
      reason,
      admin_reset: true,
    },
  });

  // Audit log
  await logAudit({
    action: 'UPDATE',
    entityType: 'profiles',
    entityId: targetUserId,
    entityDisplay: `Admin reset 2FA for ${targetProfile.full_name}`,
    oldValues: { two_factor_enabled: true, two_factor_method: oldMethod },
    newValues: { two_factor_enabled: false, two_factor_method: null },
    description: `Admin reset 2FA. Reason: ${reason}`,
  });

  return {
    success: true,
    message: `Two-factor authentication has been reset for ${targetProfile.full_name}`,
  };
}

/**
 * Request a disable code (for SMS/email methods)
 */
export async function requestDisableCode(): Promise<{ success: boolean; message: string }> {
  const auth = await authorizePermission(PERMISSIONS.TWO_FACTOR_DISABLE);
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

  // Get profile
  const { data: profile } = await adminClient
    .from('profiles')
    .select('two_factor_enabled, two_factor_method')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.two_factor_enabled) {
    return { success: false, message: '2FA is not enabled' };
  }

  const method = profile.two_factor_method as TwoFactorMethod;

  if (method === 'authenticator') {
    return { success: true, message: 'Enter your authenticator code to disable 2FA' };
  }

  // Import the sendTwoFactorCode function
  const { sendTwoFactorCode } = await import('./verify');

  // Use the verification flow but with 'disable' purpose
  // For now, we'll use the login flow
  const result = await sendTwoFactorCode(user.id, method);

  if (result.success) {
    // Update the token purpose to 'disable'
    await adminClient
      .from('two_factor_tokens')
      .update({ purpose: 'disable' })
      .eq('profile_id', user.id)
      .eq('purpose', 'login')
      .is('used_at', null);
  }

  return result;
}

/**
 * Validate a TOTP code against a secret
 */
function validateTOTP(code: string, secret: string): boolean {
  const currentTime = Math.floor(Date.now() / 1000 / 30);

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
  const crypto = require('crypto');
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
