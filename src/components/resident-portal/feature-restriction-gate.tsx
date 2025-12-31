'use client';

import { ReactNode } from 'react';
import { ShieldAlert, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import Link from 'next/link';
import { useAuth } from '@/lib/auth/auth-provider';
import { useVerificationStatus } from '@/hooks/use-verification';

interface FeatureRestrictionGateProps {
  children: ReactNode;
  /** Feature name to display in restriction message */
  featureName: string;
  /** Whether this feature requires verification (default: true) */
  requiresVerification?: boolean;
  /** Custom message to show when restricted */
  customMessage?: string;
  /** Fallback component to show while loading */
  loadingFallback?: ReactNode;
}

/**
 * Feature Restriction Gate
 *
 * Wraps portal features that require contact verification.
 * Shows a friendly message and link to profile if verification is incomplete.
 *
 * Usage:
 * ```tsx
 * <FeatureRestrictionGate featureName="payment history">
 *   <PaymentHistory />
 * </FeatureRestrictionGate>
 * ```
 */
export function FeatureRestrictionGate({
  children,
  featureName,
  requiresVerification = true,
  customMessage,
  loadingFallback,
}: FeatureRestrictionGateProps) {
  const { residentId } = useAuth();
  const { data: status, isLoading } = useVerificationStatus(residentId || undefined);

  // Show loading state
  if (isLoading) {
    return loadingFallback || null;
  }

  // If verification not required, render children
  if (!requiresVerification) {
    return <>{children}</>;
  }

  // Check verification status
  const hasEmail = !!status?.email?.value;
  const emailVerified = status?.email?.verified ?? false;
  const phoneVerified = status?.phone?.verified ?? false;

  // Email is complete if not present OR verified
  const emailComplete = !hasEmail || emailVerified;
  const phoneComplete = phoneVerified;
  const isVerified = emailComplete && phoneComplete;

  // If verified, render the feature
  if (isVerified) {
    return <>{children}</>;
  }

  // Build restriction message
  const missingItems: string[] = [];
  if (hasEmail && !emailVerified) {
    missingItems.push('email');
  }
  if (!phoneVerified) {
    missingItems.push('phone number');
  }

  const defaultMessage =
    missingItems.length === 1
      ? `To access ${featureName}, please verify your ${missingItems[0]}.`
      : `To access ${featureName}, please verify your ${missingItems.join(' and ')}.`;

  // Show restriction card
  return (
    <Card className="border-amber-200 bg-amber-50/50">
      <CardContent className="flex flex-col items-center justify-center py-12 px-6 text-center">
        <div className="p-3 rounded-full bg-amber-100 mb-4">
          <ShieldAlert className="h-8 w-8 text-amber-600" />
        </div>
        <h3 className="text-lg font-semibold text-amber-900 mb-2">
          Verification Required
        </h3>
        <p className="text-sm text-amber-700 mb-6 max-w-md">
          {customMessage || defaultMessage}
        </p>
        <Button asChild>
          <Link href="/portal/profile">
            Verify Now
            <ChevronRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/**
 * Hook to check if current resident has completed verification
 * Useful for conditional rendering without the gate component
 */
export function useVerificationRequired(): {
  isVerified: boolean;
  isLoading: boolean;
  missingItems: string[];
} {
  const { residentId } = useAuth();
  const { data: status, isLoading } = useVerificationStatus(residentId || undefined);

  if (isLoading || !status) {
    return { isVerified: false, isLoading: true, missingItems: [] };
  }

  const hasEmail = !!status.email?.value;
  const emailVerified = status.email?.verified ?? false;
  const phoneVerified = status.phone?.verified ?? false;

  const emailComplete = !hasEmail || emailVerified;
  const phoneComplete = phoneVerified;
  const isVerified = emailComplete && phoneComplete;

  const missingItems: string[] = [];
  if (hasEmail && !emailVerified) {
    missingItems.push('email');
  }
  if (!phoneVerified) {
    missingItems.push('phone');
  }

  return { isVerified, isLoading: false, missingItems };
}
