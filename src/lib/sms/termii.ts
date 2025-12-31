/**
 * Termii SMS client configuration for Residio
 *
 * Termii is a Nigerian SMS gateway that provides reliable SMS delivery
 * across Nigerian mobile networks.
 *
 * API Documentation: https://developers.termii.com/
 */

// Termii API configuration
export const termiiConfig = {
  apiKey: process.env.TERMII_API_KEY || '',
  senderId: process.env.TERMII_SENDER_ID || 'Residio',
  baseUrl: 'https://api.ng.termii.com/api',
};

// Check if Termii is properly configured
export function isSmsConfigured(): boolean {
  return !!process.env.TERMII_API_KEY;
}

/**
 * Normalize phone number to E.164 format for Nigerian numbers
 * Handles common Nigerian number formats:
 * - 08012345678 -> +2348012345678
 * - 8012345678 -> +2348012345678
 * - 2348012345678 -> +2348012345678
 * - +2348012345678 -> +2348012345678
 */
export function normalizePhoneNumber(phone: string): string {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[^\d+]/g, '');

  // If starts with +, keep it
  if (normalized.startsWith('+')) {
    return normalized;
  }

  // If starts with 234, add +
  if (normalized.startsWith('234')) {
    return `+${normalized}`;
  }

  // If starts with 0, replace with +234
  if (normalized.startsWith('0')) {
    return `+234${normalized.substring(1)}`;
  }

  // If it's just the local number (10 digits starting with 7, 8, or 9)
  if (normalized.length === 10 && /^[789]/.test(normalized)) {
    return `+234${normalized}`;
  }

  // If 11 digits starting with 0
  if (normalized.length === 11 && normalized.startsWith('0')) {
    return `+234${normalized.substring(1)}`;
  }

  // Return as-is with + prefix if not already present
  return normalized.startsWith('+') ? normalized : `+${normalized}`;
}

/**
 * Format phone for Termii API (without + prefix)
 */
export function formatPhoneForTermii(phone: string): string {
  const normalized = normalizePhoneNumber(phone);
  return normalized.startsWith('+') ? normalized.substring(1) : normalized;
}
