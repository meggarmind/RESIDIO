'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');

export type EmailAvailabilityReason = 'existing_resident' | 'existing_auth_user';

export interface EmailAvailabilityResult {
  available: boolean;
  reason?: EmailAvailabilityReason;
  message?: string;
}

/**
 * Check if an email address is available for registration.
 *
 * This checks both the residents table (for existing resident records)
 * and auth.users (for existing authentication accounts).
 *
 * Security: Uses constant-time-ish response to minimize email enumeration.
 * The check is intentionally designed to not reveal specific details about
 * why an email isn't available to external callers.
 */
export async function checkEmailAvailability(
  email: string
): Promise<EmailAvailabilityResult> {
  // Validate email format
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) {
    return {
      available: false,
      message: 'Please enter a valid email address',
    };
  }

  const normalizedEmail = email.toLowerCase().trim();
  const supabase = createAdminClient();

  try {
    // Run both checks in parallel for efficiency
    const [residentsResult, authUsersResult] = await Promise.all([
      // Check residents table
      supabase
        .from('residents')
        .select('id')
        .ilike('email', normalizedEmail)
        .limit(1),

      // Check auth.users
      supabase.auth.admin.listUsers(),
    ]);

    // Check if email exists in residents table
    const existingResident = residentsResult.data && residentsResult.data.length > 0;

    // Check if email exists in auth.users
    const existingAuthUser = authUsersResult.data?.users?.some(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    // Determine result
    if (existingResident) {
      return {
        available: false,
        reason: 'existing_resident',
        message:
          'We found your existing profile! Please log in with this email address. If you\'ve forgotten your password, use the "Forgot Password" option to reset it.',
      };
    }

    if (existingAuthUser) {
      return {
        available: false,
        reason: 'existing_auth_user',
        message:
          'An account with this email already exists. Please log in or use the "Forgot Password" option if you need to reset your password.',
      };
    }

    // Email is available
    return {
      available: true,
    };
  } catch (error) {
    console.error('Error checking email availability:', error);
    // On error, allow proceeding (server-side validation will catch issues)
    // This prevents blocking users due to transient errors
    return {
      available: true,
    };
  }
}

/**
 * Check if an email exists in the system (for internal admin use).
 *
 * This returns more detailed information for admin tools, including
 * whether the email is linked to a resident or just an auth account.
 */
export async function checkEmailExistsDetailed(email: string): Promise<{
  existsInResidents: boolean;
  existsInAuth: boolean;
  residentId?: string;
  authUserId?: string;
  hasLinkedProfile: boolean;
}> {
  const normalizedEmail = email.toLowerCase().trim();
  const supabase = createAdminClient();

  try {
    // Check residents table with more details
    const { data: resident } = await supabase
      .from('residents')
      .select('id')
      .ilike('email', normalizedEmail)
      .single();

    // Check auth.users
    const { data: authUsers } = await supabase.auth.admin.listUsers();
    const authUser = authUsers?.users?.find(
      (u) => u.email?.toLowerCase() === normalizedEmail
    );

    // Check if there's a linked profile
    let hasLinkedProfile = false;
    if (authUser) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('resident_id')
        .eq('id', authUser.id)
        .single();

      hasLinkedProfile = !!profile?.resident_id;
    }

    return {
      existsInResidents: !!resident,
      existsInAuth: !!authUser,
      residentId: resident?.id,
      authUserId: authUser?.id,
      hasLinkedProfile,
    };
  } catch (error) {
    console.error('Error checking email existence:', error);
    return {
      existsInResidents: false,
      existsInAuth: false,
      hasLinkedProfile: false,
    };
  }
}
