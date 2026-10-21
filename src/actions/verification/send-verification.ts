'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { sendVerificationSms } from '@/lib/sms/send-sms';
import { sendEmail } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import { getEstateEmailSettings } from '@/lib/email/send-email';
import { logAudit } from '@/lib/audit/logger';
import type { SendVerificationResult } from '@/types/database';
import { authorizePermission } from '@/lib/auth/authorize';
import { PERMISSIONS } from '@/lib/auth/action-roles';
import { isChannelImplemented } from '@/lib/notifications/types';
import { resolveResidentOverride } from '@/lib/comms-override/resident-flag';
import {
  TOKEN_EXPIRY_MINUTES,
  checkRateLimit,
  generateOTP,
  invalidateExistingTokens,
} from '@/lib/verification/tokens';

/**
 * Send email verification code to a resident
 */
export async function sendEmailVerification(residentId: string): Promise<SendVerificationResult> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_VERIFY);
  if (!auth.authorized) return { success: false, message: auth.error || 'Unauthorized' };

  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get the current user (for audit logging)
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // Get resident details
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, email, first_name, last_name, email_verified_at')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, message: 'Resident not found' };
  }

  if (!resident.email) {
    return { success: false, message: 'Resident does not have an email address' };
  }

  if (resident.email_verified_at) {
    return { success: false, message: 'Email is already verified' };
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(residentId, 'email');
  if (!rateLimit.allowed) {
    return {
      success: false,
      message: `Too many verification attempts. Please wait ${rateLimit.waitMinutes} minutes.`,
    };
  }

  // Communications override (#716): read the flag before any token is created; fail closed.
  const override = await resolveResidentOverride([resident.id]);
  if (!override.ok) {
    return { success: false, message: override.error };
  }

  // Invalidate existing tokens
  await invalidateExistingTokens(residentId, 'email');

  // Generate OTP and expiry
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // Store token in database
  const { error: insertError } = await adminClient
    .from('verification_tokens')
    .insert({
      resident_id: residentId,
      token_type: 'email',
      token: otp,
      target_value: resident.email,
      expires_at: expiresAt.toISOString(),
    });

  if (insertError) {
    console.error('[Verification] Failed to create token:', insertError);
    return { success: false, message: 'Failed to create verification token' };
  }

  // Get estate settings for email template
  const estateSettings = await getEstateEmailSettings();

  // Send verification email
  const emailResult = await sendEmail({
    to: {
      email: resident.email,
      name: `${resident.first_name} ${resident.last_name}`,
      residentId: resident.id,
    },
    subject: 'Verify Your Email Address',
    react: VerificationCodeEmail({
      firstName: resident.first_name,
      otp,
      expiryMinutes: TOKEN_EXPIRY_MINUTES,
      estateName: estateSettings.estateName,
    }),
    emailType: 'notification',
    residentOverride: override.residentOverride,
    metadata: { purpose: 'email_verification' },
  });

  if (!emailResult.success) {
    // Rollback: invalidate the token we just created
    await adminClient
      .from('verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('resident_id', residentId)
      .eq('token', otp);

    return { success: false, message: `Failed to send email: ${emailResult.error}` };
  }

  // Audit log
  if (userId) {
    await logAudit({
      action: 'CREATE',
      entityType: 'verification_tokens',
      entityId: residentId,
      entityDisplay: `Email verification for ${resident.first_name} ${resident.last_name}`,
      newValues: { token_type: 'email', target_value: resident.email },
    });
  }

  return {
    success: true,
    message: `Verification code sent to ${resident.email}`,
    expiresAt: expiresAt.toISOString(),
  };
}

/**
 * Send phone verification code (SMS) to a resident
 */
export async function sendPhoneVerification(residentId: string): Promise<SendVerificationResult> {
  const auth = await authorizePermission(PERMISSIONS.RESIDENTS_VERIFY);
  if (!auth.authorized) return { success: false, message: auth.error || 'Unauthorized' };

  // Owner decision 2026-10-13: contact-verification SMS is off until Termii is connected.
  // Must run after authorize and before any DB work (no token insert, no rate-limit use).
  // Re-enable by adding 'sms' to IMPLEMENTED_CHANNELS in src/lib/notifications/types.ts.
  if (!isChannelImplemented('sms')) {
    return { success: false, message: 'SMS verification is unavailable until the SMS provider is connected' };
  }

  const supabase = await createServerSupabaseClient();
  const adminClient = createAdminClient();

  // Get the current user (for audit logging)
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user?.id;

  // Get resident details
  const { data: resident, error: residentError } = await supabase
    .from('residents')
    .select('id, phone_primary, first_name, last_name, phone_verified_at')
    .eq('id', residentId)
    .single();

  if (residentError || !resident) {
    return { success: false, message: 'Resident not found' };
  }

  if (!resident.phone_primary) {
    return { success: false, message: 'Resident does not have a phone number' };
  }

  if (resident.phone_verified_at) {
    return { success: false, message: 'Phone is already verified' };
  }

  // Check rate limit
  const rateLimit = await checkRateLimit(residentId, 'phone');
  if (!rateLimit.allowed) {
    return {
      success: false,
      message: `Too many verification attempts. Please wait ${rateLimit.waitMinutes} minutes.`,
    };
  }

  // Communications override (#716): read the flag before any token is created; fail closed.
  const override = await resolveResidentOverride([resident.id]);
  if (!override.ok) {
    return { success: false, message: override.error };
  }

  // Invalidate existing tokens
  await invalidateExistingTokens(residentId, 'phone');

  // Generate OTP and expiry
  const otp = generateOTP();
  const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

  // Store token in database
  const { error: insertError } = await adminClient
    .from('verification_tokens')
    .insert({
      resident_id: residentId,
      token_type: 'phone',
      token: otp,
      target_value: resident.phone_primary,
      expires_at: expiresAt.toISOString(),
    });

  if (insertError) {
    console.error('[Verification] Failed to create token:', insertError);
    return { success: false, message: 'Failed to create verification token' };
  }

  // Send verification SMS
  const smsResult = await sendVerificationSms(
    resident.phone_primary,
    otp,
    resident.id,
    { residentOverride: override.residentOverride }
  );

  if (!smsResult.success) {
    // Rollback: invalidate the token we just created
    await adminClient
      .from('verification_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('resident_id', residentId)
      .eq('token', otp);

    return { success: false, message: `Failed to send SMS: ${smsResult.error}` };
  }

  // Audit log
  if (userId) {
    await logAudit({
      action: 'CREATE',
      entityType: 'verification_tokens',
      entityId: residentId,
      entityDisplay: `Phone verification for ${resident.first_name} ${resident.last_name}`,
      newValues: { token_type: 'phone', target_value: resident.phone_primary },
    });
  }

  // Mask phone number for response
  const maskedPhone = resident.phone_primary.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');

  return {
    success: true,
    message: `Verification code sent to ${maskedPhone}`,
    expiresAt: expiresAt.toISOString(),
  };
}
