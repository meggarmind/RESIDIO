'use client';

import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { SecurityContactStatus, AccessCodeType } from '@/types/database';
import { SECURITY_CONTACT_STATUS_LABELS, ACCESS_CODE_TYPE_LABELS } from '@/types/database';
import { formatDateTime, getRelativeTimeDisplay } from '@/lib/utils';
import { Clock, CheckCircle, AlertTriangle, XCircle, Key, KeyRound } from 'lucide-react';

interface SecurityContactStatusBadgeProps {
  status: SecurityContactStatus;
}

export function SecurityContactStatusBadge({ status }: SecurityContactStatusBadgeProps) {
  const variants: Record<
    SecurityContactStatus,
    {
      variant: 'default' | 'secondary' | 'destructive' | 'outline';
      icon: React.ReactNode;
    }
  > = {
    active: { variant: 'default', icon: <CheckCircle className="mr-1 h-3 w-3" /> },
    suspended: { variant: 'secondary', icon: <Clock className="mr-1 h-3 w-3" /> },
    expired: { variant: 'outline', icon: <AlertTriangle className="mr-1 h-3 w-3" /> },
    revoked: { variant: 'destructive', icon: <XCircle className="mr-1 h-3 w-3" /> },
  };

  const { variant, icon } = variants[status];

  return (
    <Badge variant={variant} className="flex items-center">
      {icon}
      {SECURITY_CONTACT_STATUS_LABELS[status]}
    </Badge>
  );
}

interface AccessCodeTypeBadgeProps {
  type: AccessCodeType;
}

export function AccessCodeTypeBadge({ type }: AccessCodeTypeBadgeProps) {
  const variants: Record<
    AccessCodeType,
    {
      variant: 'default' | 'secondary' | 'outline';
      icon: React.ReactNode;
    }
  > = {
    permanent: { variant: 'default', icon: <Key className="mr-1 h-3 w-3" /> },
    one_time: { variant: 'outline', icon: <KeyRound className="mr-1 h-3 w-3" /> },
  };

  const { variant, icon } = variants[type];

  return (
    <Badge variant={variant} className="flex items-center">
      {icon}
      {ACCESS_CODE_TYPE_LABELS[type]}
    </Badge>
  );
}

interface ValidityBadgeProps {
  validUntil: string | null;
  validFrom?: string | null;
  isActive: boolean;
}

export function ValidityBadge({ validUntil, validFrom, isActive }: ValidityBadgeProps) {
  const expiryDisplay = validUntil ? formatDateTime(validUntil) : null;
  const fromDisplay = validFrom ? formatDateTime(validFrom) : null;
  const relativeTime = validUntil ? getRelativeTimeDisplay(validUntil) : null;
  const tooltipText = validUntil
    ? (fromDisplay ? `Valid from ${fromDisplay} to ${expiryDisplay}` : `Expires: ${expiryDisplay}`)
    : 'No expiry date';

  if (!isActive) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="flex items-center cursor-help">
              <XCircle className="mr-1 h-3 w-3" />
              Inactive
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  if (!validUntil) {
    return (
      <Badge variant="default" className="flex items-center">
        <CheckCircle className="mr-1 h-3 w-3" />
        Valid (No Expiry)
      </Badge>
    );
  }

  const now = new Date();
  const expiryDate = new Date(validUntil);
  const diffMs = expiryDate.getTime() - now.getTime();

  if (diffMs < 0) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="destructive" className="flex items-center cursor-help">
              <XCircle className="mr-1 h-3 w-3" />
              Expired
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>Expired: {expiryDisplay}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Show "Expiring Soon" if less than 7 days remaining
  const daysUntilExpiry = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (daysUntilExpiry <= 7) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Badge variant="outline" className="flex items-center text-yellow-600 border-yellow-600 cursor-help">
              <AlertTriangle className="mr-1 h-3 w-3" />
              Expiring Soon ({relativeTime})
            </Badge>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant="default" className="flex items-center cursor-help">
            <CheckCircle className="mr-1 h-3 w-3" />
            Valid ({relativeTime})
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <p>{tooltipText}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

interface FlaggedBadgeProps {
  flagged: boolean;
  reason?: string | null;
}

export function FlaggedBadge({ flagged, reason }: FlaggedBadgeProps) {
  if (!flagged) return null;

  return (
    <Badge variant="destructive" className="flex items-center" title={reason || undefined}>
      <AlertTriangle className="mr-1 h-3 w-3" />
      Flagged
    </Badge>
  );
}

interface CategoryBadgeProps {
  name: string;
  color?: 'default' | 'blue' | 'green' | 'orange';
}

export function CategoryBadge({ name, color = 'default' }: CategoryBadgeProps) {
  // Map category names to colors
  const categoryColors: Record<string, string> = {
    'Domestic Staff': 'bg-blue-100 text-blue-800 border-blue-200',
    'Service Provider': 'bg-green-100 text-green-800 border-green-200',
    'Visitor': 'bg-orange-100 text-orange-800 border-orange-200',
  };

  const colorClass = categoryColors[name] || 'bg-gray-100 text-gray-800 border-gray-200';

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${colorClass}`}>
      {name}
    </span>
  );
}
