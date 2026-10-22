'use server';

import { z } from 'zod';

const emailSchema = z.string().email('Please enter a valid email address');

export interface EmailAvailabilityResult {
  available: boolean;
  message?: string;
}

/**
 * Check an email address before registration.
 *
 * Security: this is callable before sign-in, so it gives the same answer for
 * every well-formed address and never reveals whether one is already
 * registered. An address already in use is handled at sign-up.
 */
export async function checkEmailAvailability(
  email: string
): Promise<EmailAvailabilityResult> {
  if (!emailSchema.safeParse(email).success) {
    return {
      available: false,
      message: 'Please enter a valid email address',
    };
  }

  return { available: true };
}
