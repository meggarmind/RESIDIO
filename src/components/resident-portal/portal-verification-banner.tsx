'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { useVerificationStatus } from '@/hooks/use-verification';
import { VerificationPromptBanner } from './verification-prompt-banner';

/**
 * Portal Verification Banner
 *
 * Wrapper component that fetches the current resident's verification status
 * and displays the verification prompt banner if verification is incomplete.
 */
export function PortalVerificationBanner() {
  const { residentId } = useAuth();
  const { data: status } = useVerificationStatus(residentId || undefined);

  // Don't render until we have status
  if (!status) return null;

  return (
    <VerificationPromptBanner
      emailVerified={status.email?.verified ?? false}
      phoneVerified={status.phone?.verified ?? false}
      hasEmail={!!status.email?.value}
    />
  );
}
