import type { SecurityContactStatus, AccessCode } from '@/types/database';

/**
 * Computes the effective status of a security contact based on:
 * 1. The stored contact status (approval state)
 * 2. Whether any access codes are still valid (not expired)
 *
 * This ensures the UI reflects actual access validity, not just approval status.
 */
export function getEffectiveContactStatus(
  storedStatus: SecurityContactStatus,
  accessCodes?: AccessCode[]
): SecurityContactStatus {
  // If already suspended/revoked, keep that status
  if (storedStatus === 'suspended' || storedStatus === 'revoked') {
    return storedStatus;
  }

  // If stored status is expired, keep it
  if (storedStatus === 'expired') {
    return storedStatus;
  }

  // If stored as active, check if any codes are actually valid
  if (storedStatus === 'active') {
    const hasValidCode = accessCodes?.some((code) => {
      if (!code.is_active) return false;
      if (!code.valid_until) return true; // No expiry = always valid
      return new Date(code.valid_until) > new Date();
    });

    // If no valid codes, show as expired
    return hasValidCode ? 'active' : 'expired';
  }

  return storedStatus;
}

/**
 * Finds the first valid (non-expired) active access code for a contact.
 * Returns undefined if no valid codes exist.
 */
export function findValidAccessCode(accessCodes?: AccessCode[]): AccessCode | undefined {
  if (!accessCodes) return undefined;

  return accessCodes.find((code) => {
    if (!code.is_active) return false;
    if (!code.valid_until) return true; // No expiry = always valid
    return new Date(code.valid_until) > new Date();
  });
}
