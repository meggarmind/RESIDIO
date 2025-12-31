'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X, ChevronRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface VerificationPromptBannerProps {
  emailVerified: boolean;
  phoneVerified: boolean;
  hasEmail: boolean;
  /** Account creation date for determining dismissibility */
  createdAt?: string;
  /** Threshold in days after which banner becomes non-dismissible (default: 90) */
  persistentThresholdDays?: number;
}

const BANNER_DISMISSED_KEY = 'verification_banner_dismissed';
const DEFAULT_THRESHOLD_DAYS = 90;

/**
 * Calculate if account is older than threshold
 */
function isAccountOlderThan(createdAt: string | undefined, days: number): boolean {
  if (!createdAt) return false;
  const accountAge = Date.now() - new Date(createdAt).getTime();
  const thresholdMs = days * 24 * 60 * 60 * 1000;
  return accountAge > thresholdMs;
}

export function VerificationPromptBanner({
  emailVerified,
  phoneVerified,
  hasEmail,
  createdAt,
  persistentThresholdDays = DEFAULT_THRESHOLD_DAYS,
}: VerificationPromptBannerProps) {
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash

  // Determine if banner should be persistent (non-dismissible)
  const isPersistent = isAccountOlderThan(createdAt, persistentThresholdDays);

  useEffect(() => {
    if (isPersistent) {
      // For persistent banners, always show (cannot dismiss)
      setIsDismissed(false);
    } else {
      // Check session storage on mount for dismissible banners
      const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
      setIsDismissed(dismissed === 'true');
    }
  }, [isPersistent]);

  const handleDismiss = () => {
    if (isPersistent) return; // Cannot dismiss persistent banners
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setIsDismissed(true);
  };

  // Calculate verification status
  const emailComplete = !hasEmail || emailVerified; // No email = considered complete
  const phoneComplete = phoneVerified;
  const allVerified = emailComplete && phoneComplete;

  // Don't show if everything is verified or if dismissed (and not persistent)
  if (allVerified || (isDismissed && !isPersistent)) {
    return null;
  }

  // Determine what's missing
  const missingItems: string[] = [];
  if (!hasEmail) {
    missingItems.push('add an email address');
  } else if (!emailVerified) {
    missingItems.push('verify your email');
  }
  if (!phoneVerified) {
    missingItems.push('verify your phone number');
  }

  const message = missingItems.length === 1
    ? `Please ${missingItems[0]} to unlock all estate features.`
    : `Please ${missingItems.slice(0, -1).join(', ')} and ${missingItems[missingItems.length - 1]} to unlock all estate features.`;

  // Persistent banner uses a more prominent style
  if (isPersistent) {
    return (
      <div className="bg-red-50 border-b border-red-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-full bg-red-100 flex-shrink-0">
                <ShieldAlert className="h-5 w-5 text-red-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-red-800">
                  Contact verification required
                </p>
                <p className="text-sm text-red-700 mt-0.5">
                  {message} Some features are restricted until verification is complete.
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="text-red-700 border-red-300 hover:bg-red-100 flex-shrink-0"
              asChild
            >
              <Link href="/portal/profile">
                Verify Now
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Dismissible banner for newer accounts
  return (
    <div className="bg-amber-50 border-b border-amber-200">
      <div className="max-w-7xl mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-1.5 rounded-full bg-amber-100 flex-shrink-0">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
            </div>
            <p className="text-sm text-amber-800 truncate">
              {message}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-700 hover:text-amber-900 hover:bg-amber-100"
              asChild
            >
              <Link href="/portal/profile">
                Verify Now
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-amber-600 hover:text-amber-800 hover:bg-amber-100 p-1"
              onClick={handleDismiss}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Dismiss</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Checks if a resident has completed contact verification
 */
export function isContactVerificationComplete(
  emailVerified: boolean,
  phoneVerified: boolean,
  hasEmail: boolean
): boolean {
  const emailComplete = !hasEmail || emailVerified;
  const phoneComplete = phoneVerified;
  return emailComplete && phoneComplete;
}
