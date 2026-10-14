'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { timingSafeEqual } from 'node:crypto';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { logAudit } from '@/lib/audit/logger';
import type { VerificationType, VerifyCodeResult, ContactVerificationStatus } from '@/types/database';

const MAX_VERIFICATION_ATTEMPTS = 5;

/** Constant-time comparison; a length mismatch is a plain mismatch, never a throw. */
function codesMatch(supplied: string, stored: string): boolean {
  const a = Buffer.from(String(supplied ?? ''));
  const b = Buffer.from(String(stored ?? '').trim());
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Minimal typed view of the admin client for the new RPC. The generated types do
 * not know record_failed_verification_attempt until the migration is applied and
 * `npm run db:types` is re-run, so the cast is confined to this one wrapper.
 * remove the cast after db:types regeneration (#556)
 */
interface FailedAttemptRpcClient {
  rpc(
    name: 'record_failed_verification_attempt',
    args: { p_resident_id: string; p_token_type: string; p_max_attempts: number }
  ): PromiseLike<{
    data: { attempts: number; invalidated: boolean }[] | null;
    error: unknown;
  }>;
}

async function recordFailedAttemptRpc(
  client: ReturnType<typeof createAdminClient>,
  residentId: string,
  tokenType: VerificationType
) {
  return (client as unknown as FailedAttemptRpcClient).rpc('record_failed_verification_attempt', {
    p_resident_id: residentId,
    p_token_type: tokenType,
    p_max_attempts: MAX_VERIFICATION_ATTEMPTS,
  });
}

/**
 * Verify a contact (email or phone) using an OTP code
 */
export async function verifyContactToken(
  residentId: string,
  token: string,
  tokenType: VerificationType
): Promise<VerifyCodeResult> {
  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get the current user (for audit logging)
  const { data: { user } } = await supabase.auth.getUser();

  // Find the ACTIVE token for this resident and type. The supplied code is
  // deliberately NOT part of the query: a wrong guess must find the token so the
  // attempt can be counted (#556).
  const { data: tokenRecord, error: tokenError } = await adminClient
    .from('verification_tokens')
    .select('id, token, target_value, expires_at')
    .eq('resident_id', residentId)
    .eq('token_type', tokenType)
    .is('used_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (tokenError || !tokenRecord) {
    return { success: false, message: 'Invalid or expired verification code' };
  }

  // Check if token is expired (an expired code is not a guess; do not count it)
  if (new Date(tokenRecord.expires_at) < new Date()) {
    return { success: false, message: 'Verification code has expired. Please request a new one.' };
  }

  if (!codesMatch(token, tokenRecord.token)) {
    const { data: outcome, error: rpcError } = await recordFailedAttemptRpc(
      adminClient,
      residentId,
      tokenType
    );
    if (rpcError) {
      // Fail closed: never verify, and report the generic message.
      console.error('[Verification] Failed to record failed attempt:', {
        residentId,
        tokenType,
        error: rpcError,
      });
      return { success: false, message: 'Invalid or expired verification code' };
    }
    if (outcome?.some((row) => row.invalidated)) {
      return {
        success: false,
        message: 'Too many incorrect attempts. Please request a new verification code.',
      };
    }
    return { success: false, message: 'Invalid or expired verification code' };
  }

  // Get resident details for verification
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, first_name, last_name, email, phone_primary')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, message: 'Resident not found' };
  }

  // Verify the target value matches current contact info
  const currentValue = tokenType === 'email' ? resident.email : resident.phone_primary;
  if (tokenRecord.target_value !== currentValue) {
    return {
      success: false,
      message: `Your ${tokenType} has changed since the code was sent. Please request a new code.`,
    };
  }

  const now = new Date().toISOString();

  // Mark token as used
  await adminClient
    .from('verification_tokens')
    .update({ used_at: now })
    .eq('id', tokenRecord.id);

  // Update resident verification timestamp
  const updateField = tokenType === 'email' ? 'email_verified_at' : 'phone_verified_at';
  const { error: updateError } = await adminClient
    .from('residents')
    .update({ [updateField]: now })
    .eq('id', residentId);

  if (updateError) {
    console.error('[Verification] Failed to update resident:', updateError);
    return { success: false, message: 'Failed to update verification status' };
  }

  // Audit log
  await logAudit({
    action: 'VERIFY',
    entityType: 'residents',
    entityId: residentId,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    oldValues: { [updateField]: null },
    newValues: { [updateField]: now, verified_value: tokenRecord.target_value },
  });

  revalidatePath('/portal/profile');
  revalidatePath(`/residents/${residentId}`);

  return {
    success: true,
    message: `Your ${tokenType} has been verified successfully!`,
    verifiedAt: now,
  };
}

/**
 * Get verification status for a resident
 */
export async function getVerificationStatus(residentId: string): Promise<{
  success: boolean;
  status?: ContactVerificationStatus;
  error?: string;
}> {
  const supabase = await createServerSupabaseClient();

  const { data: resident, error } = await supabase
    .from('residents')
    .select('email, phone_primary, email_verified_at, phone_verified_at')
    .eq('id', residentId)
    .single();

  if (error || !resident) {
    return { success: false, error: 'Resident not found' };
  }

  return {
    success: true,
    status: {
      email: {
        value: resident.email,
        verified: !!resident.email_verified_at,
        verified_at: resident.email_verified_at,
      },
      phone: {
        value: resident.phone_primary,
        verified: !!resident.phone_verified_at,
        verified_at: resident.phone_verified_at,
      },
    },
  };
}

/**
 * Admin override: manually verify a resident's contact
 * Requires RESIDENTS_VERIFY permission
 */
export async function adminVerifyContact(
  residentId: string,
  contactType: VerificationType
): Promise<VerifyCodeResult> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_VERIFY);
  if (!auth.authorized) {
    return { success: false, message: auth.error || 'Unauthorized' };
  }

  const adminClient = createAdminClient();

  // Get resident details for audit
  const { data: resident, error: residentError } = await adminClient
    .from('residents')
    .select('id, first_name, last_name, email, phone_primary, email_verified_at, phone_verified_at')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, message: 'Resident not found' };
  }

  const now = new Date().toISOString();
  const updateField = contactType === 'email' ? 'email_verified_at' : 'phone_verified_at';
  const currentValue = contactType === 'email' ? resident.email : resident.phone_primary;
  const currentVerified = contactType === 'email' ? resident.email_verified_at : resident.phone_verified_at;

  if (currentVerified) {
    return { success: false, message: `${contactType === 'email' ? 'Email' : 'Phone'} is already verified` };
  }

  if (!currentValue) {
    return { success: false, message: `Resident does not have a ${contactType} to verify` };
  }

  // Update verification timestamp
  const { error: updateError } = await adminClient
    .from('residents')
    .update({ [updateField]: now })
    .eq('id', residentId);

  if (updateError) {
    return { success: false, message: 'Failed to update verification status' };
  }

  // Audit log with admin override note
  await logAudit({
    action: 'VERIFY',
    entityType: 'residents',
    entityId: residentId,
    entityDisplay: `${resident.first_name} ${resident.last_name}`,
    oldValues: { [updateField]: null },
    newValues: { [updateField]: now, verified_by_admin: true },
    description: `Admin manually verified ${contactType}`,
  });

  revalidatePath('/residents');
  revalidatePath(`/residents/${residentId}`);

  return {
    success: true,
    message: `${contactType === 'email' ? 'Email' : 'Phone'} verified by admin`,
    verifiedAt: now,
  };
}

/**
 * Check if a resident has completed required verifications
 * Used by role assignment to enforce verification requirements
 */
export async function checkContactVerificationForRole(
  residentId: string,
  roleId: string
): Promise<{
  allowed: boolean;
  reason?: string;
}> {
  const supabase = await createServerSupabaseClient();

  // Get role requirements
  const { data: role, error: roleError } = await supabase
    .from('app_roles')
    .select('id, display_name, requires_contact_verification')
    .eq('id', roleId)
    .single();

  if (roleError || !role) {
    return { allowed: false, reason: 'Role not found' };
  }

  // If role doesn't require verification, allow
  if (!role.requires_contact_verification) {
    return { allowed: true };
  }

  // Get resident verification status
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('email, email_verified_at')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { allowed: false, reason: 'Resident not found' };
  }

  // Check if email is verified (email verification is required for all roles that need verification)
  if (!resident.email_verified_at) {
    // Check if they even have an email
    if (!resident.email) {
      return {
        allowed: false,
        reason: `The "${role.display_name}" role requires a verified email address. Please add an email address first.`,
      };
    }

    return {
      allowed: false,
      reason: `The "${role.display_name}" role requires a verified email address. Please verify your email first.`,
    };
  }

  return { allowed: true };
}
