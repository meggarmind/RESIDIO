'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import crypto from 'crypto';

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

  // Verify the code
  const method = profile.two_factor_method as 'sms' | 'authenticator' | 'email';
  let isValid = false;

  if (method === 'authenticator') {
    if (!profile.two_factor_secret_encrypted) {
      return { success: false, message: '2FA not properly configured' };
    }
    isValid = validateTOTP(verificationCode, profile.two_factor_secret_encrypted);
  } else {
    // Validate OTP from database
    const { data: token } = await adminClient
      .from('two_factor_tokens')
      .select('*')
      .eq('profile_id', user.id)
      .eq('purpose', 'recovery')
      .eq('token_type', method)
      .is('used_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (token && token.token === verificationCode) {
      isValid = true;
      await adminClient
        .from('two_factor_tokens')
        .update({ used_at: new Date().toISOString() })
        .eq('id', token.id);
    }
  }

  if (!isValid) {
    return { success: false, message: 'Invalid verification code' };
  }

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

/**
 * Regenerate backup codes (simpler version, requires 2FA to be enabled)
 */
export async function regenerateBackupCodes(): Promise<{
  success: boolean;
  message: string;
  codes?: string[];
}> {
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

  // Check if 2FA is enabled
  const { data: profile } = await adminClient
    .from('profiles')
    .select('two_factor_enabled, two_factor_method')
    .eq('id', user.id)
    .single();

  if (!profile || !profile.two_factor_enabled) {
    return { success: false, message: '2FA must be enabled to regenerate backup codes' };
  }

  // Generate new backup codes
  const codes = await generateAndStoreBackupCodes(user.id);

  // Log the regeneration
  await adminClient.from('two_factor_audit_log').insert({
    profile_id: user.id,
    action: 'secret_regenerated',
    method: profile.two_factor_method,
    metadata: { backup_codes_regenerated: codes.length },
  });

  return {
    success: true,
    message: 'New backup codes generated. Save these codes securely.',
    codes,
  };
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
    const hash = crypto.createHash('sha256').update(code).digest('hex');
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

/**
 * Validate a TOTP code
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
 * Generate a TOTP code
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
 * Base32 decode
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
