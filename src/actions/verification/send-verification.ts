'use server';

import { createServerSupabaseClient, createAdminClient } from '@/lib/supabase/server';
import { sendVerificationSms } from '@/lib/sms/send-sms';
import { sendEmail } from '@/lib/email/send-email';
import { VerificationCodeEmail } from '@/emails/verification-code';
import { getEstateEmailSettings } from '@/lib/email/send-email';
import { logAudit } from '@/lib/audit/logger';
import type { VerificationType, SendVerificationResult } from '@/types/database';

// Token expiry in minutes
const TOKEN_EXPIRY_MINUTES = 30;

// Rate limit: max tokens per hour per resident
const MAX_TOKENS_PER_HOUR = 3;

/**
 * Generate a random 6-digit OTP
 */
function generateOTP(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Check rate limit for verification token generation
 */
async function checkRateLimit(residentId: string, tokenType: VerificationType): Promise<{
  allowed: boolean;
  remainingAttempts: number;
  waitMinutes?: number;
}> {
  const supabase = createAdminClient();

  // Count tokens created in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { count } = await supabase
    .from('verification_tokens')
    .select('*', { count: 'exact', head: true })
    .eq('resident_id', residentId)
    .eq('token_type', tokenType)
    .gte('created_at', oneHourAgo);

  const tokensUsed = count || 0;
  const remainingAttempts = MAX_TOKENS_PER_HOUR - tokensUsed;

  if (remainingAttempts <= 0) {
    return {
      allowed: false,
      remainingAttempts: 0,
      waitMinutes: 60,
    };
  }

  return {
    allowed: true,
    remainingAttempts,
  };
}

/**
 * Invalidate any existing unused tokens for the same resident and type
 */
async function invalidateExistingTokens(
  residentId: string,
  tokenType: VerificationType
): Promise<void> {
  const supabase = createAdminClient();

  // Mark existing unused tokens as used (effectively invalidating them)
  await supabase
    .from('verification_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('resident_id', residentId)
    .eq('token_type', tokenType)
    .is('used_at', null);
}

/**
 * Send email verification code to a resident
 */
export async function sendEmailVerification(residentId: string): Promise<SendVerificationResult> {
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
    resident.id
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
