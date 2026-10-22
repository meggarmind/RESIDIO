'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import crypto from 'crypto';
import { hashBackupCode } from '@/lib/auth/two-factor-secrets';
import { checkAccountCode, claimTwoFactorTry, clearTwoFactorTries, tooManyTriesMessage } from '@/lib/auth/two-factor-guard';

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

