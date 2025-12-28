'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { passwordSchema } from '@/lib/validators/password';

// Validation schema for portal registration
const registerSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: passwordSchema,
  residentCode: z.string().length(6, 'Resident code must be 6 digits'),
});

export type RegisterResidentPortalInput = z.infer<typeof registerSchema>;

export interface RegisterResidentPortalResult {
  success: boolean;
  error?: string;
  userId?: string;
}

/**
 * Register a resident for portal access
 *
 * Flow:
 * 1. Validate input
 * 2. Find resident by code and verify portal is enabled
 * 3. Check email matches resident record (optional security)
 * 4. Create Supabase Auth user
 * 5. Create profile linked to resident via resident_id
 */
export async function registerResidentPortal(
  input: RegisterResidentPortalInput
): Promise<RegisterResidentPortalResult> {
  // Validate input
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message || 'Invalid input',
    };
  }

  const { email, password, residentCode } = parsed.data;
  const supabase = createAdminClient();

  try {
    // 1. Find resident by code
    const { data: resident, error: residentError } = await supabase
      .from('residents')
      .select('id, first_name, last_name, email, portal_enabled')
      .eq('resident_code', residentCode)
      .single();

    if (residentError || !resident) {
      return {
        success: false,
        error: 'Invalid resident code. Please check and try again.',
      };
    }

    // 2. Verify portal is enabled for this resident
    if (!resident.portal_enabled) {
      return {
        success: false,
        error: 'Portal access has not been enabled for this resident. Please contact the estate office.',
      };
    }

    // 3. Check if email matches resident record (optional but recommended)
    if (resident.email && resident.email.toLowerCase() !== email.toLowerCase()) {
      return {
        success: false,
        error: 'The email address does not match our records. Please use the email associated with your resident account.',
      };
    }

    // 4. Check if resident already has a linked profile
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('resident_id', resident.id)
      .single();

    if (existingProfile) {
      return {
        success: false,
        error: 'A portal account already exists for this resident. Please use the login page or reset your password.',
      };
    }

    // 5. Check if email is already registered (using listUsers with filter)
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const emailExists = existingUsers?.users?.some(u => u.email?.toLowerCase() === email.toLowerCase());
    if (emailExists) {
      return {
        success: false,
        error: 'An account with this email already exists. Please use a different email or login with your existing account.',
      };
    }

    // 6. Create Supabase Auth user
    const fullName = `${resident.first_name} ${resident.last_name}`;
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm for simplicity
      user_metadata: {
        full_name: fullName,
        is_resident: true,
      },
    });

    if (authError || !authData.user) {
      console.error('Auth user creation failed:', authError);
      return {
        success: false,
        error: 'Failed to create account. Please try again.',
      };
    }

    // 7. Create profile with resident_id link
    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        email: email,
        full_name: fullName,
        role: 'security_officer', // Default role, will use resident_id for portal access
        resident_id: resident.id,
      });

    if (profileError) {
      // Rollback: delete the auth user if profile creation fails
      await supabase.auth.admin.deleteUser(authData.user.id);
      console.error('Profile creation failed:', profileError);
      return {
        success: false,
        error: 'Failed to complete registration. Please try again.',
      };
    }

    return {
      success: true,
      userId: authData.user.id,
    };
  } catch (error) {
    console.error('Registration error:', error);
    return {
      success: false,
      error: 'An unexpected error occurred. Please try again.',
    };
  }
}
