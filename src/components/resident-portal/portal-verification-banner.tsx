'use client';

import { useAuth } from '@/lib/auth/auth-provider';
import { useResident } from '@/hooks/use-residents';
import { useVerificationStatus } from '@/hooks/use-verification';
import { VerificationPromptBanner } from './verification-prompt-banner';

/**
 * Portal Verification Banner
 *
 * Wrapper component that fetches the current resident's verification status
 * and displays the verification prompt banner if verification is incomplete.
 *
 * For accounts older than 90 days, the banner becomes non-dismissible (persistent)
 * until the resident verifies their contact information.
 */
export function PortalVerificationBanner() {
  const { residentId } = useAuth();
  const { data: resident } = useResident(residentId || undefined);
  const { data: status } = useVerificationStatus(residentId || undefined);

  // Don't render until we have both resident and status
  if (!status || !resident) return null;

  return (
    <VerificationPromptBanner
      emailVerified={status.email?.verified ?? false}
      phoneVerified={status.phone?.verified ?? false}
      hasEmail={!!status.email?.value}
      createdAt={resident.created_at}
    />
  );
}
