'use client';

import { Mail, Phone, Check, AlertCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

interface ContactVerificationBadgeProps {
  emailVerifiedAt: string | null;
  phoneVerifiedAt: string | null;
  hasEmail: boolean;
  className?: string;
}

export function ContactVerificationBadge({
  emailVerifiedAt,
  phoneVerifiedAt,
  hasEmail,
  className,
}: ContactVerificationBadgeProps) {
  const emailVerified = !!emailVerifiedAt;
  const phoneVerified = !!phoneVerifiedAt;
  const allVerified = (hasEmail ? emailVerified : true) && phoneVerified;
  const noneVerified = !emailVerified && !phoneVerified;

  // Format date for tooltip
  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Not verified';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn('flex items-center gap-1', className)}>
            {/* Email status */}
            {hasEmail && (
              <div
                className={cn(
                  'p-1 rounded-full',
                  emailVerified
                    ? 'bg-green-100 text-green-600'
                    : 'bg-amber-100 text-amber-600'
                )}
              >
                <Mail className="h-3 w-3" />
              </div>
            )}

            {/* Phone status */}
            <div
              className={cn(
                'p-1 rounded-full',
                phoneVerified
                  ? 'bg-green-100 text-green-600'
                  : 'bg-amber-100 text-amber-600'
              )}
            >
              <Phone className="h-3 w-3" />
            </div>

            {/* Overall status indicator */}
            {allVerified ? (
              <Check className="h-3.5 w-3.5 text-green-600" />
            ) : noneVerified ? (
              <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
            ) : null}
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs">
          <div className="space-y-1">
            {hasEmail && (
              <div className="flex items-center gap-2">
                <Mail className="h-3 w-3" />
                <span>Email: {formatDate(emailVerifiedAt)}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Phone className="h-3 w-3" />
              <span>Phone: {formatDate(phoneVerifiedAt)}</span>
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Compact version for table cells
 */
export function ContactVerificationBadgeCompact({
  emailVerifiedAt,
  phoneVerifiedAt,
  hasEmail,
}: ContactVerificationBadgeProps) {
  const emailVerified = !!emailVerifiedAt;
  const phoneVerified = !!phoneVerifiedAt;
  const allVerified = (hasEmail ? emailVerified : true) && phoneVerified;
  const noneVerified = !emailVerified && !phoneVerified;

  if (allVerified) {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
        <Check className="h-3 w-3 mr-1" />
        Verified
      </Badge>
    );
  }

  if (noneVerified) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Unverified
      </Badge>
    );
  }

  // Partial verification
  return (
    <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
      Partial
    </Badge>
  );
}

/**
 * Granular verification status badge for Personal Information section.
 * Shows specific verification states: Pending, Email Verified, Phone Verified, or Fully Verified.
 */
export function GranularVerificationBadge({
  emailVerifiedAt,
  phoneVerifiedAt,
  hasEmail,
  hasPhone = true,
}: ContactVerificationBadgeProps & { hasPhone?: boolean }) {
  const emailVerified = !!emailVerifiedAt;
  const phoneVerified = !!phoneVerifiedAt;

  // Calculate verification states
  const emailNeeded = hasEmail && !emailVerified;
  const phoneNeeded = hasPhone && !phoneVerified;
  const emailComplete = !hasEmail || emailVerified; // No email = considered complete
  const phoneComplete = !hasPhone || phoneVerified; // No phone = considered complete

  // Fully verified: all required contacts are verified
  if (emailComplete && phoneComplete) {
    return (
      <Badge variant="secondary" className="bg-green-100 text-green-700 border-green-200">
        <Check className="h-3 w-3 mr-1" />
        Fully Verified
      </Badge>
    );
  }

  // Nothing verified yet
  if (emailNeeded && phoneNeeded) {
    return (
      <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
        <AlertCircle className="h-3 w-3 mr-1" />
        Pending
      </Badge>
    );
  }

  // Only email verified
  if (emailVerified && !phoneVerified) {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
        <Mail className="h-3 w-3 mr-1" />
        Email Verified
      </Badge>
    );
  }

  // Only phone verified
  if (phoneVerified && !emailVerified) {
    return (
      <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
        <Phone className="h-3 w-3 mr-1" />
        Phone Verified
      </Badge>
    );
  }

  // Fallback (should not reach here)
  return (
    <Badge variant="secondary" className="bg-amber-100 text-amber-700 border-amber-200">
      <AlertCircle className="h-3 w-3 mr-1" />
      Pending
    </Badge>
  );
}
