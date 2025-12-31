'use client';

import { useState, useEffect } from 'react';
import { AlertTriangle, X, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

interface VerificationPromptBannerProps {
  emailVerified: boolean;
  phoneVerified: boolean;
  hasEmail: boolean;
}

const BANNER_DISMISSED_KEY = 'verification_banner_dismissed';

export function VerificationPromptBanner({
  emailVerified,
  phoneVerified,
  hasEmail,
}: VerificationPromptBannerProps) {
  const [isDismissed, setIsDismissed] = useState(true); // Start hidden to prevent flash

  useEffect(() => {
    // Check session storage on mount
    const dismissed = sessionStorage.getItem(BANNER_DISMISSED_KEY);
    setIsDismissed(dismissed === 'true');
  }, []);

  const handleDismiss = () => {
    sessionStorage.setItem(BANNER_DISMISSED_KEY, 'true');
    setIsDismissed(true);
  };

  // Don't show if everything is verified or if dismissed
  if ((emailVerified && phoneVerified) || isDismissed) {
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
